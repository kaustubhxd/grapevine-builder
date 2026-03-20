"use client";

import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import GjsEditor from "@grapesjs/react";
import type { Editor } from "grapesjs";
import gjsBasicBlocks from "grapesjs-blocks-basic";
import { EventEmitter } from "../lib/event-emitter";
import { buildProjectContext } from "../lib/project-context";
import { applyToolResult, resolveClientTool } from "../lib/editor-tools";
import { exportHtml, exportAllPages } from "../lib/export-html";
import { parseUIMessageStream } from "../lib/stream-parser";
import { SERVER_TOOL_NAMES } from "../server/tools";
import type {
  GjsEditor as GjsEditorType,
  GrapevineBuilderProps,
  GrapevineRef,
  PageMetadata,
  PendingClientTool,
  SelectedComponent,
  Snapshot,
} from "../types";
import "../styles/editor.css";
import { Toolbar } from "./toolbar";

const ChatPanel = React.lazy(() =>
  import("./chat-panel").then((m) => ({ default: m.ChatPanel })),
);

/** Convert a data: URL to a File object for upload. */
function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "application/octet-stream";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

/**
 * The main GrapevineBuilder component.
 * Renders a GrapesJS canvas with a minimal toolbar and exposes an imperative
 * API for chat/generate/export operations via ref.
 */
