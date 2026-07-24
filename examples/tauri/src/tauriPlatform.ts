import type {
  Platform,
  PlatformStorage,
  FileTreeNode,
} from '@acp-components/react';
import type { MenuAction } from '@acp-components/react';
import type { StdioTransportOptions, AcpTransport } from '@acp-components/core';
import { TauriIpcTransport } from './tauriIpcTransport';

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
// Stdio transport factory — Tauri backend spawns the agent process and bridges
// stdin/stdout through Tauri IPC commands/events (see TauriIpcTransport). This
// lets `{ type: 'stdio', command, args }` agent configs (plain data, JSON-
// persistable) connect without resorting to a `{ type: 'custom' }` transport
// carrying a live instance. Each call gets a fresh unique agent id so multiple
// stdio agents can run concurrently and the Rust side can route their IPC.
// ---------------------------------------------------------------------------

let stdioAgentIdSeq = 0;

function createTauriStdioTransport(options: StdioTransportOptions): AcpTransport {
  // Agent id is scoped to this transport instance; the Rust `start_agent`
  // command uses it to route stdout/stderr/closed/error events back here.
  // A monotonic counter is sufficient — ids only need to be unique within one
  // app session, never persisted (the transport instance itself is not).
  const agentId = `stdio-${Date.now()}-${++stdioAgentIdSeq}`;
  return new TauriIpcTransport({
    agentId,
    command: options.command,
    args: options.args,
  });
}

// ---------------------------------------------------------------------------
// Custom in-app menu bar - backed by an in-memory action store.
//
// The Tauri template ships a frameless window (decorations: false) and renders
// its own titlebar (see TitleBar.tsx). Instead of building a native OS menu via
// @tauri-apps/api/menu, `setActions` mirrors the MenuAction[] it receives from
// HotkeysProvider into a module-level store; the titlebar reads it via
// getMenuActions() / onMenuActionsChange() and renders the items itself. Clicks
// route through `triggerMenuAction` -> `dispatchMenuAction` ->
// `platform.menu.onAction`, the same contract the native menu used, so
// HotkeysProvider's onAction handler still routes activations to the registered
// handlers.
//
// ALL actions are ALSO registered via the webview `useHotkey` keydown listener,
// so keyboard shortcuts keep working without a native menu - the webview
// listener is now the sole shortcut path on desktop, same as web.
// ---------------------------------------------------------------------------

const menuActionListeners = new Set<(actionId: string) => void>();

// In-memory mirror of the current menu actions. `setActions` (called by
// HotkeysProvider whenever the action set changes) writes here and notifies
// subscribers; the titlebar reads the snapshot via getMenuActions() and
// subscribes via onMenuActionsChange().
let currentMenuActions: MenuAction[] = [];
const menuActionsListeners = new Set<() => void>();

function dispatchMenuAction(actionId: string): void {
  for (const fn of menuActionListeners) fn(actionId);
}

/** Programmatically trigger a menu action by id (titlebar item clicks). */
export function triggerMenuAction(actionId: string): void {
  dispatchMenuAction(actionId);
}

/** Read the current menu-actions snapshot. */
export function getMenuActions(): MenuAction[] {
  return currentMenuActions;
}

/**
 * Subscribe to menu-action changes. Fires whenever `setActions` updates the
 * store (HotkeysProvider re-pushes on action-set changes). Returns an
 * unsubscribe fn.
 */
export function onMenuActionsChange(cb: () => void): () => void {
  menuActionsListeners.add(cb);
  return () => {
    menuActionsListeners.delete(cb);
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

    clipboard: {
      // The webview exposes the Clipboard API; a native tauri-plugin-clipboard
      // manager could back readImage/paste-history later, but plain text copy
      // is well-served by the browser surface today.
      writeText: async (text: string) => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          /* clipboard unavailable */
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
      // Locale mirrors the web fallback until a tauri locale plugin is wired
      // in; the webview still reports the OS language via navigator.language.
      getLocale: () => {
        try {
          return typeof navigator !== 'undefined' && navigator.language
            ? navigator.language
            : undefined;
        } catch {
          return undefined;
        }
      },
      onLocaleChanged: (handler: (locale: string | undefined) => void) => {
        const onChange = () => {
          try {
            handler(
              typeof navigator !== 'undefined' && navigator.language
                ? navigator.language
                : undefined,
            );
          } catch {
            handler(undefined);
          }
        };
        window.addEventListener('languagechange', onChange);
        return () => window.removeEventListener('languagechange', onChange);
      },
      // restart / exportLogs — interface-only, omitted (adopt tauri-plugin-*
      // when needed).
    },

    // openExternalEditor / updater — interface-only, omitted. Wire them up
    // when adopting tauri-plugin-shell / tauri-plugin-updater etc.

    process: {
      // Tauri can spawn an agent child process via its Rust backend — expose it
      // so `{ type: 'stdio' }` agent configs connect through TauriIpcTransport.
      createStdioTransport: createTauriStdioTransport,
    },

    menu: {
      // In-app menu bar - actions are mirrored into an in-memory store and
      // rendered by the custom TitleBar (see TitleBar.tsx). This keeps
      // `useActions` as the single source of truth: register an action with a
      // `submenu` field and it appears in the titlebar menu, while keyboard
      // shortcuts still flow through the webview `useHotkey` listener.
      onAction: (handler) => {
        menuActionListeners.add(handler);
        return () => {
          menuActionListeners.delete(handler);
        };
      },
      setActions: (actions: MenuAction[]) => {
        currentMenuActions = actions;
        for (const fn of menuActionsListeners) fn();
      },
    },
  };
}
