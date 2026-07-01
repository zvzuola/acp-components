import { useEffect } from 'react';
import { fileViewerStore } from '@acp-components/core';
import { usePlatform } from '../../context/PlatformContext';

/**
 * Mount-once wrapper that wires the host `Platform` to the global
 * `fileViewerStore`.
 *
 * Renders nothing. On mount it registers:
 *  1. `platform.fs.readFileContent` as the content reader used by the
 *     `openFile` action to fetch tab content.
 *  2. `platform.openExternalEditor` (when provided) as the open delegate —
 *     when set, the built-in FileViewer is bypassed and opening is forwarded
 *     to the host (e.g. its external editor). When omitted, no delegate is set
 *     and the built-in FileViewer handles opens.
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
  const readFileContent = platform.fs?.readFileContent;
  const openExternalEditor = platform.openExternalEditor;

  // Register the host content reader (when provided).
  useEffect(() => {
    fileViewerStore.getState().setFileContentReader(readFileContent ?? null);
    return () => {
      // Only clear if we still own the slot (avoid clobbering a custom reader
      // registered by the host in the meantime)
      if (fileViewerStore.getState().fileContentReader === readFileContent) {
        fileViewerStore.getState().setFileContentReader(null);
      }
    };
  }, [readFileContent]);

  // Register the host open delegate (when the host takes over file opening).
  useEffect(() => {
    fileViewerStore.getState().setFileOpenDelegate(openExternalEditor ?? null);
    return () => {
      if (fileViewerStore.getState().fileOpenDelegate === openExternalEditor) {
        fileViewerStore.getState().setFileOpenDelegate(null);
      }
    };
  }, [openExternalEditor]);

  return null;
}


