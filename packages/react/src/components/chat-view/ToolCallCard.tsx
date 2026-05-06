import React, { useState } from 'react';
import type { ToolCallState } from '@acp-components/core';
import styles from './tool-call.module.scss';

export interface ToolCallCardProps {
  toolCall: ToolCallState;
}

const statusClass: Record<string, string> = {
  pending: styles.acpToolCallStatusPending,
  in_progress: styles.acpToolCallStatusIn_progress,
  completed: styles.acpToolCallStatusCompleted,
  failed: styles.acpToolCallStatusFailed,
};

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasContent = toolCall.content && toolCall.content.length > 0;

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
      {expanded && hasContent && (
        <div className={styles.acpToolCallBody}>
          {toolCall.content!.map((item, i) => {
            switch (item.type) {
              case 'content':
                const c = item as { content: { type: string; text?: string } };
                if (c.content.type === 'text' && c.content.text) {
                  return <div key={i}>{c.content.text}</div>;
                }
                return <pre key={i} style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(c.content, null, 2)}</pre>;
              case 'diff':
                const diff = item as { path: string; oldText?: string; newText: string };
                return (
                  <div key={i} className={styles.acpToolCallDiff}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{diff.path}</div>
                    {diff.oldText && (
                      <div className={styles.acpToolCallDiffRemove}>- {diff.oldText.slice(0, 200)}</div>
                    )}
                    <div className={styles.acpToolCallDiffAdd}>+ {diff.newText.slice(0, 200)}</div>
                  </div>
                );
              case 'terminal':
                return (
                  <div key={i} className={styles.acpToolCallTerminal}>
                    Terminal output
                  </div>
                );
              default:
                return null;
            }
          })}
        </div>
      )}
    </div>
  );
}
