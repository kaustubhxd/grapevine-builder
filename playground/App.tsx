"use client";

import React, { useRef, useState } from "react";
import { GrapevineBuilder, ChatPanel } from "@grapevine/builder";
import type { GrapevineRef } from "@grapevine/builder";

/**
 * Playground — standalone dev environment for @grapevine/builder.
 *
 * Expects your API backend running at :3000 (proxied via vite.config.ts).
 * Change chatEndpoint / generateEndpoint to point at your own routes.
 */
export default function App() {
  const builderRef = useRef<GrapevineRef>(null);
  const [showChat, setShowChat] = useState(true);

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
        <button
          onClick={() => setShowChat((v) => !v)}
          style={{
            marginLeft: "auto",
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

      {/* Main content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Builder */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <GrapevineBuilder
            ref={builderRef}
            chatEndpoint="/api/grapes-ai-chat"
            generateEndpoint="/api/grapes-generate"
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
      </div>
    </div>
  );
}
