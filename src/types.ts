// ---------------------------------------------------------------------------
// GrapesJS Editor Types (matches OSS grapesjs API surface)
// ---------------------------------------------------------------------------

export interface PageMetadata {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonicalUrl?: string;
}

export interface Snapshot {
  id: string;
  label: string;
  timestamp: number;
  /** Either a raw HTML string or a GrapesJS project JSON object. */
  data: string | object;
}

export interface GjsEditor {
  setComponents: (html: string) => void;
  getHtml: () => string;
  getCss: () => string;
  store: () => Promise<void>;
  getProjectData: () => object;
  getSelected: () => GjsComponent | null;
  getSelectedAll?: () => GjsComponent[];
  getWrapper: () => GjsComponent;
  select: (component: GjsComponent, opts?: { scroll?: boolean }) => void;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  off: (event: string, callback: (...args: unknown[]) => void) => void;
  loadProjectData: (data: {
    pages: { name?: string; component: string }[];
  }) => void;
  runCommand: (id: string, opts?: Record<string, unknown>) => unknown;
  stopCommand: (id: string) => void;
  DomComponents: {
    addComponent: (obj: unknown, opts?: unknown) => GjsComponent;
    getWrapper: () => GjsComponent | null;
  };
  UndoManager: {
    undo: () => void;
    redo: () => void;
    hasUndo: () => boolean;
    hasRedo: () => boolean;
  };
  Components?: {
    getType: (name: string) => unknown;
    getById: (id: string) => GjsComponent | null;
  };
  CssComposer?: { getAll: () => { models: { toJSON: () => unknown }[] } };
  Devices?: {
    getAll: () => {
      toJSON: () => {
        name: string;
        width?: string | number;
        widthMedia?: string | number;
      };
    }[];
  };
  DeviceManager?: {
    getCurrentDevice: () => {
      name: string;
      width?: string | number;
      widthMedia?: string | number;
    };
    getDevices: () => {
      name: string;
      width?: string | number;
      widthMedia?: string | number;
    }[];
    select: (device: string) => void;
  };
  Pages?: {
    getAll: () => GjsPage[];
    getSelected: () => {
      getId: () => string;
      getName: () => string;
      get: (k: string) => string;
    } | null;
    get: (id: string) => GjsPage | null;
    add: (
      data: { name: string; component: string },
      opts?: { select?: boolean },
    ) => GjsPage;
  };
  AssetManager?: {
    getAll: () => { models: { get: (key: string) => string }[] };
    on: (event: string, cb: (...args: unknown[]) => void) => void;
  };
  Parser?: {
    parseHtml: (
      html: string,
      opts?: Record<string, unknown>,
    ) => { html: unknown[]; css: unknown[] };
  };
  Css?: {
    addCollection: (css: unknown[], opts?: Record<string, unknown>) => void;
  };
}

export interface GjsPage {
  getId: () => string;
  getName: () => string;
  setName: (name: string) => void;
  toJSON: () => { id: string; name?: string };
  getMainComponent: () => GjsComponent;
}

export interface GjsComponent {
  getId: () => string;
  toJSON: () => Record<string, unknown>;
  toHTML: (opts?: {
    asDocument?: boolean;
    attributes?: (
      component: GjsComponent,
      attrs: Record<string, string> | null,
    ) => Record<string, string> | null;
  }) => string;
  components: (html?: string) => GjsComponentCollection;
  find: (selector: string) => GjsComponent[];
  replaceWith: (html: string) => GjsComponent[];
  remove: () => void;
  parent: () => GjsComponent | null;
  append: (
    html: string | GjsComponent,
    opts?: { at?: number },
  ) => GjsComponent[];
  index: () => number;
  getEl: () => HTMLElement | null;
  addAttributes: (attrs: Record<string, string>) => void;
}

export interface GjsComponentCollection {
  add: (comp: unknown, opts?: { at?: number }) => unknown;
  reset: (components: unknown) => void;
  length: number;
}

// ---------------------------------------------------------------------------
// Project Context (sent to server for AI)
// ---------------------------------------------------------------------------

