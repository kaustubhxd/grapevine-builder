"use client";

import React, { useRef, useState, useCallback, useMemo } from "react";
import { GrapevineBuilder, ChatPanel } from "@grapevine/builder";
import type { GrapevineRef } from "@grapevine/builder";

const API_KEY_STORAGE_KEY = "grapevine_openai_key";

function getStoredKey(): string {
  try {
    return sessionStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function storeKey(key: string) {
  try {
    sessionStorage.setItem(API_KEY_STORAGE_KEY, key);
  } catch {
    // sessionStorage unavailable (e.g. private browsing in some browsers)
  }
}

function clearKey() {
  try {
    sessionStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {}
}

/** Screen shown when no API key is set. */
function ApiKeyScreen({ onSubmit }: { onSubmit: (key: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#111",
        fontFamily: "sans-serif",
        color: "#eee",
      }}
    >
      <div
        style={{
          width: 420,
          padding: 32,
          background: "#1a1a1a",
          border: "1px solid #333",
          borderRadius: 12,
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>
          @grapevine/builder playground
        </h2>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#999" }}>
          Enter your OpenAI API key to try the builder. Your key is stored only
          in <strong>sessionStorage</strong> (cleared when you close this tab)
          and is sent directly to OpenAI over HTTPS — it is never logged or
          persisted on any server.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) onSubmit(value.trim());
          }}
        >
          <input
            type="password"
            placeholder="sk-..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            style={{
              width: "100%",
              padding: "10px 12px",
              background: "#0a0a0a",
              border: "1px solid #444",
              borderRadius: 8,
              color: "#eee",
              fontSize: 14,
              outline: "none",
              marginBottom: 12,
            }}
          />
          <button
            type="submit"
            disabled={!value.trim()}
            style={{
              width: "100%",
              padding: "10px 0",
              background: value.trim() ? "#fff" : "#333",
              color: value.trim() ? "#000" : "#666",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: value.trim() ? "pointer" : "default",
            }}
          >
            Start Building
          </button>
        </form>

        <p style={{ margin: "16px 0 0", fontSize: 11, color: "#666" }}>
          Need a key?{" "}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#888" }}
          >
            Get one from OpenAI →
          </a>
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const builderRef = useRef<GrapevineRef>(null);
  const [showChat, setShowChat] = useState(true);
  const [apiKey, setApiKey] = useState(getStoredKey);

  const handleKeySubmit = useCallback((key: string) => {
    storeKey(key);
    setApiKey(key);
  }, []);

  const handleClearKey = useCallback(() => {
    clearKey();
    setApiKey("");
  }, []);

  /** Headers sent with every API request — carries the user's key. */
  const requestHeaders = useMemo(
    () => ({ "x-openai-api-key": apiKey }),
    [apiKey],
  );

  if (!apiKey) {
    return <ApiKeyScreen onSubmit={handleKeySubmit} />;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        fontFamily: "sans-serif",
        background: "#111",
        color: "#eee",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 16px",
          background: "#1a1a1a",
          borderBottom: "1px solid #333",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <strong style={{ fontSize: 14 }}>@grapevine/builder playground</strong>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={handleClearKey}
            style={{
              padding: "4px 12px",
              background: "transparent",
              border: "1px solid #555",
              borderRadius: 6,
              color: "#999",
              cursor: "pointer",
              fontSize: 12,
            }}
            title="Clears your API key from sessionStorage"
          >
            Clear Key
          </button>
          <button
            onClick={() => setShowChat((v) => !v)}
            style={{
              padding: "4px 12px",
              background: "#333",
              border: "1px solid #555",
              borderRadius: 6,
              color: "#eee",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {showChat ? "Hide Chat" : "Show Chat"}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Chat panel */}
        {showChat && (
          <div
            style={{
              width: 360,
              borderLeft: "1px solid #333",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <ChatPanel builderRef={builderRef} />
          </div>
        )}

        <div style={{ flex: 1, overflow: "hidden" }}>
          <GrapevineBuilder
            ref={builderRef}
            chatEndpoint="/api/grapes-ai-chat"
            generateEndpoint="/api/grapes-generate"
            headers={requestHeaders}
            showChat={false}
            onSave={async (project) => {
              console.log("save", project);
            }}
            onLoad={async () => {
              return {};
            }}
            className="h-full"
          />
        </div>
      </div>
    </div>
  );
}
