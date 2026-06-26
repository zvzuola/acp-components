import { createStore } from 'zustand/vanilla';
import type { FileTreeNode, DirectoryReadHandler } from '../types';

export interface WorkspaceFileTreeState {
  rootNodes: FileTreeNode[];
  loading: boolean;
  error: string | null;
  directoryReader: DirectoryReadHandler | null;
}

interface FileTreeStoreState {
  workspaces: Map<string, WorkspaceFileTreeState>;

  initWorkspace: (cwd: string, directoryReader?: DirectoryReadHandler) => void;
  removeWorkspace: (cwd: string) => void;
  setReader: (cwd: string, fn: DirectoryReadHandler) => void;
  setLoading: (cwd: string, loading: boolean) => void;
  setError: (cwd: string, error: string | null) => void;
  setRootNodes: (cwd: string, nodes: FileTreeNode[]) => void;
  updateNode: (cwd: string, path: string, update: Partial<FileTreeNode>) => void;
  replaceChildren: (cwd: string, path: string, children: FileTreeNode[]) => void;
}

function getOrInit(
  workspaces: Map<string, WorkspaceFileTreeState>,
  cwd: string,
  directoryReader?: DirectoryReadHandler,
): WorkspaceFileTreeState {
  let ws = workspaces.get(cwd);
  if (!ws) {
    ws = { rootNodes: [], loading: false, error: null, directoryReader: directoryReader ?? null };
    workspaces.set(cwd, ws);
  } else if (directoryReader && !ws.directoryReader) {
    ws = { ...ws, directoryReader };
    workspaces.set(cwd, ws);
  }
  return ws;
}

function isPathPrefix(parentPath: string, childPath: string): boolean {
  if (!childPath.startsWith(parentPath)) return false;
  if (childPath.length === parentPath.length) return true;
  const sep = childPath[parentPath.length];
  return sep === '/' || sep === '\\';
}

/**
 * Compare two absolute paths for equality, ignoring trailing path separators.
 * The workspace `cwd` (the store key) may carry a trailing separator while a
 * directory reader / watcher typically returns one without (e.g. Node's
 * `path.dirname` strips it), so a naive `===` would miss the root case.
 */
function isSamePath(a: string, b: string): boolean {
  return a.replace(/[/\\]+$/, '') === b.replace(/[/\\]+$/, '');
}

function findAndReplace(
  nodes: FileTreeNode[],
  path: string,
  updater: (node: FileTreeNode) => FileTreeNode,
): FileTreeNode[] {
  let changed = false;
  const result = nodes.map((node) => {
    // Direct match — apply update
    if (node.path === path) {
      changed = true;
      return updater(node);
    }
    // Early exit: skip subtrees that cannot contain the target path
    if (!node.children || !isPathPrefix(node.path, path)) {
      return node;
    }
    const newChildren = findAndReplace(node.children, path, updater);
    // Only clone this node if a descendant was actually modified
    if (newChildren === node.children) return node;
    changed = true;
    return { ...node, children: newChildren };
  });
  return changed ? result : nodes;
}

export function findNodeByPath(
  nodes: FileTreeNode[],
  path: string,
): FileTreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    // Early exit: only recurse into subtrees that could contain the target path
    if (node.children && isPathPrefix(node.path, path)) {
      const found = findNodeByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

export const fileTreeStore = createStore<FileTreeStoreState>((set) => ({
  workspaces: new Map(),

  initWorkspace: (cwd, directoryReader) => {
    set((state) => {
      const workspaces = new Map(state.workspaces);
      getOrInit(workspaces, cwd, directoryReader);
      return { workspaces };
    });
  },

  removeWorkspace: (cwd) => {
    set((state) => {
      const workspaces = new Map(state.workspaces);
      workspaces.delete(cwd);
      return { workspaces };
    });
  },

  setReader: (cwd, fn) => {
    set((state) => {
      const workspaces = new Map(state.workspaces);
      const ws = getOrInit(workspaces, cwd);
      workspaces.set(cwd, { ...ws, directoryReader: fn });
      return { workspaces };
    });
  },

  setLoading: (cwd, loading) => {
    set((state) => {
      const workspaces = new Map(state.workspaces);
      const ws = getOrInit(workspaces, cwd);
      workspaces.set(cwd, { ...ws, loading });
      return { workspaces };
    });
  },

  setError: (cwd, error) => {
    set((state) => {
      const workspaces = new Map(state.workspaces);
      const ws = getOrInit(workspaces, cwd);
      workspaces.set(cwd, { ...ws, error });
      return { workspaces };
    });
  },

  setRootNodes: (cwd, nodes) => {
    set((state) => {
      const workspaces = new Map(state.workspaces);
      const ws = getOrInit(workspaces, cwd);
      workspaces.set(cwd, {
        ...ws,
        rootNodes: nodes,
        loading: false,
        error: null,
      });
      return { workspaces };
    });
  },

  updateNode: (cwd, path, update) => {
    set((state) => {
      const workspaces = new Map(state.workspaces);
      const ws = getOrInit(workspaces, cwd);
      const rootNodes = findAndReplace(ws.rootNodes, path, (node) => ({
        ...node,
        ...update,
      }));
      workspaces.set(cwd, { ...ws, rootNodes });
      return { workspaces };
    });
  },

  replaceChildren: (cwd, path, children) => {
    set((state) => {
      const workspaces = new Map(state.workspaces);
      const ws = getOrInit(workspaces, cwd);
      // The workspace root itself is not a child node — `rootNodes` ARE the
      // root's children. A watcher reporting a change at the project root
      // (path === cwd) therefore must replace `rootNodes` directly rather than
      // search for a node whose `path` equals the cwd.
      const rootNodes = isSamePath(path, cwd)
        ? children
        : findAndReplace(ws.rootNodes, path, (node) => ({
            ...node,
            children,
            loaded: true,
          }));
      workspaces.set(cwd, { ...ws, rootNodes });
      return { workspaces };
    });
  },
}));
