import type {
  Platform,
  PlatformStorage,
  FileTreeNode,
} from '@acp-components/react';

// ---------------------------------------------------------------------------
// Tauri Platform — backs the desktop template's native-capability surface.
//
// Agent transport (TauriIpcTransport) is configured separately via
// AgentConfig.transport on AcpProvider — it is NOT part of Platform.
//
// Capabilities are adapted from @tauri-apps/plugin-* (FS / dialog). Updater /
// restart / exportLogs / external-editor events are declared on the interface
// but omitted here (interface-only); wire them up when adopting
// tauri-plugin-updater etc.
//
// Workspace persistence is no longer on Platform — it lives in the
// `useWorkspacesPersistence` hook, backed by `storage('workspaces')`
// (webview localStorage). The Rust `load_workspaces` / `save_workspaces`
// commands are therefore no longer called from the frontend.
// ---------------------------------------------------------------------------

function detectOs(): 'macos' | 'windows' | 'linux' | undefined {
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (/Win/i.test(ua)) return 'windows';
    if (/Mac/i.test(ua)) return 'macos';
    if (/Linux/i.test(ua)) return 'linux';
  } catch { /* noop */ }
  return undefined;
}

// ---------------------------------------------------------------------------
// Native file system — @tauri-apps/plugin-fs
// ---------------------------------------------------------------------------

async function tauriReadDirectory(path: string): Promise<FileTreeNode[]> {
  const { readDir } = await import('@tauri-apps/plugin-fs');
  const entries = await readDir(path);
  const base = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return entries.map((entry) => ({
    name: entry.name,
    path: `${base}/${entry.name}`,
    kind: (entry.isDirectory ? 'directory' : 'file') as 'directory' | 'file',
  }));
}

async function tauriReadFileContent(path: string): Promise<string> {
  const { readTextFile } = await import('@tauri-apps/plugin-fs');
  return await readTextFile(path);
}

async function tauriWriteFileContent(path: string, content: string): Promise<void> {
  const { writeTextFile } = await import('@tauri-apps/plugin-fs');
  await writeTextFile(path, content);
}

// ---------------------------------------------------------------------------
// Native file picker — @tauri-apps/plugin-dialog
// ---------------------------------------------------------------------------

async function tauriOpenFilePicker(opts?: {
  directory?: boolean;
  title?: string;
}): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    directory: opts?.directory ?? true,
    title: opts?.title,
  });
  return typeof selected === 'string' ? selected : null;
}

// ---------------------------------------------------------------------------
// localStorage-backed storage (webview context)
// ---------------------------------------------------------------------------

function createTauriStorage(name: string): PlatformStorage {
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
        /* noop */
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

export function createTauriPlatform(): Platform {
  return {
    platform: 'desktop',
    os: detectOs(),

    fs: {
      readDirectory: tauriReadDirectory,
      readFileContent: tauriReadFileContent,
      writeFileContent: tauriWriteFileContent,
      // Native file-tree watcher not wired in the Tauri template yet; the file
      // tree is still browsable/refreshable on demand. Add when adopting a
      // tauri watcher plugin.
      // watchFileTree: undefined,
    },

    dialogs: {
      openLink: (url: string) => {
        // The webview can open external links directly; Tauri's shell plugin is
        // not pulled in to avoid adding a new dependency.
        window.open(url, '_blank', 'noopener,noreferrer');
      },
      openFilePicker: tauriOpenFilePicker,
      notify: async (title: string, _description?: string) => {
        // No tauri-plugin-notification dependency yet; surface to the console.
        // Wire up a native notification when that plugin is adopted.
        console.info(`[notify] ${title}`);
      },
    },

    storage: (name?: string) => createTauriStorage(name ?? ''),

    // openExternalEditor / updater / system (restart, exportLogs) —
    // interface-only, omitted. Wire them up when adopting tauri-plugin-shell /
    // tauri-plugin-updater etc.
  };
}
