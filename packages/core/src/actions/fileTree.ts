import { fileTreeStore, findNodeByPath } from '../store/fileTreeStore';
import type { FileTreeNode, DirectoryReadHandler } from '../types';

// ---- Concurrency guard for expandDirectory ----
const _pendingExpands = new Set<string>();

// ---- Helpers ----

function getReader(cwd: string): DirectoryReadHandler {
  const fn = fileTreeStore.getState().workspaces.get(cwd)?.directoryReader;
  if (!fn) {
    throw new Error(
      `DirectoryReadHandler not registered for workspace "${cwd}". ` +
      'Register a reader via Platform.readDirectory (mounted automatically by <PlatformFileTreeAuto>) or fileTreeStore.setReader before loading the tree.'
    );
  }
  return fn;
}

function collectExpandedPaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'directory' && node.expanded && node.children) {
      paths.push(node.path);
      paths.push(...collectExpandedPaths(node.children));
    }
  }
  return paths;
}

/**
 * Recursively refresh expanded subdirectories (BFS by tree level).
 * Only directories whose parent was successfully refreshed are re-read,
 * preventing stale data from disconnected subtrees.
 */
async function refreshExpanded(
  readDir: DirectoryReadHandler,
  nodes: FileTreeNode[],
  expandedPaths: Set<string>,
): Promise<FileTreeNode[]> {
  if (expandedPaths.size === 0) return nodes;

  // Collect expanded nodes at current level
  const toRefresh: Array<{ index: number; node: FileTreeNode }> = [];
  for (let i = 0; i < nodes.length; i++) {
    if (expandedPaths.has(nodes[i].path) && nodes[i].kind === 'directory') {
      toRefresh.push({ index: i, node: nodes[i] });
    }
  }

  if (toRefresh.length === 0) return nodes;

  // Read all expanded directories at this level in parallel
  const readResults = await Promise.allSettled(
    toRefresh.map(({ node }) => readDir(node.path)),
  );

  // Build updated nodes array
  let result = nodes;
  let copied = false;
  for (let i = 0; i < toRefresh.length; i++) {
    const { index, node } = toRefresh[i];
    const settled = readResults[i];
    if (settled.status === 'fulfilled') {
      if (!copied) {
        result = [...nodes];
        copied = true;
      }
      // Recurse into next level
      const children = await refreshExpanded(readDir, settled.value, expandedPaths);
      result[index] = {
        ...node,
        children,
        expanded: true,
        loaded: true,
      };
    }
    // On rejection: keep old children — better than losing the subtree entirely
  }

  return result;
}

// ---- Public Actions ----

/** Load the file tree root for a workspace. */
export async function loadFileTree(cwd: string): Promise<void> {
  const readDir = getReader(cwd);
  const store = fileTreeStore.getState();
  store.setLoading(cwd, true);
  store.setError(cwd, null);
  try {
    const nodes = await readDir(cwd);
    store.setRootNodes(cwd, nodes);
  } catch (err) {
    store.setLoading(cwd, false);
    store.setError(cwd, err instanceof Error ? err.message : 'Failed to load file tree');
  }
}

/** Expand a directory node, loading its children if not already loaded. */
export async function expandDirectory(cwd: string, path: string): Promise<void> {
  const readDir = getReader(cwd);
  const store = fileTreeStore.getState();
  const ws = store.workspaces.get(cwd);
  if (!ws) return;

  // Skip if already loaded
  const node = findNodeByPath(ws.rootNodes, path);
  if (node?.loaded) {
    store.updateNode(cwd, path, { expanded: true });
    return;
  }

  // Concurrency guard — skip if already loading
  const expandKey = `${cwd}::${path}`;
  if (_pendingExpands.has(expandKey)) return;

  store.updateNode(cwd, path, { expanded: true });
  _pendingExpands.add(expandKey);
  try {
    const children = await readDir(path);
    // Re-check: another operation may have replaced children while we awaited
    const currentWs = fileTreeStore.getState().workspaces.get(cwd);
    const currentNode = currentWs ? findNodeByPath(currentWs.rootNodes, path) : null;
    if (!currentNode?.loaded) {
      store.replaceChildren(cwd, path, children);
    }
  } catch {
    /* ignore individual expansion failures */
  } finally {
    _pendingExpands.delete(expandKey);
  }
}

/** Collapse a directory node. */
export function collapseDirectory(cwd: string, path: string): void {
  fileTreeStore.getState().updateNode(cwd, path, { expanded: false });
}

/**
 * Refresh the entire file tree for a workspace, preserving expanded state.
 * Expanded subdirectories are re-read from disk, not just restored from old state.
 */
export async function refreshFileTree(cwd: string): Promise<void> {
  const readDir = getReader(cwd);
  const store = fileTreeStore.getState();
  const ws = store.workspaces.get(cwd);
  if (!ws) return;

  const expandedPaths = new Set(collectExpandedPaths(ws.rootNodes));

  store.setLoading(cwd, true);
  store.setError(cwd, null);
  try {
    // Read root level
    const nodes = await readDir(cwd);
    // Recursively refresh all expanded subdirectories
    const refreshed = await refreshExpanded(readDir, nodes, expandedPaths);
    store.setRootNodes(cwd, refreshed);
  } catch (err) {
    store.setLoading(cwd, false);
    store.setError(cwd, err instanceof Error ? err.message : 'Failed to refresh file tree');
  }
}

/** Refresh children of a single directory node. */
export async function refreshNode(cwd: string, path: string): Promise<void> {
  const readDir = getReader(cwd);
  const store = fileTreeStore.getState();
  const ws = store.workspaces.get(cwd);
  if (!ws) return;
  try {
    const children = await readDir(path);
    store.replaceChildren(cwd, path, children);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.setError(cwd, `Failed to refresh "${path}": ${message}`);
  }
}