export const GrapevineBuilder = forwardRef<GrapevineRef, GrapevineBuilderProps>(
  function GrapevineBuilder(props, ref) {
    const {
      chatEndpoint,
      generateEndpoint,
      headers: extraHeaders,
      onSave,
      onLoad,
      onAssetUpload,
      onAssetDelete,
      onChange,
      onSnapshot,
      initialHtml,
      projectType = "web",
      className,
      showChat,
      renderIdle,
      renderLoading,
      grapesjsUrl = "https://unpkg.com/grapesjs",
      grapesjsCssUrl = "https://unpkg.com/grapesjs/dist/css/grapes.min.css",
      exportFilename = "page.html",
    } = props;

    const editorRef = useRef<GjsEditorType | null>(null);
    const emitterRef = useRef(new EventEmitter());
    const onSaveRef = useRef(onSave);
    const onLoadRef = useRef(onLoad);
    const onAssetUploadRef = useRef(onAssetUpload);
    const onAssetDeleteRef = useRef(onAssetDelete);
    const onChangeRef = useRef(onChange);
    const onSnapshotRef = useRef(onSnapshot);
    const initialHtmlRef = useRef(initialHtml);
    const metadataRef = useRef<PageMetadata>({});
    const isDirtyRef = useRef(false);
    onSaveRef.current = onSave;
    onLoadRef.current = onLoad;
    onAssetUploadRef.current = onAssetUpload;
    onAssetDeleteRef.current = onAssetDelete;
    onChangeRef.current = onChange;
    onSnapshotRef.current = onSnapshot;
    initialHtmlRef.current = initialHtml;
    const conversationRef = useRef<
      {
        role: string;
        content: string;
        parts: { type: string; [k: string]: unknown }[];
      }[]
    >([]);
    const [isPreview, setIsPreview] = useState(false);
    const [activeDevice, setActiveDevice] = useState<
      "Desktop" | "Tablet" | "Mobile"
    >("Desktop");
    const [hasContent, setHasContent] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // -----------------------------------------------------------------------
    // Imperative handle
    // -----------------------------------------------------------------------

    useImperativeHandle(
      ref,
      () => ({
        chat: (
          instruction: string,
          images?: { mediaType: string; url: string; filename?: string }[],
        ) => handleChat(instruction, images),
        generate: (prompt: string) => handleGenerate(prompt),
        exportHtml: () => {
          const editor = editorRef.current;
          if (!editor) return { html: "", css: "", full: "" };
          return exportHtml(editor, metadataRef.current);
        },
        exportAllPages: () => {
          const editor = editorRef.current;
          if (!editor) return [];
          return exportAllPages(editor, metadataRef.current);
        },
        togglePreview: () => {
          if (isPreview) {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
            setIsPreview(false);
          } else {
            const editor = editorRef.current;
            if (!editor) return;
            const { full } = exportHtml(editor, metadataRef.current);
            const blob = new Blob([full], { type: "text/html" });
            setPreviewUrl(URL.createObjectURL(blob));
            setIsPreview(true);
          }
        },
        isDirty: () => isDirtyRef.current,
        getMetadata: () => ({ ...metadataRef.current }),
        setMetadata: (metadata) => {
          metadataRef.current = { ...metadataRef.current, ...metadata };
        },
        createSnapshot: (label) => {
          const editor = editorRef.current;
          const data = editor
            ? (editor.getProjectData() as object)
            : editor!.getHtml();
          const snapshot: Snapshot = {
            id: crypto.randomUUID(),
            label: label ?? new Date().toLocaleString(),
            timestamp: Date.now(),
            data,
          };
          onSnapshotRef.current?.(snapshot);
          return snapshot;
        },
        loadSnapshot: (data) => {
          const editor = editorRef.current;
          if (!editor) return;
          if (typeof data === "string") {
            editor.setComponents(data);
          } else {
            editor.loadProjectData(data as { pages: { name?: string; component: string }[] });
          }
          setHasContent(true);
        },
        undo: () => editorRef.current?.UndoManager.undo(),
        redo: () => editorRef.current?.UndoManager.redo(),
        getEditor: () => editorRef.current,
        on: (event, handler) => emitterRef.current.on(event, handler),
        off: (event, handler) => emitterRef.current.off(event, handler),
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [isPreview, previewUrl],
    );

    // -----------------------------------------------------------------------
    // Chat — multi-turn with client tool resolution
    // -----------------------------------------------------------------------

    const handleChat = useCallback(
      async (
        instruction: string,
        images?: { mediaType: string; url: string; filename?: string }[],
      ) => {
        const editor = editorRef.current;
        if (!editor || !instruction.trim()) return;

        const emitter = emitterRef.current;
        emitter.emit("chat:streaming", { text: "" });
        setIsLoading(true);

        // Upload images via onAssetUpload to get hosted URLs.
        // Images require either onAssetUpload or already-hosted http(s) URLs.
        // Base64 is not used — too slow to stream.
        let imageUrls: string[] = [];
        if (images?.length) {
          const uploadFn = onAssetUploadRef.current;
          // Separate already-hosted URLs from data URLs that need uploading
          const needsUpload: { img: (typeof images)[0]; index: number }[] = [];
          const hosted: { url: string; index: number }[] = [];

          for (let i = 0; i < images.length; i++) {
            const img = images[i];
            if (img.url.startsWith("http")) {
              hosted.push({ url: img.url, index: i });
            } else if (uploadFn) {
              needsUpload.push({ img, index: i });
            }
            // else: no upload handler + data URL → skip (can't use it)
          }

          // Pre-fill with nulls, then place URLs at correct indices
          imageUrls = new Array(images.length).fill("");

          for (const h of hosted) {
            imageUrls[h.index] = h.url;
          }

          if (needsUpload.length > 0 && uploadFn) {
            try {
              const files = needsUpload.map(({ img, index }) => {
                const name =
                  img.filename ??
                  `image-${index}.${img.mediaType.split("/")[1] || "png"}`;
                return dataUrlToFile(img.url, name);
              });
              const results = await uploadFn(files);
              for (let i = 0; i < needsUpload.length; i++) {
                imageUrls[needsUpload[i].index] = results[i].src;
              }
            } catch {
              // Upload failed — these images will be skipped
            }
          }
        }

        // Collect only the resolved hosted URLs
        const resolvedUrls = imageUrls.filter((u) => u.startsWith("http"));

        // Build message parts
        const parts: { type: string; [k: string]: unknown }[] = [
          { type: "text", text: instruction },
        ];

        // Add image file parts for AI vision (hosted URLs only)
        if (images?.length) {
          for (let i = 0; i < images.length; i++) {
            if (!imageUrls[i]?.startsWith("http")) continue;
            parts.push({
              type: "file",
              mediaType: images[i].mediaType,
              url: imageUrls[i],
            });
          }
        }

        // Append hosted image URLs as text so the AI uses them in <img> tags
        let content = instruction;
        if (resolvedUrls.length > 0) {
          content +=
            "\n\n[Attached images — use these URLs when placing them on the page:\n" +
            resolvedUrls.map((url, i) => `${i + 1}. ${url}`).join("\n") +
            "]";
          parts[0] = { type: "text", text: content };
        }

        conversationRef.current.push({
          role: "user",
          content,
          parts,
        });

        let assistantText = "";

        async function doRound(): Promise<PendingClientTool[]> {
          const projectCtx = buildProjectContext(editor!, projectType);
          const recentMessages = conversationRef.current.slice(-10);

          const response = await fetch(chatEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...extraHeaders },
            body: JSON.stringify({
              messages: recentMessages,
              projectContext: projectCtx,
            }),
          });

          if (!response.ok) {
            throw new Error(`Chat API error: ${response.status}`);
          }

          // Track tool calls by ID so we can look up input in onToolResult
          const toolCallInputs = new Map<
            string,
            { toolName: string; args: Record<string, unknown> }
          >();

          const { pendingClientTools } = await parseUIMessageStream(response, {
            onText: (text) => {
              assistantText += text;
              emitter.emit("chat:streaming", { text: assistantText });
            },
            onToolCall: (call) => {
              toolCallInputs.set(call.toolCallId, {
                toolName: call.toolName,
                args: call.args,
              });
              emitter.emit("tool:status", {
                name: call.toolName,
                status: "in-progress",
              });
            },
            onHtmlStreaming: ({ toolCallId, html }) => {
              // Live-preview full-page tools as they stream in (like handleGenerate)
              const call = toolCallInputs.get(toolCallId);
              const toolName = call?.toolName ?? "";
              if (
                toolName === "addProjectPageCode" ||
                toolName === "addPageCode"
              ) {
                const stripped = html
                  .replace(/^```[\w-]*\s*/m, "")
                  .replace(/\s*```\s*$/m, "")
                  .trim();
                if (stripped && stripped.includes("<")) {
                  // Skip mid-stream if <style> is still open
                  if (
                    stripped.includes("<style") &&
                    !stripped.includes("</style>")
                  )
                    return;
                  editor!.setComponents(stripped);
                  setHasContent(true);
                }
              }
            },
            onToolResult: (result) => {
              // Server tool result — apply to editor
              if (SERVER_TOOL_NAMES.has(result.toolName)) {
                const call = toolCallInputs.get(result.toolCallId);
                const input = (call?.args ?? {}) as Record<string, unknown>;
                applyToolResult(
                  editor!,
                  result.toolName,
                  input,
                  String(result.result),
                );
                setHasContent(true);
              }
              emitter.emit("tool:status", {
                name: result.toolName,
                status: "done",
              });
            },
            onFinish: () => {},
          });

          return pendingClientTools;
        }

        try {
          let pending = await doRound();

          const MAX_ROUNDS = 5;
          let round = 0;
          while (pending.length > 0 && round < MAX_ROUNDS) {
            round++;

            // Build message parts with resolved client tool results
            const parts: { type: string; [k: string]: unknown }[] = [];
            if (assistantText) {
              parts.push({ type: "text", text: assistantText });
            }
            for (const call of pending) {
              const result = resolveClientTool(editor, call);
              const output =
                result && typeof result === "object" ? result : (result ?? "");
              parts.push({
                type: "dynamic-tool",
                toolCallId: call.toolCallId,
                toolName: call.toolName,
                input: call.input,
                state: "output-available",
                output,
              });
            }

            conversationRef.current.push({
              role: "assistant",
              content: assistantText || "",
              parts,
            });
            assistantText = "";

            pending = await doRound();
          }

          // Finalize
          const finalText = assistantText || "Done!";
          conversationRef.current.push({
            role: "assistant",
            content: finalText,
            parts: [{ type: "text", text: finalText }],
          });

          emitter.emit("chat:done", { text: finalText });
          setIsLoading(false);

          // Auto-save after changes
          if (onSave) {
            await new Promise((r) => setTimeout(r, 150));
            await editor.store();
          }
        } catch {
          setIsLoading(false);
          emitterRef.current.emit("chat:done", {
            text: "Something went wrong. Please try again.",
            error: true,
          });
        }
      },
      [chatEndpoint, projectType, onSave],
    );

    // -----------------------------------------------------------------------
    // Generate — stream raw HTML into editor
    // -----------------------------------------------------------------------

    const handleGenerate = useCallback(
      async (prompt: string) => {
        const editor = editorRef.current;
        if (!editor || !prompt.trim()) return;

        emitterRef.current.emit("generation:start");
        setIsLoading(true);

        try {
          const response = await fetch(generateEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...extraHeaders },
            body: JSON.stringify({ prompt, type: projectType }),
          });

          if (!response.ok || !response.body) {
            throw new Error(`Generate API error: ${response.status}`);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let html = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            html += decoder.decode(value, { stream: true });
            // Throttled apply: skip if <style> tag is incomplete
            if (html.includes("<style") && !html.includes("</style>")) continue;
            editor.setComponents(
              html
                .replace(/^```html\s*/i, "")
                .replace(/^```\s*/i, "")
                .replace(/\s*```$/i, "")
                .trim(),
            );
          }

          // Final apply
          editor.setComponents(
            html
              .replace(/^```html\s*/i, "")
              .replace(/^```\s*/i, "")
              .replace(/\s*```$/i, "")
              .trim(),
          );

          if (onSave) {
            await new Promise((r) => setTimeout(r, 150));
            await editor.store();
          }
        } finally {
          setIsLoading(false);
          emitterRef.current.emit("generation:done");
        }
      },
      [generateEndpoint, projectType, onSave],
    );

    // -----------------------------------------------------------------------
    // Editor event wiring
    // -----------------------------------------------------------------------

    // GrapesJS plugin that registers custom storage BEFORE autoload runs
    const storagePlugin = useCallback((editor: Editor) => {
      editor.StorageManager.add(
        "grapevine" as never,
        {
          async load() {
            if (onLoadRef.current) return onLoadRef.current();
            return {};
          },
          async store(data: object) {
            if (onSaveRef.current) await onSaveRef.current(data);
          },
        } as never,
      );
    }, []);

    const handleEditorInit = useCallback((editor: Editor) => {
      const gjsEditor = editor as unknown as GjsEditorType;
      editorRef.current = gjsEditor;

      // Selection tracking
      const updateSelection = () => {
        const all = gjsEditor.getSelectedAll
          ? gjsEditor.getSelectedAll()
          : [gjsEditor.getSelected()].filter(Boolean);
        const selected: SelectedComponent[] = (
          all as NonNullable<(typeof all)[0]>[]
        )
          .filter((c) => typeof c.getId === "function")
          .map((c) => {
            const el = c.getEl();
            return {
              id: c.getId(),
              tag: el?.tagName?.toLowerCase() || "div",
              classes: Array.from(el?.classList || [])
                .slice(0, 3)
                .join(" "),
            };
          });

        if (selected.length > 0) {
          emitterRef.current.emit("component:selected", selected);
        } else {
          emitterRef.current.emit("component:deselected", null);
        }
      };

      gjsEditor.on("component:selected", updateSelection);
      gjsEditor.on("component:deselected", updateSelection);

      // Dirty state tracking
      const markDirty = () => {
        if (!isDirtyRef.current) {
          isDirtyRef.current = true;
          onChangeRef.current?.({ isDirty: true });
        }
      };
      gjsEditor.on("component:add", markDirty);
      gjsEditor.on("component:remove", markDirty);
      gjsEditor.on("component:update", markDirty);
      gjsEditor.on("style:update", markDirty);
      gjsEditor.on("storage:store", () => {
        if (isDirtyRef.current) {
          isDirtyRef.current = false;
          onChangeRef.current?.({ isDirty: false });
        }
      });

      // Wire onAssetDelete
      if (onAssetDeleteRef.current) {
        gjsEditor.AssetManager?.on("asset:remove", (asset: unknown) => {
          const src = (asset as { get?: (k: string) => string }).get?.("src");
          if (src) onAssetDeleteRef.current?.([src]);
        });
      }

      // Hide shimmer once real content is loaded/added
      const checkContent = () => {
        const wrapper = gjsEditor.DomComponents?.getWrapper?.();
        if (wrapper) {
          const children = wrapper.components?.();
          if (children && children.length > 0) {
            setHasContent(true);
            gjsEditor.off("component:add", checkContent);
          }
        }
      };
      gjsEditor.on("component:add", checkContent);
      // Also check after initial load completes
      gjsEditor.on("load", () => {
        checkContent();
        // Apply initialHtml after load — takes priority over onLoad data
        if (initialHtmlRef.current) {
          gjsEditor.setComponents(initialHtmlRef.current);
          setHasContent(true);
        }
      });

      emitterRef.current.emit("ready");
    }, []);

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
      <div
        className={`grapevine-builder ${showChat ? "grapevine-builder--with-chat" : ""} ${className || ""}`}
      >
        <div className="grapevine-canvas-col">
          <Toolbar
            onUndo={() => editorRef.current?.UndoManager.undo()}
            onRedo={() => editorRef.current?.UndoManager.redo()}
            onDeviceChange={(device) => {
              const editor = editorRef.current;
              if (!editor) return;
              // OSS GrapesJS uses runCommand to set device
              (
                editor as unknown as { setDevice: (name: string) => void }
              ).setDevice(device);
              setActiveDevice(device);
            }}
            activeDevice={activeDevice}
            onPreview={() => {
              if (isPreview) {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
                setIsPreview(false);
              } else {
                const editor = editorRef.current;
                if (!editor) return;
                const { full } = exportHtml(editor, metadataRef.current);
                const blob = new Blob([full], { type: "text/html" });
                setPreviewUrl(URL.createObjectURL(blob));
                setIsPreview(true);
              }
            }}
            onExport={() => {
              const editor = editorRef.current;
              if (!editor) return;
              const { full } = exportHtml(editor, metadataRef.current);
              const a = document.createElement("a");
              a.href = URL.createObjectURL(
                new Blob([full], { type: "text/html" }),
              );
              a.download = exportFilename;
              a.click();
              URL.revokeObjectURL(a.href);
              emitterRef.current.emit("save", { html: full });
            }}
            isPreview={isPreview}
          />
          <div className="grapevine-editor-wrapper">
            {!hasContent && !isLoading && (
              <div className="grapevine-overlay">
                {renderIdle ? (
                  renderIdle()
                ) : (
                  <div className="grapevine-idle-state">
                    <div className="grapevine-idle-icon">
                      <svg
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect
                          x="3"
                          y="3"
                          width="18"
                          height="18"
                          rx="2"
                          ry="2"
                        />
                        <line x1="3" y1="9" x2="21" y2="9" />
                        <line x1="9" y1="21" x2="9" y2="9" />
                      </svg>
                    </div>
                    <p className="grapevine-idle-text">
                      Send a message to start building your page
                    </p>
                  </div>
                )}
              </div>
            )}
            {!hasContent && isLoading && (
              <div className="grapevine-overlay">
                {renderLoading ? (
                  renderLoading()
                ) : (
                  <div className="grapevine-loading-state">
                    <div className="grapevine-spinner" />
                    <p className="grapevine-loading-text">
                      Generating your page&hellip;
                    </p>
                  </div>
                )}
              </div>
            )}
            {previewUrl && (
              <iframe
                src={previewUrl}
                className="grapevine-preview-frame"
                title="Preview"
                sandbox="allow-scripts allow-same-origin"
              />
            )}
            <GjsEditor
              className="grapevine-editor"
              grapesjs={grapesjsUrl as string}
              grapesjsCss={grapesjsCssUrl as string}
              options={{
                height: "100%",
                storageManager: onSave
                  ? {
                      type: "grapevine",
                      autosave: true,
                      autoload: true,
                      stepsBeforeSave: 3,
                    }
                  : { type: "" as const },
                panels: { defaults: [] },
                blockManager: { appendTo: "" },
                styleManager: { appendTo: "" },
                layerManager: { appendTo: "" },
                assetManager: {
                  uploadFile: onAssetUpload
                    ? async (ev: DragEvent | Event) => {
                        const files = Array.from(
                          (ev as DragEvent).dataTransfer?.files ??
                            (ev.target as HTMLInputElement)?.files ??
                            [],
                        );
                        if (!files.length || !onAssetUploadRef.current) return;
                        const results = await onAssetUploadRef.current(files);
                        const editor = editorRef.current;
                        if (editor) {
                          for (const r of results) {
                            (
                              editor as unknown as {
                                AssetManager: {
                                  add: (a: {
                                    src: string;
                                    type: string;
                                  }) => void;
                                };
                              }
                            ).AssetManager.add({ src: r.src, type: "image" });
                          }
                        }
                      }
                    : undefined,
                },
                deviceManager: {
                  devices: [
                    { name: "Desktop", width: "" },
                    { name: "Tablet", width: "768px", widthMedia: "992px" },
                    { name: "Mobile", width: "375px", widthMedia: "480px" },
                  ],
                },
                parser: {
                  optionsHtml: { allowScripts: true },
                },
                plugins: [storagePlugin, gjsBasicBlocks],
                pluginsOpts: {
                  [gjsBasicBlocks as unknown as string]: {
                    flexGrid: true,
                  },
                },
              }}
              onEditor={handleEditorInit}
            />
          </div>
          {showChat && (
            <React.Suspense fallback={null}>
              <ChatPanel
                onChat={handleChat}
                onEvent={(event, handler) =>
                  emitterRef.current.on(event, handler)
                }
                offEvent={(event, handler) =>
                  emitterRef.current.off(event, handler)
                }
                onAssetUpload={onAssetUpload}
                className="grapevine-chat-sidebar"
              />
            </React.Suspense>
          )}
        </div>
      </div>
    );
  },
);
