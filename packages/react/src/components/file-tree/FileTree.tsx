import { useState, useCallback, useMemo, useRef, memo } from 'react';
import {
  RightOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  FileTextOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import type { FileTreeNode } from '@acp-components/core';
import { useI18n } from '../../i18n';
import styles from './file-tree.module.scss';

export type { FileTreeNode };

export interface FileTreeProps {
  /** Root nodes of the file tree */
  files: FileTreeNode[];
  /** Called when the user clicks a file node */
  onNavigate?: (path: string) => void;
  /** Optional search query to filter visible nodes */
  searchQuery?: string;
  /** Additional class name */
  className?: string;
  /** Whether to show the root nodes' parent path */
  showRoot?: boolean;
  /** Called when a collapsed directory is clicked */
  onExpand?: (path: string) => void;
  /** Called when an expanded directory is clicked */
  onCollapse?: (path: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByDirectory(nodes: FileTreeNode[]): FileTreeNode[] {
  const dirMap = new Map<string, FileTreeNode>();
  const rootNodes: FileTreeNode[] = [];

  for (const node of nodes) {
    const parts = node.path.replace(/\\/g, '/').split('/');
    const dirPath = parts.slice(0, -1).join('/');

    if (!dirPath) {
      rootNodes.push(node);
      continue;
    }

    // Build ancestor chain
    let currentPath = '';
    let context = rootNodes;
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      let dirNode = dirMap.get(currentPath);
      if (!dirNode) {
        dirNode = {
          name: parts[i],
          path: currentPath,
          kind: 'directory',
          children: [],
        };
        dirMap.set(currentPath, dirNode);
        context.push(dirNode);
      }
      context = dirNode.children!;
    }

    context.push({
      ...node,
      name: parts[parts.length - 1],
    });
  }

  return sortNodesRecursive(rootNodes);
}

function sortNodesRecursive(nodes: FileTreeNode[]): FileTreeNode[] {
  const sorted = [...nodes].sort((a, b) => {
    if (a.kind === 'directory' && b.kind !== 'directory') return -1;
    if (a.kind !== 'directory' && b.kind === 'directory') return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  for (const node of sorted) {
    if (node.children) {
      node.children = sortNodesRecursive(node.children);
    }
  }

  return sorted;
}

function matchesSearch(node: FileTreeNode, query: string): FileTreeNode | null {
  const normalizedQuery = query.toLowerCase();
  const nameMatch = node.name.toLowerCase().includes(normalizedQuery);
  const pathMatch = node.path.toLowerCase().includes(normalizedQuery);

  if (node.kind === 'file') {
    if (nameMatch || pathMatch) {
      return { ...node };
    }
    return null;
  }

  if (node.children) {
    const matchedChildren = node.children
      .map((child) => matchesSearch(child, query))
      .filter((child): child is FileTreeNode => child !== null);

    if (matchedChildren.length > 0) {
      return {
        ...node,
        children: matchedChildren,
      };
    }
  }

  if (nameMatch || pathMatch) {
    return {
      ...node,
      children: node.children ?? [],
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// FileTreeRow — renders a single row in the tree
// ---------------------------------------------------------------------------

interface FileTreeRowProps {
  node: FileTreeNode;
  depth: number;
  onNavigate?: (path: string) => void;
  onExpand?: (path: string) => void;
  onCollapse?: (path: string) => void;
}

const FileTreeRow = memo(function FileTreeRow({
  node,
  depth,
  onNavigate,
  onExpand,
  onCollapse,
}: FileTreeRowProps) {
  const expanded = node.expanded === true;
  const hasChildren = node.children && node.children.length > 0;
  const isDirectory = node.kind === 'directory';

  const handleToggle = useCallback(() => {
    if (expanded) {
      onCollapse?.(node.path);
    } else {
      onExpand?.(node.path);
    }
  }, [expanded, onExpand, onCollapse, node.path]);

  const handleClick = useCallback(() => {
    if (isDirectory) {
      handleToggle();
    } else {
      onNavigate?.(node.path);
    }
  }, [isDirectory, handleToggle, onNavigate, node.path]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      } else if (e.key === 'ArrowRight' && !expanded && isDirectory) {
        e.preventDefault();
        onExpand?.(node.path);
      } else if (e.key === 'ArrowLeft' && expanded && isDirectory) {
        e.preventDefault();
        onCollapse?.(node.path);
      }
    },
    [handleClick, expanded, isDirectory, onExpand, onCollapse, node.path],
  );

  const indentStyle: React.CSSProperties = {
    paddingLeft: `${8 + depth * 16}px`,
  };

  return (
    <>
      <div
        className={styles.acpFileTreeRow}
        style={indentStyle}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="treeitem"
        aria-expanded={isDirectory ? expanded : undefined}
        aria-selected={false}
        tabIndex={0}
        title={node.path}
      >
        {isDirectory ? (
          <span
            className={`${styles.acpFileTreeChevron}${
              expanded ? ` ${styles.acpFileTreeChevronOpen}` : ''
            }`}
          >
            <RightOutlined />
          </span>
        ) : (
          <span className={styles.acpFileTreeSpacer} />
        )}
        <span className={styles.acpFileTreeIcon}>
          {isDirectory ? (
            expanded ? (
              <FolderOpenOutlined />
            ) : (
              <FolderOutlined />
            )
          ) : (
            <FileTextOutlined />
          )}
        </span>
        <span
          className={`${styles.acpFileTreeName}${
            !isDirectory ? ` ${styles.acpFileTreeNameFile}` : ''
          }`}
        >
          {node.name}
        </span>
      </div>
      {isDirectory && expanded && hasChildren && (
        <div role="group">
          {node.children!.map((child) => (
            <FileTreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              onNavigate={onNavigate}
              onExpand={onExpand}
              onCollapse={onCollapse}
            />
          ))}
        </div>
      )}
    </>
  );
});

// ---------------------------------------------------------------------------
// FileTree — top-level component
// ---------------------------------------------------------------------------

export function FileTree({
  files,
  onNavigate,
  searchQuery,
  className,
  showRoot,
  onExpand,
  onCollapse,
}: FileTreeProps) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [localSearch, setLocalSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const effectiveSearch = searchQuery ?? localSearch;

  const hierarchicalNodes = useMemo(() => {
    // Data from the store is already hierarchical (directories contain their
    // direct children). We just need to sort it.
    // groupByDirectory is only for flat file lists (e.g. search results with
    // bare paths), which would need showRoot=false explicitly.
    return sortNodesRecursive(files);
  }, [files]);

  const filteredNodes = useMemo(() => {
    if (!effectiveSearch || !effectiveSearch.trim()) return hierarchicalNodes;
    return hierarchicalNodes
      .map((node) => matchesSearch(node, effectiveSearch.trim()))
      .filter((node): node is FileTreeNode => node !== null);
  }, [hierarchicalNodes, effectiveSearch]);

  const hasFiles = filteredNodes.length > 0;

  const handleFocusSearch = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalSearch(e.target.value);
    },
    []
  );

  return (
    <div
      className={`${styles.acpFileTree}${
        className ? ` ${className}` : ''
      }`}
    >
      <div className={styles.acpFileTreeHeader}>
        <span
          className={styles.acpFileTreeHeaderTitle}
          onClick={() => setCollapsed((prev) => !prev)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setCollapsed((prev) => !prev);
            }
          }}
        >
          <span
            className={`${styles.acpFileTreeChevron}${
              !collapsed ? ` ${styles.acpFileTreeChevronOpen}` : ''
            }`}
          >
            <RightOutlined />
          </span>
          <span className={styles.acpFileTreeHeaderLabel}>
            {t('fileTree.title')}
          </span>
          {hasFiles && (
            <span className={styles.acpFileTreeHeaderCount}>
              {countFiles(filteredNodes)}
            </span>
          )}
        </span>
        {searchQuery === undefined && (
          <button
            className={styles.acpFileTreeSearchToggle}
            onClick={handleFocusSearch}
            aria-label={t('fileTree.searchAriaLabel')}
            title={t('fileTree.search')}
          >
            <FileSearchOutlined />
          </button>
        )}
      </div>

      {searchQuery === undefined && !collapsed && (
        <div className={styles.acpFileTreeSearchWrap}>
          <input
            ref={inputRef}
            className={styles.acpFileTreeSearchInput}
            type="text"
            value={localSearch}
            onChange={handleSearchChange}
            placeholder={t('fileTree.searchPlaceholder')}
            aria-label={t('fileTree.searchAriaLabel')}
          />
        </div>
      )}

      {!collapsed && (
        <div className={styles.acpFileTreeBody} role="tree" aria-label={t('fileTree.title')}>
          {!hasFiles ? (
            <div className={styles.acpFileTreeEmpty}>
              {t('fileTree.empty')}
            </div>
          ) : (
            filteredNodes.map((node) => (
              <FileTreeRow
                key={node.path}
                node={node}
                depth={0}
                onNavigate={onNavigate}
                onExpand={onExpand}
                onCollapse={onCollapse}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function countFiles(nodes: FileTreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.kind === 'file') {
      count++;
    }
    if (node.children) {
      count += countFiles(node.children);
    }
  }
  return count;
}