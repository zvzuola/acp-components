import { createContext, useContext, type ReactNode } from 'react';
import type {
  AsyncStorage,
  UpdaterState,
  PlatformKind,
  PlatformOS,
  FileTreeNode,
  FileTreeWatchCallbacks,
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
 * Environment-agnostic native-capability contract.
 *
 * UI components consume this via `usePlatform()` and must NOT touch host-native
 * APIs (`window.prompt`, `localStorage`, `@tauri-apps/plugin-*`, …) directly.
 * Each host (web demo, Tauri template, …) provides its own implementation
 * (`createWebPlatform` / `createTauriPlatform`) and injects it through
 * `<PlatformProvider>`.
 *
 * `Platform` is **orthogonal** to `AcpContext`: the former owns native
 * capabilities (dialogs, file tree, terminal, persistence, updates), the
 * latter owns agent connection / session state. Agent transport is configured
 * via `AgentConfig.transport` on `AcpProvider` and is NOT part of `Platform`.
 *
 * Several methods are optional and may be left `undefined` by a host that does
 * not support them (`updater`, `restart`, `exportDebugLogs`, `notify`,
 * `openLink`, `onOpenFile`, `writeFileContent`, `watchFileTree`, `terminal`,
 * `loadWorkspaces`, `saveWorkspaces`). Callers guard with `?.`.
 */
export interface Platform {
  /** Host runtime kind. */
  platform: PlatformKind;
  /** Operating system hint, or `undefined` when undetermined. */
  os: PlatformOS;

  // —— User-interaction native capabilities ——
  /** Open an external URL in the host's default way. */
  openLink(url: string): void;
  /** Prompt the user to pick a directory; returns the path or `null` on cancel. */
  openDirectoryPickerDialog(opts?: { title?: string }): Promise<string | null>;
  /** Show a host notification (toast / system notification). */
  notify(title: string, description?: string, href?: string): Promise<void>;

  // —— File system — shared by the file tree, FileViewer, and ACP read/write callbacks ——
  /** Read a directory's direct children. */
  readDirectory(path: string): Promise<FileTreeNode[]>;
  /** Read a text file's full content. */
  readFileContent(path: string): Promise<string>;
  /** Write text content to a file. Optional — hosts may be read-only. */
  writeFileContent?(path: string, content: string): Promise<void>;
  /** Subscribe to file-tree changes; return an unsubscribe function. */
  watchFileTree?(callbacks: FileTreeWatchCallbacks): (() => void) | void;

  // —— Persistence ——
  /** Named async KV storage. web: localStorage; tauri: shell command / file. */
  storage(name?: string): AsyncStorage;
  /** Load persisted workspace paths (optional). */
  loadWorkspaces?(): Promise<string[]>;
  /** Persist workspace paths (optional). */
  saveWorkspaces?(paths: string[]): Promise<void>;

  // —— External editor integration ——
  /** Open a file in the host's external editor; when set, the built-in FileViewer is bypassed. */
  onOpenFile?(path: string, line?: number | null): void;

  // —— Update & system capabilities (interface only; impl may be omitted) ——
  updater?: Updater;
  /** Restart the host application. */
  restart?(): Promise<void>;
  /** Export debug logs to an out-of-band destination. */
  exportDebugLogs?(): Promise<void>;
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
   * When `true` (default), mount `<PlatformFileTreeAuto />` inside the provider
   * so the per-workspace file tree is driven from `platform.readDirectory` /
   * `platform.watchFileTree` automatically — zero-config. Set `false` when the
   * host wires its own file-tree setup (custom reader, bespoke watcher).
   */
  autoFileTree?: boolean;
  /**
   * When `true` (default), mount `<PlatformFileViewerAuto />` inside the
   * provider so `platform.readFileContent` / `platform.onOpenFile` are wired to
   * the global file-viewer store automatically — zero-config. Set `false` when
   * the host wires its own file-viewer setup.
   */
  autoFileViewer?: boolean;
}
