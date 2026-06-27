import { afterEach } from 'vitest';
import { acpStore, sessionStore, fileTreeStore, fileViewerStore } from '@acp-components/core';

/**
 * React-layer tests share the core store singletons (they are module-level
 * `createStore(...)` objects). Reset them between tests so state never leaks
 * across cases. Merge-mode setState replaces only the data fields, preserving
 * the action methods on each store.
 */
function resetCoreStores(): void {
  acpStore.setState({
    agents: new Map(),
    workspaces: new Map(),
    activeSessionId: null,
    pendingAuth: null,
  });
  sessionStore.setState({ sessions: new Map() });
  fileTreeStore.setState({ workspaces: new Map() });
  fileViewerStore.setState({
    openFiles: [],
    activeFilePath: null,
    revealLine: null,
    fileContentReader: null,
    fileOpenDelegate: null,
  });
}

afterEach(() => {
  resetCoreStores();
  // useResizable mutates document.body style/classList while dragging; restore.
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  document.body.classList.remove('acp-resizing');
  document.body.innerHTML = '';
});
