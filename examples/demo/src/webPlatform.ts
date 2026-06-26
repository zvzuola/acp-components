import type {
  Platform,
  AsyncStorage,
  FileTreeNode,
  FileTreeWatchCallbacks,
  FileTreeWatcher,
} from '@acp-components/react';

// ---------------------------------------------------------------------------
// Web Platform — backs the demo app's native-capability surface.
//
// The bridge server (examples/server) exposes file-system endpoints the demo
// proxies via Vite (/api/* → 127.0.0.1:3100):
//   GET /api/readdir?path=...   → FileTreeNode[]
//   GET /api/readfile?path=...  → { content }
//   GET /api/watch?cwd=...      → SSE stream of file change events
//
// Capabilities the browser cannot back natively fall back to browser APIs:
//   - directory picker  → window.prompt (user confirms keeping this)
//   - workspace cache   → localStorage
//   - terminal / updater / external editor → unsupported (omitted)
// ---------------------------------------------------------------------------

const WORKSPACE_CACHE_KEY = 'acp-demo-workspaces';

// ---------------------------------------------------------------------------
// Server-backed file system
// ---------------------------------------------------------------------------

async function serverReadDirectory(path: string): Promise<FileTreeNode[]> {
  const res = await fetch(`/api/readdir?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function serverReadFileContent(path: string): Promise<string> {
  const res = await fetch(`/api/readfile?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  const data = await res.json() as { content: string };
  return data.content;
}

function createServerFileWatcher(callbacks: FileTreeWatchCallbacks): FileTreeWatcher {
  // One SSE EventSource per watched cwd — the server opens a chokidar watcher
  // per /api/watch?cwd=... request and tears it down when the stream closes.
  const controllers = new Map<string, AbortController>();

  const subscribe = (cwd: string) => {
    if (controllers.has(cwd)) return; // already watching
    const ctrl = new AbortController();
    controllers.set(cwd, ctrl);

    const url = `/api/watch?cwd=${encodeURIComponent(cwd)}`;
    const es = new EventSource(url);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type: string; cwd: string; path: string };
        if (data.type === 'directory') {
          callbacks.onDirectoryChanged(data.cwd, data.path);
        } else {
          callbacks.onWorkspaceChanged(data.cwd);
        }
      } catch {
        // ignore malformed SSE events
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects; on hard failure the browser logs it
      es.close();
      controllers.delete(cwd);
    };

    // Aborting (via unsubscribe/dispose) closes the EventSource, which ends the
    // SSE stream and lets the server clean up its chokidar watcher.
    ctrl.signal.addEventListener('abort', () => es.close());
  };

  const unsubscribe = (cwd: string) => {
    const ctrl = controllers.get(cwd);
    if (!ctrl) return;
    ctrl.abort();
    controllers.delete(cwd);
  };

  const dispose = () => {
    for (const ctrl of controllers.values()) ctrl.abort();
    controllers.clear();
  };

  return { subscribe, unsubscribe, dispose };
}

// ---------------------------------------------------------------------------
// localStorage-backed async storage + workspaces cache
// ---------------------------------------------------------------------------

function createLocalStorageStorage(name: string): AsyncStorage {
  // Namespacing keeps separate logical stores (i18n, workspaces, …) isolated.
  const prefix = name ? `acp:${name}:` : 'acp:';
  return {
    getItem: async (key) => {
      try {
        return localStorage.getItem(prefix + key);
      } catch {
        return null;
      }
    },
    setItem: async (key, value) => {
      try {
        localStorage.setItem(prefix + key, value);
      } catch {
        /* storage unavailable / full */
      }
    },
    removeItem: async (key) => {
      try {
        localStorage.removeItem(prefix + key);
      } catch {
        /* noop */
      }
    },
    getItemSync: (key) => {
      try {
        return localStorage.getItem(prefix + key);
      } catch {
        return null;
      }
    },
  };
}

async function loadWorkspaces(): Promise<string[]> {
  // Legacy (pre-platform) cache stored under a non-namespaced key; keep reading
  // it so existing users don't lose their workspaces on upgrade.
  try {
    const raw = localStorage.getItem(WORKSPACE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function saveWorkspaces(paths: string[]): Promise<void> {
  try {
    localStorage.setItem(WORKSPACE_CACHE_KEY, JSON.stringify(paths));
  } catch {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWebPlatform(): Platform {
  return {
    platform: 'web',
    os: undefined,

    openLink: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    },

    openDirectoryPickerDialog: async () => {
      // Browsers have no native directory picker; fall back to a text prompt.
      const path = window.prompt('Enter project directory path:', '');
      return path?.trim() || null;
    },

    notify: async (title, description) => {
      // Best-effort web notification; silently no-op if disallowed.
      try {
        if (typeof Notification === 'undefined') return;
        if (Notification.permission === 'granted') {
          new Notification(title, { body: description });
        } else if (Notification.permission === 'default') {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') new Notification(title, { body: description });
        }
      } catch {
        /* noop */
      }
    },

    readDirectory: serverReadDirectory,
    readFileContent: serverReadFileContent,
    watchFileTree: (callbacks) => createServerFileWatcher(callbacks),

    storage: (name) => createLocalStorageStorage(name ?? ''),
    loadWorkspaces,
    saveWorkspaces,
  };
}
