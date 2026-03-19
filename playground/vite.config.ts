import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { config as dotenvConfig } from "dotenv";

// Local .env takes priority, fallback to monorepo root .env.local
dotenvConfig({ path: path.resolve(__dirname, "../.env") });
dotenvConfig({ path: path.resolve(__dirname, "../../../.env.local") });

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [
    react(),
    {
      name: "grapevine-api",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith("/api/grapes-")) return next();

          // Lazy-import so Vite can resolve the workspace alias
          const { createGrapevineRoute } = await import(
            "../src/server.ts" as string
          );
          const { createOpenAI } = await import("@ai-sdk/openai");

          const apiKey = process.env.OPENAI_API_KEY;
          if (!apiKey) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error:
                  "OPENAI_API_KEY not set. Create a .env file in packages/grapevine-builder/ with OPENAI_API_KEY=sk-...",
              }),
            );
            return;
          }

          const openai = createOpenAI({ apiKey });
          const handler = createGrapevineRoute({
            model: openai("gpt-5.4"),
            subAgentModel: openai("gpt-5.4"),
          });

          // Read body
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const body = Buffer.concat(chunks).toString();

          // Build a standard Request
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body,
          });

          const response = await handler(request);

          res.writeHead(response.status, Object.fromEntries(response.headers));
          if (response.body) {
            const reader = response.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
            }
          }
          res.end();
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@grapevine/builder": path.resolve(__dirname, "../src/index.ts"),
    },
  },
  server: {
    port: 3333,
  },
});
