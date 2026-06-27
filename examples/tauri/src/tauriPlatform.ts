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
// Capabilities are adapted from @tauri-apps/plugin-* (FS / dialog) and Rust
// shell commands (load_workspaces / save_workspaces). Updater / restart /
// exportDebugLogs / external editor are declared on the interface but omitted
// here (interface-only); wire them up when adopting tauri-plugin-updater etc.
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
// Workspace persistence — Rust shell commands
// ---------------------------------------------------------------------------

async function tauriLoadWorkspaces(): Promise<string[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  const result = await invoke<{ workspaces: string[] }>('load_workspaces');
  return result.workspaces;
}

async function tauriSaveWorkspaces(paths: string[]): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('save_workspaces', { args: { workspaces: paths } });
}

// ---------------------------------------------------------------------------
// Native directory picker — @tauri-apps/plugin-dialog
// ---------------------------------------------------------------------------

async function tauriOpenDirectoryPickerDialog(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({ directory: true });
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

    openLink: (url) => {
      // The webview can open external links directly; Tauri's shell plugin is
      // not pulled in to avoid adding a new dependency.
      window.open(url, '_blank', 'noopener,noreferrer');
    },

    openDirectoryPickerDialog: tauriOpenDirectoryPickerDialog,

    notify: async (title, _description) => {
      // No tauri-plugin-notification dependency yet; surface to the console.
      // Wire up a native notification when that plugin is adopted.
      console.info(`[notify] ${title}`);
    },

    readDirectory: tauriReadDirectory,
    readFileContent: tauriReadFileContent,
    writeFileContent: tauriWriteFileContent,
    // Native file-tree watcher not wired in the Tauri template yet; the file
    // tree is still browsable/refreshable on demand. Add when adopting a
    // tauri watcher plugin.
    // watchFileTree: undefined,

    storage: (name) => createTauriStorage(name ?? ''),
    loadWorkspaces: tauriLoadWorkspaces,
    saveWorkspaces: tauriSaveWorkspaces,

    // updater / restart / exportDebugLogs / onOpenFile — interface-only, omitted.
    // Wire them up when adopting tauri-plugin-updater / shell / notification etc.
  };
}
