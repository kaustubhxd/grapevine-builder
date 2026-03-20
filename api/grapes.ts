import { createOpenAI } from "@ai-sdk/openai";
import { createGrapevineRoute } from "../src/server.js";

export const config = { maxDuration: 60 };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = process.env.OPENAI_API_KEY ?? req.headers.get("x-openai-api-key");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Missing API key" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const baseURL = req.headers.get("x-openai-base-url") ?? undefined;
  const modelId = req.headers.get("x-openai-model") ?? "gpt-5.4";

  const openai = createOpenAI({ apiKey, baseURL });
  const route = createGrapevineRoute({
    model: openai(modelId),
    subAgentModel: openai(modelId),
  });

  return route(req);
}
