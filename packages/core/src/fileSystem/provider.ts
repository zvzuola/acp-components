import { fileTreeStore } from '../store/fileTreeStore';
import {
  loadFileTree,
  refreshFileTree,
  refreshNode,
} from '../actions/fileTree';
import { acpStore } from '../store/acpStore';
import type { FileReadHandler, FileWriteHandler } from '../client/AcpClient';
import type { DirectoryReadHandler, FileTreeWatchCallbacks } from '../types';

export interface FileSystemProviderOptions {
  /** Platform-specific directory reader (enables file tree) */
  onDirectoryRead?: DirectoryReadHandler;
  /** Optional file change watcher. Return an unsubscribe function. */
  onFileTreeWatch?: (callbacks: FileTreeWatchCallbacks) => (() => void) | void;
  /** Auto-load strategy: 'onWorkspaceAdd' loads file tree when workspace is added, 'manual' requires explicit load */
  autoLoad?: 'onWorkspaceAdd' | 'manual';
  /** Handler for ACP readTextFile requests from agents */
  onFileRead?: FileReadHandler;
  /** Handler for ACP writeTextFile requests from agents */
  onFileWrite?: FileWriteHandler;
}

export interface FileSystemProviderInstance {
  /** Load file tree for a workspace */
  loadFileTree(cwd: string): Promise<void>;
  /** Refresh entire file tree for a workspace */
  refreshFileTree(cwd: string): Promise<void>;
  /** Refresh a single directory node */
  refreshNode(cwd: string, path: string): Promise<void>;
  /** Register or replace the directory reader for a specific workspace */
  setDirectoryReader(cwd: string, fn: DirectoryReadHandler): void;
  /** Destroy the provider and clean up all watchers */
  destroy(): void;
}

export function createFileSystemProvider(
  options: FileSystemProviderOptions,
): FileSystemProviderInstance {
  const {
    onDirectoryRead,
    onFileTreeWatch,
    autoLoad = 'onWorkspaceAdd',
  } = options;

  // 1. Set up file watcher (if provided)
  let unwatchFn: (() => void) | null = null;
  if (onFileTreeWatch) {
    const callbacks: FileTreeWatchCallbacks = {
      onDirectoryChanged: (cwd, dirPath) => {
        refreshNode(cwd, dirPath).catch(() => {});
      },
      onWorkspaceChanged: (cwd) => {
        refreshFileTree(cwd).catch(() => {});
      },
    };
    const result = onFileTreeWatch(callbacks);
    if (typeof result === 'function') {
      unwatchFn = result;
    }
  }

  // 2. Watch workspace changes: register reader in store and auto-load file trees (only when onDirectoryRead is provided)
  const knownCwds = new Set<string>();
  const unsubWorkspace = onDirectoryRead && autoLoad === 'onWorkspaceAdd'
    ? acpStore.subscribe((state) => {
        for (const [cwd] of state.workspaces) {
          if (!knownCwds.has(cwd)) {
            knownCwds.add(cwd);
            fileTreeStore.getState().initWorkspace(cwd, onDirectoryRead);
            loadFileTree(cwd).catch(() => {});
          }
        }
        for (const cwd of knownCwds) {
          if (!state.workspaces.has(cwd)) {
            knownCwds.delete(cwd);
            fileTreeStore.getState().removeWorkspace(cwd);
          }
        }
      })
    : () => {};

  return {
    loadFileTree: (cwd) => {
      if (!onDirectoryRead) throw new Error('onDirectoryRead is required for loadFileTree');
      // Ensure reader is registered for this workspace
      fileTreeStore.getState().initWorkspace(cwd, onDirectoryRead);
      return loadFileTree(cwd);
    },
    refreshFileTree: (cwd) => refreshFileTree(cwd),
    refreshNode: (cwd, path) => refreshNode(cwd, path),
    setDirectoryReader: (cwd, fn) => fileTreeStore.getState().setReader(cwd, fn),
    destroy() {
      unsubWorkspace();
      if (unwatchFn) unwatchFn();
      for (const cwd of knownCwds) {
        fileTreeStore.getState().removeWorkspace(cwd);
      }
    },
  };
}
