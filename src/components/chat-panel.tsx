"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { GrapevineRef } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  images?: string[];
}

type ChatPanelProps = {
  className?: string;
  /** Accept file types for image attachments. Defaults to "image/*" */
  acceptFileTypes?: string;
  /** Called when user attaches files — should upload and return hosted URLs */
  onAssetUpload?: (
    files: File[],
    callbacks?: { onProgress?: (fraction: number) => void },
  ) => Promise<{ src: string }[]>;
} & (
  | {
      /** Pass a ref to a GrapevineBuilder instance (external usage) */
      builderRef: RefObject<GrapevineRef | null>;
      onChat?: never;
      onEvent?: never;
      offEvent?: never;
    }
  | {
      builderRef?: never;
      /** Direct chat callback (internal usage inside GrapevineBuilder) */
      onChat: (
        instruction: string,
        images?: { mediaType: string; url: string; filename?: string }[],
      ) => Promise<void>;
      onEvent: (event: string, handler: (...args: unknown[]) => void) => void;
      offEvent: (event: string, handler: (...args: unknown[]) => void) => void;
    }
);

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

export function ChatPanel(props: ChatPanelProps) {
  const { className, acceptFileTypes = "image/*", onAssetUpload } = props;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [attachedImages, setAttachedImages] = useState<
    { file: File; preview: string }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Listen to builder events
  useEffect(() => {
    let onFn:
      | ((event: string, handler: (...args: unknown[]) => void) => void)
      | undefined;
    let offFn:
      | ((event: string, handler: (...args: unknown[]) => void) => void)
      | undefined;

    if (props.onChat) {
      onFn = props.onEvent;
      offFn = props.offEvent;
    } else if (props.builderRef?.current) {
      const b = props.builderRef.current;
      // GrapevineRef.on/off use GrapevineEvent union; cast to string for local use
      onFn = b.on.bind(b) as unknown as typeof onFn;
      offFn = b.off.bind(b) as unknown as typeof offFn;
    }
    if (!onFn || !offFn) return;

    const onStreaming = (data: unknown) => {
      const { text } = data as { text: string };
      setIsStreaming(true);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return [...prev.slice(0, -1), { ...last, text }];
        }
        return [...prev, { id: crypto.randomUUID(), role: "assistant", text }];
      });
    };

    const onDone = (data: unknown) => {
      const { text } = data as { text: string };
      setIsStreaming(false);
      setToolStatus(null);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return [...prev.slice(0, -1), { ...last, text }];
        }
        return [...prev, { id: crypto.randomUUID(), role: "assistant", text }];
      });
    };

    const onToolStatus = (data: unknown) => {
      const { name, status } = data as { name: string; status: string };
      if (status === "done") {
        setToolStatus("Applying changes…");
        return;
      }
      if (status !== "in-progress") {
        setToolStatus(null);
        return;
      }
      const friendlyNames: Record<string, string> = {
        editComponentCode: "Editing component…",
        addComponentCode: "Adding component…",
        addPageCode: "Building page…",
        addProjectPageCode: "Adding page…",
        getPageContent: "Reading page…",
        removeComponent: "Removing component…",
        moveComponent: "Moving component…",
        listPages: "Checking pages…",
        runCommand: "Applying setting…",
        assetUpload: "Uploading image…",
      };
      setToolStatus(friendlyNames[name] ?? "Working…");
    };

    onFn("chat:streaming", onStreaming);
    onFn("chat:done", onDone);
    onFn("tool:status", onToolStatus);

    return () => {
      offFn("chat:streaming", onStreaming);
      offFn("chat:done", onDone);
      offFn("tool:status", onToolStatus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 150) + "px";
  }, [input]);

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    // Upload attached images first
    let imagePayload:
      | { mediaType: string; url: string; filename?: string }[]
      | undefined;

    if (attachedImages.length > 0 && onAssetUpload) {
      try {
        const results = await onAssetUpload(
          attachedImages.map((a) => a.file),
          {
            onProgress: (fraction) => {
              setToolStatus(
                fraction < 1
                  ? `Uploading image… ${Math.round(fraction * 100)}%`
                  : "Uploading image…",
              );
            },
          },
        );
        setToolStatus(null);
        imagePayload = results.map((r, i) => ({
          mediaType: attachedImages[i].file.type,
          url: r.src,
          filename: attachedImages[i].file.name,
        }));
      } catch {
        setToolStatus(null);
        // Upload failed — send without images
      }
    }

    // Add user message
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        text,
        images: imagePayload?.map((i) => i.url),
      },
    ]);
    setInput("");
    setAttachedImages([]);

    // Send to builder
    if (props.onChat) {
      props.onChat(text, imagePayload);
    } else {
      props.builderRef?.current?.chat(text, imagePayload);
    }
  }, [input, isStreaming, attachedImages, onAssetUpload, props]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      const newAttachments = files.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      }));
      setAttachedImages((prev) => [...prev, ...newAttachments]);
      e.target.value = "";
    },
    [],
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachedImages((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  return (
    <div className={`gvn-chat-panel ${className || ""}`}>
      {/* Messages */}
      <div className="gvn-chat-messages">
        {messages.length === 0 ? (
          <div className="gvn-chat-empty">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p>Send a message to start building your page</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`gvn-chat-msg gvn-chat-msg-${msg.role}`}
            >
              {msg.images && msg.images.length > 0 && (
                <div className="gvn-chat-msg-images">
                  {msg.images.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt={`attachment ${i + 1}`}
                      className="gvn-chat-msg-img"
                    />
                  ))}
                </div>
              )}
              <div className="gvn-chat-msg-text">
                {msg.role === "assistant" ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.text}
                  </ReactMarkdown>
                ) : (
                  msg.text
                )}
              </div>
            </div>
          ))
        )}

        {/* Streaming / tool status indicator */}
        {isStreaming && toolStatus && (
          <div className="gvn-chat-status">
            <div className="gvn-chat-spinner" />
            <span>{toolStatus}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="gvn-chat-input-area">
        {/* Attachment previews */}
        {attachedImages.length > 0 && (
          <div className="gvn-chat-attachments">
            {attachedImages.map((a, i) => (
              <div key={i} className="gvn-chat-attachment">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.preview} alt="attachment preview" />
                <button
                  onClick={() => removeAttachment(i)}
                  className="gvn-chat-attachment-remove"
                  aria-label="Remove attachment"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="gvn-chat-input-row">
          {/* File input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptFileTypes}
            multiple
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
          <button
            className="gvn-chat-btn gvn-chat-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach image"
            disabled={isStreaming}
            aria-label="Attach image"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>

          <textarea
            ref={textareaRef}
            className="gvn-chat-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what to build…"
            rows={1}
            disabled={isStreaming}
          />

          <button
            className="gvn-chat-btn gvn-chat-send-btn"
            onClick={handleSubmit}
            disabled={!input.trim() || isStreaming}
            aria-label="Send message"
          >
            {isStreaming ? (
              <div className="gvn-chat-spinner" />
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
