import React, { useEffect, useRef } from 'react';
import { RightOutlined } from '@ant-design/icons';
import type { ContentBlock } from '@acp-components/core';
import { Markdown } from '../markdown';
import { useI18n } from '../../i18n';
import styles from './thought-view.module.scss';

export interface ThoughtViewProps {
  thought: ContentBlock[];
  isStreaming: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

function renderThoughtBlock(block: ContentBlock): React.ReactNode {
  switch (block.type) {
    case 'text':
      return <Markdown>{(block as { text: string }).text}</Markdown>;
    case 'resource':
    case 'resource_link':
      return null;
    default:
      return null;
  }
}

export const ThoughtView = React.memo(function ThoughtView({ thought, isStreaming, expanded, onExpandedChange }: ThoughtViewProps) {
  const { t } = useI18n();
  const prevStreamingRef = useRef(false);

  // Auto-expand during streaming, auto-collapse when streaming ends
  useEffect(() => {
    if (isStreaming && !prevStreamingRef.current) {
      onExpandedChange(true);
    } else if (!isStreaming && prevStreamingRef.current) {
      onExpandedChange(false);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const hasContent = thought.length > 0 && thought.some(
    (b) => b.type === 'text' && (b as { text: string }).text.length > 0
  );

  return (
    <div className={styles.acpThoughtView}>
      <button
        className={styles.acpThoughtViewHeader}
        onClick={() => onExpandedChange(!expanded)}
        aria-expanded={expanded}
      >
        <span className={`${styles.acpThoughtViewChevron}${expanded ? ` ${styles.acpThoughtViewChevronOpen}` : ''}`}>
          <RightOutlined />
        </span>
        <span className={styles.acpThoughtViewLabel}>
          {isStreaming ? t('thought.thinking') : t('thought.title')}
        </span>
        {isStreaming && <span className={styles.acpThoughtViewSpinner} />}
      </button>
      {expanded && hasContent && (
        <div className={styles.acpThoughtViewBody}>
          {thought.map((block, i) => (
            <React.Fragment key={i}>{renderThoughtBlock(block)}</React.Fragment>
          ))}
        </div>
      )}
      {expanded && isStreaming && !hasContent && (
        <div className={styles.acpThoughtViewBody}>
          <span className={styles.acpThoughtViewEmpty}>{t('thought.reasoning')}</span>
        </div>
      )}
    </div>
  );
});
