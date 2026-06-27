import { describe, it, expect, beforeEach } from 'vitest';
import { fileTreeStore, findNodeByPath } from './fileTreeStore';
import type { FileTreeNode, DirectoryReadHandler } from '../types';

function resetStore(): void {
  fileTreeStore.setState({ workspaces: new Map() });
}

const CWD = '/proj';

function makeNode(path: string, kind: 'file' | 'directory', children?: FileTreeNode[]): FileTreeNode {
  return { name: path.split('/').pop() || path, path, kind, children };
}

const noopReader: DirectoryReadHandler = async () => [];

beforeEach(() => {
  resetStore();
});

describe('findNodeByPath', () => {
  it('finds a root node by exact path', () => {
    const nodes = [makeNode('/proj/a', 'file'), makeNode('/proj/b', 'directory')];
    expect(findNodeByPath(nodes, '/proj/a')).toBe(nodes[0]);
  });

  it('finds a nested node', () => {
    const leaf = makeNode('/proj/src/index.ts', 'file');
    const nodes = [makeNode('/proj/src', 'directory', [leaf])];
    expect(findNodeByPath(nodes, '/proj/src/index.ts')).toBe(leaf);
  });

  it('returns null when not found', () => {
    const nodes = [makeNode('/proj/a', 'file')];
    expect(findNodeByPath(nodes, '/proj/missing')).toBeNull();
  });

  it('does not recurse into subtrees that cannot contain the path (prefix boundary)', () => {
    // /proj/src-foo must NOT be treated as a child of /proj/src (no separator).
    const farLeaf = makeNode('/proj/src-foo/README.md', 'file');
    const nodes = [makeNode('/proj/src', 'directory', []), makeNode('/proj/src-foo', 'directory', [farLeaf])];
    expect(findNodeByPath(nodes, '/proj/src-foo/README.md')).toBe(farLeaf);
  });
});

describe('fileTreeStore — workspace lifecycle', () => {
  it('initWorkspace creates an empty workspace and is idempotent', () => {
    fileTreeStore.getState().initWorkspace(CWD);
    fileTreeStore.getState().initWorkspace(CWD);
    const ws = fileTreeStore.getState().workspaces.get(CWD)!;
    expect(ws.rootNodes).toEqual([]);
    expect(ws.loading).toBe(false);
    expect(ws.error).toBeNull();
  });

  it('initWorkspace injects the directoryReader only when none is set', () => {
    fileTreeStore.getState().initWorkspace(CWD, noopReader);
    expect(fileTreeStore.getState().workspaces.get(CWD)!.directoryReader).toBe(noopReader);
    // A second init without a reader must NOT overwrite the existing reader.
    fileTreeStore.getState().initWorkspace(CWD);
    expect(fileTreeStore.getState().workspaces.get(CWD)!.directoryReader).toBe(noopReader);
  });

  it('setReader always (re)sets the reader', () => {
    fileTreeStore.getState().initWorkspace(CWD, noopReader);
    const other: DirectoryReadHandler = async () => [];
    fileTreeStore.getState().setReader(CWD, other);
    expect(fileTreeStore.getState().workspaces.get(CWD)!.directoryReader).toBe(other);
  });

  it('removeWorkspace deletes the entry', () => {
    fileTreeStore.getState().initWorkspace(CWD);
    fileTreeStore.getState().removeWorkspace(CWD);
    expect(fileTreeStore.getState().workspaces.has(CWD)).toBe(false);
  });
});

describe('fileTreeStore — root nodes / loading / error', () => {
  it('setRootNodes stores nodes and clears loading + error', () => {
    fileTreeStore.getState().initWorkspace(CWD);
    fileTreeStore.getState().setLoading(CWD, true);
    fileTreeStore.getState().setError(CWD, 'boom');
    fileTreeStore.getState().setRootNodes(CWD, [makeNode('/proj/a', 'file')]);
    const ws = fileTreeStore.getState().workspaces.get(CWD)!;
    expect(ws.rootNodes).toHaveLength(1);
    expect(ws.loading).toBe(false);
    expect(ws.error).toBeNull();
  });

  it('setLoading / setError work on an uninitialized workspace (auto-init)', () => {
    fileTreeStore.getState().setLoading(CWD, true);
    fileTreeStore.getState().setError(CWD, 'err');
    const ws = fileTreeStore.getState().workspaces.get(CWD)!;
    expect(ws.loading).toBe(true);
    expect(ws.error).toBe('err');
  });
});

