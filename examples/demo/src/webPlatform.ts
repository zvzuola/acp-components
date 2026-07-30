import type {
  Platform,
  PlatformStorage,
  FileTreeNode,
  FileTreeWatchCallbacks,
  FileTreeWatcher,
} from '@acp-components/react';

// ---------------------------------------------------------------------------
// Web Platform - browser capabilities shared by local dev and GitHub Pages.
//
// Local dev can opt into server-backed fs through Vite's /api proxy. Production
// builds omit the slice, so GitHub Pages exposes no file-system capability.
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
  const eventSources = new Map<string, EventSource>();

  const subscribe = (cwd: string) => {
    if (eventSources.has(cwd)) return;
    const es = new EventSource(`/api/watch?cwd=${encodeURIComponent(cwd)}`);
    eventSources.set(cwd, es);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type: string; cwd: string; path: string };
        if (data.type === 'directory') {
          callbacks.onDirectoryChanged(data.cwd, data.path);
        } else {
          callbacks.onWorkspaceChanged(data.cwd);
        }
      } catch {
        // Ignore malformed server events.
      }
    };

    es.onerror = () => {
      es.close();
      eventSources.delete(cwd);
    };
  };

  const unsubscribe = (cwd: string) => {
    eventSources.get(cwd)?.close();
    eventSources.delete(cwd);
  };

  const dispose = () => {
    for (const es of eventSources.values()) es.close();
    eventSources.clear();
  };

  return { subscribe, unsubscribe, dispose };
}

// ---------------------------------------------------------------------------
// Locale detection — browser language. Lifted into a helper so `onLocaleChanged`
// can re-read the snapshot without referencing the Platform object itself.
// ---------------------------------------------------------------------------

function detectBrowserLocale(): string | undefined {
  try {
    return typeof navigator !== 'undefined' && navigator.language
      ? navigator.language
      : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// localStorage-backed async storage
// ---------------------------------------------------------------------------

function createLocalStorageStorage(name: string): PlatformStorage {
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

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface WebPlatformOptions {
  /** Enable the local bridge's read-only file-system API. */
  enableFs?: boolean;
}

export function createWebPlatform({ enableFs = false }: WebPlatformOptions = {}): Platform {
  return {
    platform: 'web',
    os: undefined,

    ...(enableFs
      ? {
          fs: {
            readDirectory: serverReadDirectory,
            readFileContent: serverReadFileContent,
            watchFileTree: (callbacks: FileTreeWatchCallbacks) => createServerFileWatcher(callbacks),
          },
        }
      : {}),

    dialogs: {
      openLink: (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      },
      openFilePicker: async (opts?: { directory?: boolean; title?: string }) => {
        // The selected path belongs to the local/remote agent host. The browser
        // uses text input because it cannot provide an absolute host path.
        void opts;
        const path = window.prompt('Enter project directory path:', '');
        return path?.trim() || null;
      },
      notify: async (title: string, description?: string) => {
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
    },

    storage: (name?: string) => createLocalStorageStorage(name ?? ''),

    clipboard: {
      writeText: async (text: string) => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // Clipboard API unavailable / denied — silently no-op. UI surfaces
          // its own failure state; the platform contract is best-effort.
        }
      },
      readText: async () => {
        try {
          return await navigator.clipboard.readText();
        } catch {
          return '';
        }
      },
    },

    system: {
      // Web delegates to the browser language; desktop hosts read the OS
      // locale. Centralizing this here keeps `navigator` out of the UI.
      getLocale: detectBrowserLocale,
      onLocaleChanged: (handler: (locale: string | undefined) => void) => {
        const onChange = () => handler(detectBrowserLocale());
        window.addEventListener('languagechange', onChange);
        return () => window.removeEventListener('languagechange', onChange);
      },
      // restart / exportLogs — unsupported in a browser, omitted.
    },

    // openExternalEditor / updater — unsupported in a browser, omitted.
  };
}
