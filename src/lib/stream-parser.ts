import type { PendingClientTool } from "../types";

/**
 * AI SDK UIMessage stream protocol (from toUIMessageStreamResponse()):
 *
 * data: {"type":"start"}
 * data: {"type":"start-step"}
 * data: {"type":"text-delta","id":"...","delta":"..."}
 * data: {"type":"tool-input-available","toolCallId":"...","toolName":"...","input":{...}}
 * data: {"type":"tool-output-available","toolCallId":"...","output":"..."}
 * data: {"type":"finish-step"}
 * data: {"type":"finish","finishReason":"stop"}
 * data: [DONE]
 */

export interface StreamHandlers {
  onText: (text: string) => void;
  onToolCall: (call: {
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
  }) => void;
  onToolResult: (result: {
    toolCallId: string;
    toolName: string;
    result: unknown;
  }) => void;
  /** Called for each incremental HTML chunk while a server tool is streaming */
  onHtmlStreaming?: (info: { toolCallId: string; html: string }) => void;
  onStepFinish?: (info: { finishReason: string; isContinued: boolean }) => void;
  onFinish: (info: { finishReason: string }) => void;
}

interface StreamResult {
  finishReason: string | null;
  pendingClientTools: PendingClientTool[];
}

/**
 * Parse an AI SDK UIMessage stream response (SSE format from toUIMessageStreamResponse).
 */
export async function parseUIMessageStream(
  response: Response,
  handlers: StreamHandlers,
): Promise<StreamResult> {
  const resolvedToolIds = new Set<string>();
  const allToolCalls = new Map<
    string,
    { toolCallId: string; toolName: string; input: Record<string, unknown> }
  >();
  let finishReason: string | null = null;

  if (!response.body) return { finishReason, pendingClientTools: [] };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;

      // SSE format: "data: {...}"
      if (!trimmed.startsWith("data: ")) continue;
      const jsonStr = trimmed.slice(6);

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(jsonStr);
      } catch {
        continue;
      }

      const type = event.type as string;

      switch (type) {
        case "text-delta": {
          const delta = event.delta as string;
          if (delta) handlers.onText(delta);
          break;
        }
        case "tool-input-available": {
          const toolCallId = event.toolCallId as string;
          const toolName = event.toolName as string;
          const input = (event.input ?? {}) as Record<string, unknown>;
          allToolCalls.set(toolCallId, { toolCallId, toolName, input });
          handlers.onToolCall({ toolCallId, toolName, args: input });
          break;
        }
        case "tool-output-available": {
          const toolCallId = event.toolCallId as string;
          const output = event.output;
          const preliminary = event.preliminary as boolean | undefined;
          if (preliminary) {
            // Incremental HTML chunk from a streaming sub-agent
            handlers.onHtmlStreaming?.({ toolCallId, html: String(output) });
          } else {
            resolvedToolIds.add(toolCallId);
            const call = allToolCalls.get(toolCallId);
            handlers.onToolResult({
              toolCallId,
              toolName: call?.toolName ?? "",
              result: output,
            });
          }
          break;
        }
        case "finish-step": {
          handlers.onStepFinish?.({
            finishReason: "unknown",
            isContinued: false,
          });
          break;
        }
        case "finish": {
          const reason = (event.finishReason as string) ?? "stop";
          finishReason = reason;
          handlers.onFinish({ finishReason: reason });
          break;
        }
        case "error": {
          const errorText =
            (event.errorText as string) ??
            (event.message as string) ??
            "Unknown error";
          throw new Error(errorText);
        }
        // start, start-step, text-start, text-end, tool-input-start,
        // tool-input-delta — not needed for our logic
        default:
          break;
      }
    }
  }

  // Pending client tools = tool calls that weren't resolved server-side
  const pendingClientTools = Array.from(allToolCalls.values()).filter(
    (t) => !resolvedToolIds.has(t.toolCallId),
  );

  return { finishReason, pendingClientTools };
}