export interface ProjectContext {
  selectedPage?: { id: string; name: string; content?: string };
  selectedComponent?: { id: string; content: string };
  selectedComponents: { id: string; content: string }[];
  projectType: string;
  globalStyles: string;
  devices: {
    name: string;
    width?: string | number;
    widthMedia?: string | number;
  }[];
  availablePages: { id: string; name: string }[];
  installedPlugins: {
    id: string;
    name?: string;
    instructions?: string;
    description?: string;
  }[];
  isEmail: boolean;
  isNewProject: boolean;
  imageUrls: string[];
}

// ---------------------------------------------------------------------------
// SSE Stream Types
// ---------------------------------------------------------------------------

export interface ToolStatusEvent {
  name: string;
  input: Record<string, unknown>;
  status: "in-progress" | "streaming" | "done" | "complete" | "error";
  content?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface PendingClientTool {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Grapevine Public API Types
// ---------------------------------------------------------------------------

export interface GrapevineBuilderProps {
  onSave?: (project: object) => Promise<void>;
  onLoad?: () => Promise<object>;
  onAssetUpload?: (files: File[]) => Promise<{ src: string }[]>;
  onAssetDelete?: (urls: string[]) => Promise<void>;
  onChange?: (state: { isDirty: boolean }) => void;
  onSnapshot?: (snapshot: Snapshot) => void;
  /** Raw HTML string to load on mount. Takes priority over onLoad. */
  initialHtml?: string;
  chatEndpoint: string;
  generateEndpoint: string;
  /** Extra headers sent with every chat / generate request (e.g. API keys). */
  headers?: Record<string, string>;
  projectType?: "web";
  className?: string;
  /** Show the built-in chat panel alongside the canvas. */
  showChat?: boolean;
  /** Custom idle state shown when canvas is empty and nothing is loading. */
  renderIdle?: () => React.ReactNode;
  /** Custom loading state shown when canvas is empty and generation/chat is in progress. */
  renderLoading?: () => React.ReactNode;
  /** GrapesJS library URL. Defaults to unpkg CDN. */
  grapesjsUrl?: string;
  /** GrapesJS CSS URL. Defaults to unpkg CDN. */
  grapesjsCssUrl?: string;
  /** Filename used when downloading the exported HTML. Defaults to "page.html". */
  exportFilename?: string;
}

export interface SelectedComponent {
  id: string;
  tag: string;
  classes: string;
}

export type GrapevineEvent =
  | "component:selected"
  | "component:deselected"
  | "generation:start"
  | "generation:done"
  | "chat:streaming"
  | "chat:done"
  | "tool:status"
  | "operation:complete"
  | "save"
  | "ready";

export interface GrapevineRef {
  chat: (
    instruction: string,
    images?: { mediaType: string; url: string; filename?: string }[],
  ) => Promise<void>;
  generate: (prompt: string) => Promise<void>;
  exportHtml: () => { html: string; css: string; full: string };
  exportAllPages: () => { pageName: string; html: string; css: string; full: string }[];
  togglePreview: () => void;
  undo: () => void;
  redo: () => void;
  getEditor: () => GjsEditor | null;
  isDirty: () => boolean;
  getMetadata: () => PageMetadata;
  setMetadata: (metadata: Partial<PageMetadata>) => void;
  createSnapshot: (label?: string) => Snapshot;
  loadSnapshot: (data: string | object) => void;
  on: (event: GrapevineEvent, handler: (...args: unknown[]) => void) => void;
  off: (event: GrapevineEvent, handler: (...args: unknown[]) => void) => void;
}

// ---------------------------------------------------------------------------
// Server Types
// ---------------------------------------------------------------------------

export interface GrapevineUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  modelId: string;
  finishReason: string;
  toolsUsed: string[];
  rounds: number;
  durationMs: number;
}

export interface GrapevineRouteOptions {
  model: import("ai").LanguageModel;
  subAgentModel?: import("ai").LanguageModel;
  systemPrompt?: string | { preamble?: string; postamble?: string };
  maxRounds?: number;
  onFinish?: (usage: GrapevineUsage) => Promise<void> | void;
  onError?: (error: Error) => void;
}
