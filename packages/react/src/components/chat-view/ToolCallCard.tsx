import React, { useState } from 'react';
import type { ToolCallState } from '@acp-components/core';
import type { ToolCallLocation } from '@agentclientprotocol/sdk';
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
  in_progress: styles.acpToolCallStatusIn_progress,
  completed: styles.acpToolCallStatusCompleted,
  failed: styles.acpToolCallStatusFailed,
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
      <span className={styles.acpToolCallLocationIcon}>&#x1f4c4;</span>
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

  return (
    <div className={styles.acpToolCall}>
      <button
        className={styles.acpToolCallHeader}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className={`${styles.acpToolCallStatus} ${statusClass[String(toolCall.status)] || ''}`} />
        <span className={styles.acpToolCallName}>{toolCall.title}</span>
        <span className={`${styles.acpToolCallChevron}${expanded ? ` ${styles.acpToolCallChevronOpen}` : ''}`}>
          &#x25b6;
        </span>
      </button>
      {hasLocations && (
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
                if (c.content.type === 'text' && c.content.text) {
                  return <div key={i}>{c.content.text}</div>;
                }
                return <pre key={i} style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(c.content, null, 2)}</pre>;
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
                return (
                  <TerminalView key={i} output={`${t('terminal.title')} #${term.terminalId}\n${t('terminal.noOutput')}`} exitCode={null} />
                );
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
