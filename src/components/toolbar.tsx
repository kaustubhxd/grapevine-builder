"use client";

import React from "react";

export type DeviceType = "Desktop" | "Tablet" | "Mobile";

interface ToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  onPreview: () => void;
  onExport: () => void;
  onDeviceChange: (device: DeviceType) => void;
  activeDevice: DeviceType;
  isPreview: boolean;
}

export function Toolbar({
  onUndo,
  onRedo,
  onPreview,
  onExport,
  onDeviceChange,
  activeDevice,
  isPreview,
}: ToolbarProps) {
  return (
    <div className="grapevine-toolbar">
      <div className="grapevine-toolbar-group">
        <button
          className="grapevine-toolbar-btn"
          onClick={onUndo}
          title="Undo"
          aria-label="Undo"
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
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </button>
        <button
          className="grapevine-toolbar-btn"
          onClick={onRedo}
          title="Redo"
          aria-label="Redo"
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
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
          </svg>
        </button>
      </div>

      {/* Device switcher */}
      <div className="grapevine-toolbar-group">
        <button
          className={`grapevine-toolbar-btn ${activeDevice === "Desktop" ? "grapevine-toolbar-btn-active" : ""}`}
          onClick={() => onDeviceChange("Desktop")}
          title="Desktop"
          aria-label="Desktop view"
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
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </button>
        <button
          className={`grapevine-toolbar-btn ${activeDevice === "Tablet" ? "grapevine-toolbar-btn-active" : ""}`}
          onClick={() => onDeviceChange("Tablet")}
          title="Tablet"
          aria-label="Tablet view"
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
            <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12" y2="18" />
          </svg>
        </button>
        <button
          className={`grapevine-toolbar-btn ${activeDevice === "Mobile" ? "grapevine-toolbar-btn-active" : ""}`}
          onClick={() => onDeviceChange("Mobile")}
          title="Mobile"
          aria-label="Mobile view"
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
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12" y2="18" />
          </svg>
        </button>
      </div>

      <div className="grapevine-toolbar-group">
        <button
          className={`grapevine-toolbar-btn ${isPreview ? "grapevine-toolbar-btn-active" : ""}`}
          onClick={onPreview}
          title={isPreview ? "Exit Preview" : "Preview"}
          aria-label={isPreview ? "Exit Preview" : "Preview"}
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
            {isPreview ? (
              <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </>
            ) : (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </button>
        <button
          className="grapevine-toolbar-btn"
          onClick={onExport}
          title="Export HTML"
          aria-label="Export HTML"
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
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
