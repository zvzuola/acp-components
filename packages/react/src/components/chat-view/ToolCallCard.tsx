import React, { useMemo, useState } from 'react';
import {
  FileTextOutlined,
  EditOutlined,
  DeleteOutlined,
  InboxOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  BulbOutlined,
  GlobalOutlined,
  SyncOutlined,
  ToolOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useStore } from 'zustand/react';
import type { ToolCallState, TerminalState } from '@acp-components/core';
import { sessionStore } from '@acp-components/core';
import type { ToolCallLocation, ToolKind } from '@acp-components/core';
import { DiffView } from '../diff-view';
import { TerminalView } from '../terminal-view';
import { useI18n } from '../../i18n';
import styles from './tool-call.module.scss';

export interface ToolCallCardProps {
  toolCall: ToolCallState;
  onNavigate?: (path: string, line?: number | null) => void;
}

const statusClass: Record<string, string> = {
  pending: styles.acpToolCallStatusPending,
  in_progress: styles.acpToolCallStatusInProgress,
  completed: styles.acpToolCallStatusCompleted,
  failed: styles.acpToolCallStatusFailed,
};

const kindIcon: Record<string, React.ReactNode> = {
  read: <FileTextOutlined />,
  edit: <EditOutlined />,
  delete: <DeleteOutlined />,
  move: <InboxOutlined />,
  search: <SearchOutlined />,
  execute: <ThunderboltOutlined />,
  think: <BulbOutlined />,
  fetch: <GlobalOutlined />,
  switch_mode: <SyncOutlined />,
};

function LocationChip({ loc, onNavigate }: { loc: ToolCallLocation; onNavigate?: ToolCallCardProps['onNavigate'] }) {
  const basename = loc.path.replace(/\\/g, '/').split('/').pop() || loc.path;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onNavigate?.(loc.path, loc.line);
  };

  return (
    <span
      className={styles.acpToolCallLocation}
      onClick={handleClick}
      title={`${loc.path}${loc.line != null ? `:${loc.line}` : ''}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onNavigate?.(loc.path, loc.line);
        }
      }}
    >
      <span className={styles.acpToolCallLocationIcon}><FileTextOutlined /></span>
      <span className={styles.acpToolCallLocationPath}>
        {basename}
        {loc.line != null && <span className={styles.acpToolCallLocationLine}>:{loc.line}</span>}
      </span>
    </span>
  );
}

export function ToolCallCard({ toolCall, onNavigate }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasContent = toolCall.content && toolCall.content.length > 0;
  const hasLocations = toolCall.locations && toolCall.locations.length > 0;
  const { t } = useI18n();
  const sessions = useStore(sessionStore, (s) => s.sessions);

  return (
    <div className={styles.acpToolCall}>
      <button
        className={styles.acpToolCallHeader}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className={`${styles.acpToolCallStatus} ${statusClass[String(toolCall.status)] || ''}`} />
        {toolCall.kind && (
          <span className={styles.acpToolCallKind} title={toolCall.kind}>
            {kindIcon[toolCall.kind] || <ToolOutlined />}
          </span>
        )}
        <span className={styles.acpToolCallName}>{toolCall.title}</span>
        <span className={`${styles.acpToolCallChevron}${expanded ? ` ${styles.acpToolCallChevronOpen}` : ''}`}>
          <RightOutlined />
        </span>
      </button>
      {expanded && hasLocations && (
        <div className={styles.acpToolCallLocations}>
          {toolCall.locations!.map((loc, i) => (
            <LocationChip key={`${loc.path}:${loc.line ?? ''}-${i}`} loc={loc} onNavigate={onNavigate} />
          ))}
        </div>
      )}
      {expanded && hasContent && (
        <div className={styles.acpToolCallBody}>
          {toolCall.content!.map((item, i) => {
            switch (item.type) {
              case 'content': {
                const c = item as unknown as { content: { type: string; text?: string } };
                return <pre key={i} className={styles.acpToolCallContentText}>{c.content.text}</pre>;
              }
              case 'diff': {
                const d = item as unknown as { path: string; oldText?: string | null; newText: string };
                return (
                  <DiffView
                    key={i}
                    diffs={[{ path: d.path, oldText: d.oldText ?? undefined, newText: d.newText }]}
                  />
                );
              }
              case 'terminal': {
                const term = item as unknown as { terminalId: string };
                let terminalState: TerminalState | undefined;
                for (const [, data] of sessions) {
                  const found = data.terminals.get(term.terminalId);
                  if (found) { terminalState = found; break; }
                }
                const terminals = terminalState
                  ? [terminalState]
                  : [{ terminalId: term.terminalId, command: '', output: '', exitStatus: null, truncated: false }];
                return <TerminalView key={i} terminals={terminals} />;
              }
              default:
                return null;
            }
          })}
        </div>
      )}
    </div>
  );
}
