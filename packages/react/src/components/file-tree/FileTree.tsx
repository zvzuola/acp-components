import { useCallback, useMemo, memo } from 'react';
import {
  RightOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  FileTextOutlined,
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
  className,
  showRoot,
  onExpand,
  onCollapse,
}: FileTreeProps) {
  const { t } = useI18n();

  const hierarchicalNodes = useMemo(() => {
    // Data from the store is already hierarchical (directories contain their
    // direct children). We just need to sort it.
    return sortNodesRecursive(files);
  }, [files]);

  const hasFiles = hierarchicalNodes.length > 0;

  return (
    <div
      className={`${styles.acpFileTree}${
        className ? ` ${className}` : ''
      }`}
    >
      <div className={styles.acpFileTreeBody} role="tree" aria-label={t('fileTree.title')}>
        {!hasFiles ? (
          <div className={styles.acpFileTreeEmpty}>
            {t('fileTree.empty')}
          </div>
        ) : (
          hierarchicalNodes.map((node) => (
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
    </div>
  );
}