"use client";

import React, { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { GrapevineBuilder, ChatPanel } from "@grapevine/builder";
import type { GrapevineRef } from "@grapevine/builder";

const PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    baseURL: undefined as string | undefined,
    keyPlaceholder: "sk-...",
    keyLink: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-5.4", label: "GPT-5.4" },
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o mini" },
      { id: "o3", label: "o3" },
      { id: "o4-mini", label: "o4-mini" },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseURL: "https://api.anthropic.com/v1",
    keyPlaceholder: "sk-ant-...",
    keyLink: "https://console.anthropic.com/settings/keys",
    models: [
      { id: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet" },
      { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
      { id: "claude-3-opus-20240229", label: "Claude 3 Opus" },
    ],
  },
  {
    id: "google",
    label: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyPlaceholder: "AIza...",
    keyLink: "https://aistudio.google.com/app/apikey",
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
    ],
  },
  {
    id: "groq",
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    keyPlaceholder: "gsk_...",
    keyLink: "https://console.groq.com/keys",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B" },
      { id: "gemma2-9b-it", label: "Gemma 2 9B" },
    ],
  },
  {
    id: "mistral",
    label: "Mistral",
    baseURL: "https://api.mistral.ai/v1",
    keyPlaceholder: "...",
    keyLink: "https://console.mistral.ai/api-keys",
    models: [
      { id: "mistral-large-latest", label: "Mistral Large" },
      { id: "mistral-small-latest", label: "Mistral Small" },
    ],
  },
  {
    id: "together",
    label: "Together AI",
    baseURL: "https://api.together.xyz/v1",
    keyPlaceholder: "...",
    keyLink: "https://api.together.ai/settings/api-keys",
    models: [
      {
        id: "meta-llama/Llama-4-Scout-17B-16E-Instruct",
        label: "Llama 4 Scout 17B",
      },
      {
        id: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
        label: "Llama 4 Maverick 17B",
      },
      { id: "deepseek-ai/DeepSeek-V3", label: "DeepSeek V3" },
      { id: "Qwen/Qwen2.5-72B-Instruct-Turbo", label: "Qwen 2.5 72B" },
    ],
  },
];

const API_KEY_STORAGE_KEY = "grapevine_openai_key";
const PROVIDER_STORAGE_KEY = "grapevine_provider";
const MODEL_STORAGE_KEY = "grapevine_model";

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
  } catch {}
}
function clearKey() {
  try {
    sessionStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {}
}
function getStoredProvider(): string {
  try {
    return sessionStorage.getItem(PROVIDER_STORAGE_KEY) ?? "openai";
  } catch {
    return "openai";
  }
}
function getStoredModel(): string {
  try {
    return sessionStorage.getItem(MODEL_STORAGE_KEY) ?? "gpt-5.4";
  } catch {
    return "gpt-5.4";
  }
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "#0a0a0a",
  border: "1px solid #444",
  borderRadius: 8,
  color: "#eee",
  fontSize: 14,
  outline: "none",
  marginBottom: 12,
  boxSizing: "border-box",
};

/** Screen shown when no API key is set. */
function ApiKeyScreen({
  onSubmit,
}: {
  onSubmit: (key: string, providerId: string, modelId: string) => void;
}) {
  const [providerId, setProviderId] = useState("openai");
  const [modelId, setModelId] = useState(PROVIDERS[0].models[0].id);
  const [key, setKey] = useState("");

  const provider = PROVIDERS.find((p) => p.id === providerId)!;

  function handleProviderChange(id: string) {
    const p = PROVIDERS.find((p) => p.id === id)!;
    setProviderId(id);
    setModelId(p.models[0].id);
    setKey("");
  }

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
          Choose a provider and model, then enter your API key. Your key is
          stored only in <strong>sessionStorage</strong> (cleared when you close
          this tab) and sent directly to the provider over HTTPS — it is never
          logged or persisted on any server.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (key.trim()) onSubmit(key.trim(), providerId, modelId);
          }}
        >
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "#888",
              marginBottom: 4,
            }}
          >
            Provider
          </label>
          <select
            value={providerId}
            onChange={(e) => handleProviderChange(e.target.value)}
            style={{ ...fieldStyle, cursor: "pointer", appearance: "auto" }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>

          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "#888",
              marginBottom: 4,
            }}
          >
            Model
          </label>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            style={{ ...fieldStyle, cursor: "pointer", appearance: "auto" }}
          >
            {provider.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "#888",
              marginBottom: 4,
            }}
          >
            API Key
          </label>
          <input
            type="password"
            placeholder={provider.keyPlaceholder}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoFocus
            style={fieldStyle}
          />
          <button
            type="submit"
            disabled={!key.trim()}
            style={{
              width: "100%",
              padding: "10px 0",
              background: key.trim() ? "#fff" : "#333",
              color: key.trim() ? "#000" : "#666",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: key.trim() ? "pointer" : "default",
            }}
          >
            Start Building
          </button>
        </form>

        <p style={{ margin: "16px 0 0", fontSize: 11, color: "#666" }}>
          Need a key?{" "}
          <a
            href={provider.keyLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#888" }}
          >
            Get one from {provider.label} →
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
  const [provider, setProvider] = useState(getStoredProvider);
  const [model, setModel] = useState(getStoredModel);
  const [hasServerKey, setHasServerKey] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHasServerKey(!!d.hasServerKey))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const handleKeySubmit = useCallback(
    (key: string, providerId: string, modelId: string) => {
      storeKey(key);
      try {
        sessionStorage.setItem(PROVIDER_STORAGE_KEY, providerId);
        sessionStorage.setItem(MODEL_STORAGE_KEY, modelId);
      } catch {}
      setApiKey(key);
      setProvider(providerId);
      setModel(modelId);
    },
    [],
  );

  const handleClearKey = useCallback(() => {
    clearKey();
    setApiKey("");
  }, []);

  /** Headers sent with every API request — carries the user's key, provider, and model. */
  const requestHeaders = useMemo(() => {
    if (!apiKey) return undefined;
    const p = PROVIDERS.find((x) => x.id === provider);
    const headers: Record<string, string> = {
      "x-openai-api-key": apiKey,
      "x-openai-model": model,
    };
    if (p?.baseURL) headers["x-openai-base-url"] = p.baseURL;
    return headers;
  }, [apiKey, provider, model]);

  if (checking) {
    return null;
  }

  if (!apiKey && !hasServerKey) {
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
        {apiKey && (
          <span
            style={{
              fontSize: 11,
              color: "#666",
              background: "#222",
              padding: "2px 8px",
              borderRadius: 4,
            }}
          >
            {PROVIDERS.find((p) => p.id === provider)?.label} ·{" "}
            {model.split("/").pop()}
          </span>
        )}
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
