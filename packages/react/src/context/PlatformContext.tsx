import { createContext, useContext, type ReactNode } from 'react';
import type {
  PlatformStorage,
  UpdaterState,
  PlatformKind,
  PlatformOS,
  FileTreeNode,
  FileTreeWatchCallbacks,
  FileTreeWatcher,
  StdioTransportOptions,
  AcpTransport,
} from '@acp-components/core';

/**
 * Auto-updater handle. Hosts that ship a native updater (e.g. Tauri's updater
 * plugin) implement this; others omit `Platform.updater` entirely.
 */
export interface Updater {
  /** Current updater state (poll-style snapshot). */
  state(): UpdaterState;
  /** Check for an available update. */
  check(): Promise<void>;
  /** Download and install an available update (may trigger a restart). */
  install(): Promise<void>;
}

/**
 * File-system slice — shared by the file tree, FileViewer, and (future) ACP
 * read/write callbacks. A read-only host omits `writeFileContent`; a host that
 * cannot watch omits `watchFileTree`.
 */
export interface FileSystem {
  /** Read a directory's direct children. */
  readDirectory(path: string): Promise<FileTreeNode[]>;
  /** Read a text file's full content. */
  readFileContent(path: string): Promise<string>;
  /** Write text content to a file. Optional — hosts may be read-only. */
  writeFileContent?(path: string, content: string): Promise<void>;
  /**
   * Subscribe to file-tree changes. Watching is per-workspace: the host creates
   * the watcher once, then the caller `subscribe(cwd)`s each workspace as it
   * appears, `unsubscribe(cwd)`s as it is removed, and `dispose()`s on teardown.
   * A host that does not support watching may omit this or return `void`.
   */
  watchFileTree?(callbacks: FileTreeWatchCallbacks): FileTreeWatcher | void;
}

/**
 * User-interaction slice — external links, native pickers, notifications.
 */
export interface Dialogs {
  /** Open an external URL in the host's default way. */
  openLink(url: string): void;
  /**
   * Native file-system picker. `directory: true` (default) picks a directory,
   * `false` picks a file. Returns the chosen path or `null` on cancel.
   */
  openFilePicker(opts?: { directory?: boolean; title?: string }): Promise<string | null>;
  /** Show a host notification (toast / system notification). */
  notify(title: string, description?: string, href?: string): Promise<void>;
}

/**
 * Clipboard slice — system clipboard access (copy text, optionally read).
 * Hosts that cannot back clipboard access (or only support write) omit the
 * slice or the relevant methods; callers guard with `?.`.
 */
export interface Clipboard {
  /** Write text to the system clipboard. */
  writeText(text: string): Promise<void>;
  /**
   * Read text from the system clipboard. Optional — many hosts cannot read
   * (browser permission restrictions, no plugin wired). Callers must handle
   * absence / rejection.
   */
  readText?(): Promise<string>;
}

/**
 * External-editor integration. When provided, opening a file is delegated to
 * the host (e.g. it launches the user's `$EDITOR`) and the built-in
 * FileViewer is bypassed. Omit it to keep opening in-panel. This is a
 * dedicated, explicit capability — not a side effect of some event bus.
 */
export type OpenExternalEditor = (path: string, line?: number | null) => void;

/**
 * Process / subprocess slice. A desktop host that can spawn an agent child
 * process (Tauri Rust backend, Electron main, Node, …) provides a stdio
 * transport factory here; a web host that cannot spawn omits it entirely.
 *
 * This is the bridge that lets a `{ type: 'stdio' }` `AgentConfig.transport`
 * actually connect: `AcpProvider` resolves `platform.process.createStdioTransport`
 * and injects it into `createAcpProvider`, which hands it to each `AcpClient`,
 * where `createTransport` consults it for stdio configs. When omitted, stdio
 * configs fail fast at connect time — the `AgentsPanel` picker filters `stdio`
 * out for `platform === 'web'` so users never build an un-connectable config.
 *
 * `Platform` provides the *spawn capability*; *which* agent to spawn (command /
 * args / env) is still plain data on `AgentConfig.transport`. The two concerns
 * stay orthogonal, consistent with how `fs.readDirectory` (capability) is
 * separate from the workspace `cwd` (data) it is called with.
 */
export interface PlatformProcess {
  /**
   * Build a concrete `AcpTransport` for a stdio spawn config. The returned
   * transport owns the host-native subprocess lifecycle (spawn, stdin/stdout
   * piping, close/error handlers) and adapts it to the ACP `Stream` shape.
   * Called once per `AcpClient.connect()` for `{ type: 'stdio' }` configs.
   */
  createStdioTransport(options: StdioTransportOptions): AcpTransport;
}

/**
 * System / lifecycle slice. All members optional — a host that cannot back
 * them (e.g. a browser) omits the whole slice or the relevant methods.
 *
 * `getLocale` centralizes locale detection so the UI never reaches for
 * `navigator.language` directly: web delegates to the browser, a desktop host
 * reads the OS system locale. `onLocaleChanged` lets a host push live changes
 * (e.g. the user switches their system language while the app runs).
 */
