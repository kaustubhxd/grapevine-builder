import {
  streamText,
  generateText,
  convertToModelMessages,
  tool,
  stepCountIs,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { z } from "zod";
import type {
  ProjectContext,
  GrapevineRouteOptions,
  GrapevineUsage,
} from "../types.js";
import { composeSystemPrompt, buildCodeAgentPrompt } from "./prompts.js";
import { getToolMode } from "./tools.js";

/**
 * Build the tool definitions with execute functions for server tools.
 * Server tools (editComponentCode, etc.) spawn a sub-agent via generateText.
 * Client tools (getPageContent, etc.) have no execute — forwarded to client.
 */
function buildTools(
  options: GrapevineRouteOptions,
  projectContext: ProjectContext,
  tracking: { toolsUsed: string[]; inputTokens: number; outputTokens: number },
  onHtmlChunk?: (toolCallId: string, chunk: string) => void,
) {
  const subAgentModel = options.subAgentModel ?? options.model;

  /** Shared execute function for code generation tools */
  async function executeCodeTool(
    toolName: string,
    args: { instructions: string; [k: string]: unknown },
    toolCallId: string,
  ): Promise<string> {
    tracking.toolsUsed.push(toolName);
    const mode = getToolMode(toolName)!;
    const codePrompt = buildCodeAgentPrompt(mode, projectContext);

    if (onHtmlChunk) {
      // Stream sub-agent output chunk-by-chunk to the client canvas
      const stream = streamText({
        model: subAgentModel,
        system: codePrompt,
        prompt: args.instructions,
      });
      let fullText = "";
      for await (const chunk of stream.textStream) {
        fullText += chunk;
        onHtmlChunk(toolCallId, fullText); // pass accumulated, not just the delta
      }
      const usage = await stream.usage;
      if (usage) {
        tracking.inputTokens += usage.inputTokens || 0;
        tracking.outputTokens += usage.outputTokens || 0;
      }
      return fullText;
    } else {
      const codeResult = await generateText({
        model: subAgentModel,
        system: codePrompt,
        prompt: args.instructions,
      });
      if (codeResult.usage) {
        tracking.inputTokens += codeResult.usage.inputTokens || 0;
        tracking.outputTokens += codeResult.usage.outputTokens || 0;
      }
      return codeResult.text;
    }
  }

  return {
    // --- Server tools (have execute → resolved server-side) ---
    editComponentCode: tool({
      description:
        "Edit existing components in the current page. " +
        "Provide clear instructions about what to change. " +
        "The full page code is available to the code agent.",
      inputSchema: z.object({
        instructions: z
          .string()
          .describe("Detailed instructions for what to edit."),
      }),
      execute: async (args, { toolCallId }) =>
        executeCodeTool("editComponentCode", args, toolCallId),
    }),

    addComponentCode: tool({
      description:
        "Add a new component to the page at a specific position relative to an existing component.",
      inputSchema: z.object({
        instructions: z
          .string()
          .describe("Detailed instructions for the new component."),
        componentId: z
          .string()
          .optional()
          .describe("Target component ID to position relative to."),
        position: z
          .enum(["before", "after", "beforeInside", "afterInside"])
          .default("afterInside")
          .describe("Position relative to the target component."),
      }),
      execute: async (args, { toolCallId }) =>
        executeCodeTool("addComponentCode", args, toolCallId),
    }),

    addPageCode: tool({
      description: "Create a new page with full content.",
      inputSchema: z.object({
        instructions: z
          .string()
          .describe("Detailed instructions for the page."),
        name: z.string().describe("The name/title of the new page."),
      }),
      execute: async (args, { toolCallId }) =>
        executeCodeTool("addPageCode", args, toolCallId),
    }),

    addProjectPageCode: tool({
      description:
        "Create the first page in an empty project. ONLY use when IS_PROJECT_EMPTY is true.",
      inputSchema: z.object({
        instructions: z
          .string()
          .describe("Detailed instructions for the landing page."),
        name: z
          .string()
          .default("Home")
          .describe("The name/title of the page."),
      }),
      execute: async (args, { toolCallId }) =>
        executeCodeTool("addProjectPageCode", args, toolCallId),
    }),

    // --- Client tools (no execute → forwarded to client) ---
    getPageContent: tool({
      description:
        "Get the full HTML code of a page to inspect current content before editing.",
      inputSchema: z.object({
        pageId: z
          .string()
          .optional()
          .describe("Page ID. Omit for currently selected page."),
      }),
    }),

    removeComponent: tool({
      description: "Remove a component from the page by its ID.",
      inputSchema: z.object({
        componentId: z.string().describe("The component ID to remove."),
      }),
    }),

    moveComponent: tool({
      description:
        "Move a component to a new position inside a target component.",
      inputSchema: z.object({
        sourceId: z.string().describe("The component ID to move."),
        targetId: z.string().describe("The target container ID."),
        targetIndex: z.number().describe("Index position inside the target."),
      }),
    }),

    listPages: tool({
      description: "Get the list of all pages with their IDs and names.",
      inputSchema: z.object({}),
    }),

    runCommand: tool({
      description:
        "Run an editor command. Available: preview (toggle fullscreen preview).",
      inputSchema: z.object({
        commandId: z
          .string()
          .describe("The command to run (currently only 'preview')."),
      }),
    }),
  };
}

/**
 * Create a POST route handler for the Grapevine AI chat endpoint.
 *
 * Usage in a Next.js API route:
 * ```ts
 * import { createGrapevineRoute } from '@grapevine/builder/server'
 * export const POST = createGrapevineRoute({ model: openai('gpt-4o') })
 * ```
 */
export function createGrapevineRoute(options: GrapevineRouteOptions) {
  return async (req: Request): Promise<Response> => {
    const startTime = Date.now();
    const tracking = {
      toolsUsed: [] as string[],
      inputTokens: 0,
      outputTokens: 0,
    };

    try {
      const body = await req.json();
      const { messages, projectContext } = body as {
        messages: UIMessage[];
        projectContext: ProjectContext;
      };

      if (!messages?.length) {
        return new Response("Missing messages", { status: 400 });
      }
      if (!projectContext) {
        return new Response("Missing projectContext", { status: 400 });
      }

      const systemPrompt = composeSystemPrompt(
        projectContext,
        options.systemPrompt,
      );
      const maxRounds = options.maxRounds ?? 5;
      const modelMessages = await convertToModelMessages(messages);

      const stream = createUIMessageStream({
        execute: async ({ writer }) => {
          // When the sub-agent streams HTML, write preliminary tool outputs
          const onHtmlChunk = (toolCallId: string, accumulated: string) => {
            writer.write({
              type: "tool-output-available",
              toolCallId,
              output: accumulated,
              preliminary: true,
            } as UIMessageChunk);
          };

          const tools = buildTools(
            options,
            projectContext,
            tracking,
            onHtmlChunk,
          );

          const result = streamText({
            model: options.model,
            system: systemPrompt,
            messages: modelMessages,
            tools,
            stopWhen: stepCountIs(maxRounds),
            onStepFinish: (step) => {
              if (step.usage) {
                tracking.inputTokens += step.usage.inputTokens || 0;
                tracking.outputTokens += step.usage.outputTokens || 0;
              }
              if (step.toolCalls) {
                for (const call of step.toolCalls) {
                  if (!tracking.toolsUsed.includes(call.toolName)) {
                    tracking.toolsUsed.push(call.toolName);
                  }
                }
              }
            },
            onFinish: async (result) => {
              const modelId =
                typeof options.model === "string"
                  ? options.model
                  : options.model.modelId;

              const usage: GrapevineUsage = {
                promptTokens: tracking.inputTokens,
                completionTokens: tracking.outputTokens,
                totalTokens: tracking.inputTokens + tracking.outputTokens,
                modelId,
                finishReason: result.finishReason ?? "unknown",
                toolsUsed: tracking.toolsUsed,
                rounds: result.steps?.length ?? 1,
                durationMs: Date.now() - startTime,
              };

              try {
                await options.onFinish?.(usage);
              } catch {
                // Don't let onFinish errors crash the response
              }
            },
          });

          writer.merge(result.toUIMessageStream());
        },
      });

      return createUIMessageStreamResponse({ stream });
    } catch (error) {
      options.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
      return new Response(
        error instanceof Error ? error.message : "Internal server error",
        { status: 500 },
      );
    }
  };
}
