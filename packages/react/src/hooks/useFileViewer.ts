import { useCallback } from 'react';
import { useStore } from 'zustand/react';
import {
  fileViewerStore,
  openFile,
  closeFile,
  setActiveFile,
  clearRevealLine,
} from '@acp-components/core';
import type { OpenFileEntry } from '@acp-components/core';

export type { OpenFileEntry };

export interface UseFileViewerReturn {
  /** List of open file tabs */
  openFiles: OpenFileEntry[];
  /** Currently active (visible) file entry, or null */
  activeFile: OpenFileEntry | null;
  /** Open a file — fetches content and adds/activates tab. If host `onOpenFile` is set, delegates to host instead. */
  openFile: (path: string, line?: number | null) => void;
  /** Close a file tab */
  closeFile: (path: string) => void;
  /** Switch the active tab */
  setActiveFile: (path: string) => void;
  /** Line number to reveal in the editor (consumed after use) */
  revealLine: number | null;
  /** Clear the reveal line after it has been consumed */
  clearRevealLine: () => void;
}

type FileViewerStoreState = ReturnType<typeof fileViewerStore.getState>;

/**
 * Subscribe to the global file-viewer store (backed by `fileViewerStore` in
 * `@acp-components/core`). State is shared across every component that calls
 * this hook — no props threading required.
 *
 * The content reader and host open delegate are injected automatically by
 * `<PlatformFileViewerAuto>` (mounted inside `<PlatformProvider>`) from
 * `platform.readFileContent` / `platform.onOpenFile`.
 */
export function useFileViewer(): UseFileViewerReturn {
  // Subscribe to the whole slice we care about; zustand bails out when the
  // selected references are unchanged, so we use a shallow-ish manual selector
  // that returns primitives + arrays we already replace on every change.
  const openFiles = useStore(
    fileViewerStore,
    useCallback((s: FileViewerStoreState) => s.openFiles, []),
  );
  const activeFilePath = useStore(
    fileViewerStore,
    useCallback((s: FileViewerStoreState) => s.activeFilePath, []),
  );
  const revealLine = useStore(
    fileViewerStore,
    useCallback((s: FileViewerStoreState) => s.revealLine, []),
  );

  const handleOpenFile = useCallback(
    (path: string, line?: number | null) => openFile(path, line),
    [],
  );
  const handleCloseFile = useCallback((path: string) => closeFile(path), []);
  const handleSetActiveFile = useCallback(
    (path: string) => setActiveFile(path),
    [],
  );
  const handleClearRevealLine = useCallback(() => clearRevealLine(), []);

  const activeFile =
    openFiles.find((f) => f.path === activeFilePath) ?? null;

  return {
    openFiles,
    activeFile,
    openFile: handleOpenFile,
    closeFile: handleCloseFile,
    setActiveFile: handleSetActiveFile,
    revealLine,
    clearRevealLine: handleClearRevealLine,
  };
}
