import { createContext, useContext, type ReactNode } from 'react';
import type {
  PlatformStorage,
  UpdaterState,
  PlatformKind,
  PlatformOS,
  FileTreeNode,
  FileTreeWatchCallbacks,
  FileTreeWatcher,
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
 * External-editor integration. When provided, opening a file is delegated to
 * the host (e.g. it launches the user's `$EDITOR`) and the built-in
 * FileViewer is bypassed. Omit it to keep opening in-panel. This is a
 * dedicated, explicit capability — not a side effect of some event bus.
 */
export type OpenExternalEditor = (path: string, line?: number | null) => void;

/**
 * System / lifecycle slice. All members optional — a host that cannot back
 * them (e.g. a browser) omits the whole slice or the relevant methods.
 */
export interface PlatformSystem {
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
 * `updater?`, `system?`, `openExternalEditor?` are optional, and callers guard
 * with `?.` at the use site. `storage` is the one always-required slice (i18n
 * and workspace persistence both depend on it).
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
  /** Named async KV storage. web: localStorage; tauri: shell command / file. */
  storage(name?: string): PlatformStorage;
  /** External-editor delegate. When set, file opening is delegated to the host. */
  openExternalEditor?: OpenExternalEditor;
  /** Auto-updater handle. Optional. */
  updater?: Updater;
  /** System / lifecycle capabilities. Optional. */
  system?: PlatformSystem;
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
