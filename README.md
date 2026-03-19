# @grapevine/builder

AI-powered website builder component built on [GrapesJS](https://grapesjs.com/). Drop it into any React app and let users build pages through natural-language chat.

## Install

```bash
pnpm add @grapevine/builder
```

**Peer dependencies** (install these yourself):

```bash
pnpm add ai zod react react-dom
```

## Quick Start

### 1. Create the API route

The server export gives you a ready-made route handler that works with Next.js App Router (or any framework that accepts `Request → Response`).

```ts
// app/api/builder-chat/route.ts
import { createGrapevineRoute } from "@grapevine/builder/server";
import { openai } from "@ai-sdk/openai";

export const POST = createGrapevineRoute({
  model: openai("gpt-4o"),
});
```

### 2. Render the builder

```tsx
"use client";
import { useRef } from "react";
import { GrapevineBuilder } from "@grapevine/builder";
import type { GrapevineRef } from "@grapevine/builder";

export default function BuilderPage() {
  const ref = useRef<GrapevineRef>(null);

  return (
    <div style={{ height: "100vh" }}>
      <GrapevineBuilder
        ref={ref}
        chatEndpoint="/api/builder-chat"
        generateEndpoint="/api/builder-generate"
        onSave={async (project) => {
          // Save the GrapesJS project JSON anywhere you like
          await fetch("/api/save", {
            method: "POST",
            body: JSON.stringify(project),
          });
        }}
        onLoad={async () => {
          // Return the same JSON on next load
          const res = await fetch("/api/load");
          return res.json();
        }}
      />
    </div>
  );
}
```

That's it — the component renders a full-screen canvas with a toolbar (undo/redo, device switcher, preview, download).

## API

### `<GrapevineBuilder>` Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `chatEndpoint` | `string` | ✅ | — | URL of the chat API route |
| `generateEndpoint` | `string` | ✅ | — | URL of the generate API route |
| `onSave` | `(project: object) => Promise<void>` | — | — | Called on autosave (every 3 undo steps). Omit to disable persistence. |
| `onLoad` | `() => Promise<object>` | — | — | Called on mount to restore project data |
| `onAssetUpload` | `(files: File[]) => Promise<{src: string}[]>` | — | — | Handle image uploads |
| `projectType` | `"web"` | — | `"web"` | Reserved for future project types |
| `className` | `string` | — | — | CSS class on the root element |
| `renderIdle` | `() => ReactNode` | — | Built-in | Custom empty-state overlay |
| `renderLoading` | `() => ReactNode` | — | Built-in | Custom loading overlay |
| `grapesjsUrl` | `string` | — | unpkg CDN | Override GrapesJS library URL |
| `grapesjsCssUrl` | `string` | — | unpkg CDN | Override GrapesJS CSS URL |
| `exportFilename` | `string` | — | `"page.html"` | Filename for the download button |

### `GrapevineRef` (imperative handle)

Access via `ref`:

```ts
const ref = useRef<GrapevineRef>(null);

ref.current.chat("Add a hero section");      // multi-turn AI chat
ref.current.generate("A simple landing page"); // raw HTML generation
ref.current.exportHtml();                     // { html, css, full }
ref.current.togglePreview();                  // live preview with JS
ref.current.undo();
ref.current.redo();
ref.current.getEditor();                      // raw GrapesJS editor
ref.current.on("chat:done", callback);        // event listener
ref.current.off("chat:done", callback);
```

### Events

Subscribe via `ref.current.on(event, handler)`:

| Event | Payload | Description |
|-------|---------|-------------|
| `ready` | — | Editor initialized |
| `chat:streaming` | `{ text }` | Streaming assistant text |
| `chat:done` | `{ text }` | Chat turn complete |
| `tool:status` | `{ name, status }` | Tool execution progress |
| `component:selected` | `SelectedComponent[]` | Component(s) selected |
| `component:deselected` | `null` | Selection cleared |
| `generation:start` | — | Generate started |
| `generation:done` | — | Generate finished |
| `save` | `{ html }` | Download button clicked |

### `createGrapevineRoute(options)`

Server-side route handler factory.

```ts
createGrapevineRoute({
  model: openai("gpt-4o"),            // Required — main LLM
  subAgentModel: openai("gpt-4o-mini"), // Optional — model for code generation sub-tasks
  systemPrompt: "You are a web design expert", // Optional — prepended to system prompt
  maxRounds: 5,                        // Optional — max tool-use rounds per turn
  onFinish: async (usage) => {         // Optional — called after each response
    console.log(usage.totalTokens);
  },
  onError: (err) => console.error(err), // Optional — error handler
});
```

## Storage

The package is **storage-agnostic**. The `onSave`/`onLoad` props accept any async function — Supabase, localStorage, S3, Firebase, a REST API, whatever you want.

If `onSave` is omitted, autosave and autoload are disabled entirely (ephemeral editing).

The project data is a plain JSON object (GrapesJS project format — pages, components, styles).

## Exports

### Client (`@grapevine/builder`)

- `GrapevineBuilder` — React component
- `Toolbar` — Standalone toolbar component
- Types: `GrapevineBuilderProps`, `GrapevineRef`, `GrapevineEvent`, `SelectedComponent`, `GjsEditor`, `GjsComponent`, `GjsPage`, `GrapevineUsage`, `GrapevineRouteOptions`, `ProjectContext`, `DeviceType`

### Server (`@grapevine/builder/server`)

- `createGrapevineRoute` — Route handler factory
- `SERVER_TOOL_NAMES` — Set of server-resolved tool names
- `CLIENT_TOOL_NAMES` — Set of client-resolved tool names
- Types: `GrapevineRouteOptions`, `GrapevineUsage`

## Architecture

```
┌─────────────┐      POST /api/chat       ┌──────────────────┐
│  Browser     │ ──────────────────────▶  │  API Route        │
│              │                          │  createGrapevine  │
│  Grapevine   │  ◀── SSE stream ──────  │  Route()          │
│  Builder     │                          │                   │
│              │  tool calls:             │  model ──▶ tools  │
│  ┌─────────┐ │  getPageContent          │  ┌─────────────┐  │
│  │ GrapesJS│ │  removeComponent ◀──────▶│  │ Server tools│  │
│  │ Canvas  │ │  listPages               │  │ (sub-agent  │  │
│  └─────────┘ │                          │  │  code gen)  │  │
│              │  server tool results:    │  └─────────────┘  │
│  applyTool   │  editComponentCode      │                   │
│  Result()    │  addComponentCode  ────▶ │                   │
└─────────────┘                          └──────────────────┘
```

**Client tools** (e.g., `getPageContent`) are resolved in the browser by reading from the live GrapesJS editor.

**Server tools** (e.g., `editComponentCode`) spawn a sub-agent that generates HTML/CSS code, which is streamed back and applied to the editor.

## License

MIT