export interface PlatformSystem {
  /**
   * Current system locale, as a BCP-47 tag the host can determine (e.g.
   * `navigator.language`, or the OS locale on desktop). `undefined` when the
   * host cannot determine one — callers fall back to their own default.
   */
  getLocale?(): string | undefined;
  /**
   * Subscribe to system-locale changes. Returns an unsubscribe fn. Optional —
   * hosts that cannot watch locale changes omit it; callers then rely on the
   * initial `getLocale` snapshot only.
   */
  onLocaleChanged?(handler: (locale: string | undefined) => void): () => void;
  /** Restart the host application. */
  restart?(): Promise<void>;
  /** Export debug logs to an out-of-band destination. */
  exportLogs?(): Promise<void>;
}

/**
 * Environment-agnostic native-capability contract, sharded into cohesive slices.
 *
 * UI components consume this via `usePlatform()` and must NOT touch host-native
 * APIs (`window.prompt`, `localStorage`, `@tauri-apps/plugin-*`, …) directly.
 * Each host (web demo, Tauri template, …) provides its own implementation
 * (`createWebPlatform` / `createTauriPlatform`) and injects it through
 * `<PlatformProvider>`.
 *
 * `Platform` is **orthogonal** to `AcpContext`: the former owns native
 * capabilities (dialogs, file tree, persistence, external editor, updates),
 * the latter owns agent connection / session state. Agent transport is
 * configured via `AgentConfig.transport` on `AcpProvider` and is NOT part of
 * `Platform`.
 *
 * Capability is expressed by slice / method presence: `fs?`, `dialogs?`,
 * `clipboard?`, `updater?`, `system?`, `process?`, `openExternalEditor?` are
 * optional, and callers guard with `?.` at the use site. `storage` is the one
 * always-required slice (i18n and workspace persistence both depend on it).
 *
 * Note: workspace load/save was previously on this interface; it has moved to
 * the `useWorkspacesPersistence` hook, which is built on `storage`.
 */
export interface Platform {
  /** Host runtime kind. */
  platform: PlatformKind;
  /** Operating system hint, or `undefined` when undetermined. */
  os: PlatformOS;

  /** File-system slice. Optional as a whole (a host may be FS-less). */
  fs?: FileSystem;
  /** User-interaction slice (links / pickers / notifications). */
  dialogs?: Dialogs;
  /** System-clipboard access. Optional — callers guard with `?.`. */
  clipboard?: Clipboard;
  /** Named async KV storage. web: localStorage; tauri: shell command / file. */
  storage(name?: string): PlatformStorage;
  /** External-editor delegate. When set, file opening is delegated to the host. */
  openExternalEditor?: OpenExternalEditor;
  /** Auto-updater handle. Optional. */
  updater?: Updater;
  /** System / lifecycle capabilities (locale, restart, …). Optional. */
  system?: PlatformSystem;
  /**
   * Process / subprocess slice. Optional — a web host that cannot spawn a
   * child process omits it; a desktop host provides `createStdioTransport` so
   * `{ type: 'stdio' }` agent configs can connect. Callers (the provider)
   * guard with `?.`.
   */
  process?: PlatformProcess;
}

export const PlatformContext = createContext<Platform | null>(null);

/**
 * Access the host `Platform`. Throws if used outside `<PlatformProvider>`.
 * `PlatformProvider` should wrap the whole tree (above `I18nProvider` and
 * `AcpProvider`) since i18n and core both need platform capabilities.
 */
export function usePlatform(): Platform {
  const ctx = useContext(PlatformContext);
  if (!ctx) {
    throw new Error('usePlatform must be used within a PlatformProvider');
  }
  return ctx;
}

export interface PlatformProviderProps {
  platform: Platform;
  children: ReactNode;
  /**
   * When `true` (default), mount `<PlatformWorkspacesAuto />` inside the
   * provider so the workspace list is loaded from / saved to
   * `platform.storage('workspaces')` automatically — zero-config. Set `false`
   * when the host wires its own workspace persistence (or none).
   */
  autoWorkspaces?: boolean;
  /**
   * When `true` (default), mount `<PlatformFileTreeAuto />` inside the provider
   * so the per-workspace file tree is driven from `platform.fs.readDirectory` /
   * `platform.fs.watchFileTree` automatically — zero-config. Set `false` when
   * the host wires its own file-tree setup (custom reader, bespoke watcher).
   */
  autoFileTree?: boolean;
  /**
   * When `true` (default), mount `<PlatformFileViewerAuto />` inside the
   * provider so `platform.fs.readFileContent` / `platform.openExternalEditor`
   * are wired to the global file-viewer store automatically — zero-config. Set
   * `false` when the host wires its own file-viewer setup.
   */
  autoFileViewer?: boolean;
}
