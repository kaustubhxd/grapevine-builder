import { createOpenAI } from "@ai-sdk/openai";
import { createGrapevineRoute } from "../src/server.js";

export const config = { maxDuration: 60 };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = req.headers.get("x-openai-api-key");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Missing API key header" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const openai = createOpenAI({ apiKey });
  const route = createGrapevineRoute({
    model: openai("gpt-5.4"),
    subAgentModel: openai("gpt-5.4"),
  });

  return route(req);
}
