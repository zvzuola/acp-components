import { readdir, stat, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import chokidar from 'chokidar';

// Local type definition — server should not depend on @acp-components/core
interface FileTreeNode {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  meta?: Record<string, unknown>;
}

const DEFAULT_IGNORE = ['.git', 'node_modules', '.next', 'dist', '__pycache__', '.DS_Store'];

function shouldIgnore(name: string, ignore: string[]): boolean {
  return ignore.some((pattern) => name === pattern || name.startsWith(pattern));
}

export async function readDirectory(
  dirPath: string,
  ignore: string[] = DEFAULT_IGNORE,
): Promise<FileTreeNode[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const nodes: FileTreeNode[] = [];

  for (const entry of entries) {
    if (shouldIgnore(entry.name, ignore)) continue;

    const fullPath = join(dirPath, entry.name);
    const isDir = entry.isDirectory();

    let size: number | undefined;
    let modifiedAt: string | undefined;
    try {
      const s = await stat(fullPath);
      size = s.size;
      modifiedAt = s.mtime.toISOString();
    } catch {
      // stat may fail for permission-restricted files; skip meta
    }

    nodes.push({
      name: entry.name,
      path: fullPath,
      kind: isDir ? 'directory' : 'file',
      meta: {
        ...(size !== undefined ? { size } : {}),
        ...(modifiedAt ? { modifiedAt } : {}),
      },
    });
  }

  // Sort: directories first, then alphabetical
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  return nodes;
}

export interface WatchOptions {
  cwd: string;
  ignore?: string[];
  onChange: (dirPath: string) => void;
}

export function watchWorkspace(options: WatchOptions): () => void {
  const { cwd, ignore = DEFAULT_IGNORE, onChange } = options;

  // Build ignore patterns for chokidar (glob-style)
  const ignorePatterns = ignore.map((p) => `**/${p}/**`);

  const watcher = chokidar.watch(cwd, {
    ignored: [
      /(^|[/\\])\../,            // dotfiles
      ...ignorePatterns,
    ],
    persistent: true,
    ignoreInitial: true,
    depth: 20,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  const handler = (filePath: string) => {
    // Notify about the parent directory change
    onChange(dirname(filePath));
  };

  watcher
    .on('add', handler)
    .on('change', handler)
    .on('unlink', handler)
    .on('addDir', handler)
    .on('unlinkDir', handler);

  return () => {
    watcher.close();
  };
}

export async function readFileContent(filePath: string): Promise<string> {
  return readFile(filePath, 'utf-8');
}