describe('fileTreeStore — updateNode', () => {
  beforeEach(() => {
    fileTreeStore.getState().initWorkspace(CWD);
  });

  it('updates a root node field (e.g. expanded) by exact path', () => {
    fileTreeStore.getState().setRootNodes(CWD, [makeNode('/proj/src', 'directory')]);
    fileTreeStore.getState().updateNode(CWD, '/proj/src', { expanded: true });
    expect(fileTreeStore.getState().workspaces.get(CWD)!.rootNodes[0].expanded).toBe(true);
  });

  it('updates a nested node and leaves unrelated subtrees data untouched', () => {
    const leaf = makeNode('/proj/src/a.ts', 'file');
    const otherLeaf = makeNode('/proj/other/b.ts', 'file');
    fileTreeStore.getState().setRootNodes(CWD, [
      makeNode('/proj/src', 'directory', [leaf]),
      makeNode('/proj/other', 'directory', [otherLeaf]),
    ]);
    fileTreeStore.getState().updateNode(CWD, '/proj/src/a.ts', { meta: { git: 'M' } });
    const ws = fileTreeStore.getState().workspaces.get(CWD)!;
    const srcDir = ws.rootNodes[0];
    if (srcDir.children) {
      expect(srcDir.children[0].meta).toEqual({ git: 'M' });
    }
    // Unrelated subtree is unchanged — the other leaf keeps its original data.
    const otherDir = ws.rootNodes[1];
    expect(otherDir.path).toBe('/proj/other');
    if (otherDir.children) {
      expect(otherDir.children[0]).toEqual(otherLeaf);
    }
  });

  it('leaves node data unchanged when the path does not match any node', () => {
    const node = makeNode('/proj/src', 'directory');
    fileTreeStore.getState().setRootNodes(CWD, [node]);
    fileTreeStore.getState().updateNode(CWD, '/proj/missing', { expanded: true });
    const ws = fileTreeStore.getState().workspaces.get(CWD)!;
    // Data-level no-op: the existing node keeps its original (undefined) expanded.
    expect(ws.rootNodes[0].expanded).toBeUndefined();
    expect(ws.rootNodes[0].path).toBe('/proj/src');
  });
});

describe('fileTreeStore — replaceChildren', () => {
  beforeEach(() => {
    fileTreeStore.getState().initWorkspace(CWD);
  });

  it('replaces children of a subdirectory node and marks it loaded', () => {
    fileTreeStore.getState().setRootNodes(CWD, [makeNode('/proj/src', 'directory')]);
    const kids = [makeNode('/proj/src/a.ts', 'file'), makeNode('/proj/src/b.ts', 'file')];
    fileTreeStore.getState().replaceChildren(CWD, '/proj/src', kids);
    const dir = fileTreeStore.getState().workspaces.get(CWD)!.rootNodes[0];
    expect(dir.children).toBe(kids);
    expect(dir.loaded).toBe(true);
  });

  it('replaces rootNodes directly when path is the workspace cwd (root case)', () => {
    fileTreeStore.getState().setRootNodes(CWD, [makeNode('/proj/old', 'file')]);
    const newRoots = [makeNode('/proj/new', 'file')];
    fileTreeStore.getState().replaceChildren(CWD, CWD, newRoots);
    expect(fileTreeStore.getState().workspaces.get(CWD)!.rootNodes).toBe(newRoots);
  });

  it('treats cwd with a trailing separator as the same root path', () => {
    fileTreeStore.getState().initWorkspace('/proj/');
    fileTreeStore.getState().setRootNodes('/proj/', [makeNode('/proj/old', 'file')]);
    const newRoots = [makeNode('/proj/new', 'file')];
    // Reader/watcher typically reports the path WITHOUT the trailing slash.
    fileTreeStore.getState().replaceChildren('/proj/', '/proj', newRoots);
    expect(fileTreeStore.getState().workspaces.get('/proj/')!.rootNodes).toBe(newRoots);
  });

  it('handles Windows-style backslash paths', () => {
    fileTreeStore.getState().initWorkspace('C:\\proj');
    fileTreeStore.getState().setRootNodes('C:\\proj', [makeNode('C:\\proj\\src', 'directory')]);
    fileTreeStore.getState().replaceChildren('C:\\proj', 'C:\\proj\\src', [makeNode('C:\\proj\\src\\a.ts', 'file')]);
    const dir = fileTreeStore.getState().workspaces.get('C:\\proj')!.rootNodes[0];
    expect(dir.children).toHaveLength(1);
  });
});
