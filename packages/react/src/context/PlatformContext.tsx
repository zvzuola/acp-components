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
 * Native menu bar integration slice. A desktop host that owns a native menu
 * bar (Tauri, Electron) implements this so application-level keyboard shortcuts
 * are driven by the OS menu system instead of (or in addition to) the webview
 * `keydown` listener. Web hosts omit it entirely - `useActions` falls back to
 * `useHotkey` for every shortcut.
 *
 * The flow: the React layer registers a set of named actions (id + label +
 * shortcut spec + optional submenu). The host maps these to native menu items
 * (translating "Mod" to its own cross-platform accelerator, e.g. Tauri's
 * `CmdOrCtrl+`). When the user clicks a menu item or triggers its accelerator,
 * the host calls back with the action id, and `useActions` routes it to the
 * registered handler. On Tauri, the per-item `action` callback (a Tauri
 * Channel) is the primary dispatch path; the Rust `on_menu_event` handler
 * emits a `menu-action` event as a secondary fallback.
 *
 * ALL actions are also registered via the webview `useHotkey` keydown listener
 * as a universal fallback. On desktop hosts with a native menu, the OS
 * intercepts the accelerator before the webview sees the keydown, so only one
 * path fires. When the native menu is unavailable (web) or not yet built, the
 * webview listener is the sole dispatch path.
 */
export interface PlatformMenu {
  /**
   * Register actions as native menu items. Called whenever the action set
   * changes. Every host that declares `platform.menu` must implement this -
   * the menu is built dynamically from the React action registry (e.g. via
   * the Tauri JS menu API), not statically in native code.
   */
  setActions(actions: MenuAction[]): void;
  /**
   * Subscribe to native menu-item activations (click + accelerator trigger).
   * The handler receives the action id. Returns an unsubscribe fn.
   */
  onAction(handler: (actionId: string) => void): () => void;
}

/**
 * A single action in the shared action registry. Actions with a `submenu` are
 * rendered as native menu items (when `Platform.menu` exists) for display and
 * discoverability. ALL actions are dispatched via the webview `useHotkey`
 * listener regardless of `submenu` or platform; on desktop the OS intercepts
 * the menu accelerator before the webview, so only one path fires.
 */
export interface MenuAction {
  /** Stable unique id, e.g. 'new-session', 'open-settings'. */
  id: string;
  /** Display label (already i18n-resolved by the caller). */
  label: string;
  /** Shortcut spec in the shared format, e.g. 'Mod+N'. */
  shortcut: string;
  /** Submenu path, e.g. 'File'. When set, this action is a menu item. */
  submenu?: string;
  /** Insert a separator before this item in the menu. */
  separatorBefore?: boolean;
  /** Whether the menu item is enabled (clickable). Default true. */
  enabled?: boolean;
}

/**
 * System / lifecycle slice. All members optional - a host that cannot back
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
  /** Native menu bar integration. Optional - web hosts omit it. */
  menu?: PlatformMenu;
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
