import { useEffect } from 'react';
import { fileViewerStore } from '@acp-components/core';
import { usePlatform } from '../../context/PlatformContext';

/**
 * Mount-once wrapper that wires the host `Platform` to the global
 * `fileViewerStore`.
 *
 * Renders nothing. On mount it registers:
 *  1. `platform.readFileContent` as the content reader used by the
 *     `openFile` action to fetch tab content.
 *  2. `platform.onOpenFile` (when provided) as the open delegate — when set,
 *     the built-in FileViewer is bypassed and opening is forwarded to the host
 *     (e.g. the host's external editor).
 *
 * Mounted by default inside `<PlatformProvider>` (its `autoFileViewer` prop); it
 * reads the platform via `usePlatform()`, so any location beneath the provider
 * works. Components read state via `useFileViewer`.
 *
 * Hosts that want full control over file-viewer setup may set
 * `autoFileViewer={false}` on `PlatformProvider` (or omit this component) and
 * call `fileViewerStore.setFileContentReader` / `setFileOpenDelegate` themselves.
 */
export function PlatformFileViewerAuto() {
  const platform = usePlatform();
  const { readFileContent, onOpenFile } = platform;

  useEffect(() => {
    fileViewerStore.getState().setFileContentReader(readFileContent);
    return () => {
      // Only clear if we still own the slot (avoid clobbering a custom reader
      // registered by the host in the meantime)
      if (
        fileViewerStore.getState().fileContentReader === readFileContent
      ) {
        fileViewerStore.getState().setFileContentReader(null);
      }
    };
  }, [readFileContent]);

  useEffect(() => {
    fileViewerStore.getState().setFileOpenDelegate(onOpenFile ?? null);
    return () => {
      if (fileViewerStore.getState().fileOpenDelegate === onOpenFile) {
        fileViewerStore.getState().setFileOpenDelegate(null);
      }
    };
  }, [onOpenFile]);

  return null;
}
