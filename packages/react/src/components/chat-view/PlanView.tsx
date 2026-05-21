import React, { useEffect, useRef, useState } from 'react';
import type { PlanEntry } from '@agentclientprotocol/sdk';
import { useI18n } from '../../i18n';
import styles from './plan-view.module.scss';

export interface PlanViewProps {
  entries: PlanEntry[];
  isStreaming: boolean;
}

const statusIcon: Record<string, string> = {
  pending: '○',
  in_progress: '◐',
  completed: '◉',
};

const statusClass: Record<string, string> = {
  pending: styles.acpPlanStatusPending,
  in_progress: styles.acpPlanStatusInProgress,
  completed: styles.acpPlanStatusCompleted,
};

const priorityClass: Record<string, string> = {
  high: styles.acpPlanPriorityHigh,
  medium: styles.acpPlanPriorityMedium,
  low: styles.acpPlanPriorityLow,
};

export function PlanView({ entries, isStreaming }: PlanViewProps) {
  const [expanded, setExpanded] = useState(false);
  const prevStreaming = useRef(isStreaming);
  const { t } = useI18n();

  useEffect(() => {
    if (isStreaming) {
      setExpanded(true);
    } else if (prevStreaming.current && !isStreaming) {
      setExpanded(false);
    }
    prevStreaming.current = isStreaming;
  }, [isStreaming]);

  if (entries.length === 0) return null;

  const completedCount = entries.filter((e) => e.status === 'completed').length;
  const inProgressCount = entries.filter((e) => e.status === 'in_progress').length;

  return (
    <div className={`${styles.acpPlanView}${isStreaming ? ` ${styles.acpPlanViewStreaming}` : ''}`}>
      <button
        className={styles.acpPlanViewHeader}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className={`${styles.acpPlanViewChevron}${expanded ? ` ${styles.acpPlanViewChevronOpen}` : ''}`}>
          &#x25b6;
        </span>
        <span className={styles.acpPlanViewLabel}>
          {isStreaming ? t('plan.planning') : t('plan.title')}
        </span>
        <span className={styles.acpPlanViewProgress}>
          {completedCount}/{entries.length}
        </span>
        {inProgressCount > 0 && <span className={styles.acpPlanViewSpinner} />}
      </button>
      {expanded && (
        <div className={styles.acpPlanViewBody}>
          <ol className={styles.acpPlanList}>
            {entries.map((entry, i) => (
              <li key={i} className={`${styles.acpPlanItem} ${priorityClass[entry.priority] ?? ''}`}>
                <span className={`${styles.acpPlanItemStatus} ${statusClass[entry.status] ?? ''}`}>
                  {statusIcon[entry.status] ?? statusIcon['pending']}
                </span>
                <span className={`${styles.acpPlanItemContent}${entry.status === 'completed' ? ` ${styles.acpPlanItemContentDone}` : ''}`}>
                  {entry.content}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
