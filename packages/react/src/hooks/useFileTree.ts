import { useCallback } from 'react';
import { useStore } from 'zustand/react';
import { fileTreeStore, loadFileTree, expandDirectory, collapseDirectory } from '@acp-components/core';
import type { FileTreeNode } from '@acp-components/core';

export interface UseFileTreeOptions {
  cwd: string;
}

export function useFileTree({ cwd }: UseFileTreeOptions) {
  const ws = useStore(
    fileTreeStore,
    useCallback(
      (s: ReturnType<typeof fileTreeStore.getState>) => s.workspaces.get(cwd),
      [cwd],
    ),
  );

  const load = useCallback(() => {
    loadFileTree(cwd);
  }, [cwd]);

  const expand = useCallback(
    (path: string) => {
      expandDirectory(cwd, path);
    },
    [cwd],
  );

  const collapse = useCallback(
    (path: string) => {
      collapseDirectory(cwd, path);
    },
    [cwd],
  );

  return {
    files: ws?.rootNodes ?? ([] as FileTreeNode[]),
    loading: ws?.loading ?? false,
    error: ws?.error ?? null,
    load,
    onExpand: expand,
    onCollapse: collapse,
  };
}