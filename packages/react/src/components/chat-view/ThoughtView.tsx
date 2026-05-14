import React, { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import type { ContentBlock } from '@agentclientprotocol/sdk';
import { useI18n } from '../../i18n';
import styles from './thought-view.module.scss';

export interface ThoughtViewProps {
  thought: ContentBlock[];
  isStreaming: boolean;
}

function MarkdownText({ text }: { text: string }) {
  const html = useMemo(() => marked.parse(text, { async: false }) as string, [text]);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function renderThoughtBlock(block: ContentBlock): React.ReactNode {
  switch (block.type) {
    case 'text':
      return <MarkdownText text={(block as { text: string }).text} />;
    case 'resource':
    case 'resource_link':
      return null;
    default:
      return null;
  }
}

export function ThoughtView({ thought, isStreaming }: ThoughtViewProps) {
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

  const hasContent = thought.length > 0 && thought.some(
    (b) => b.type === 'text' && (b as { text: string }).text.length > 0
  );

  return (
    <div className={`${styles.acpThoughtView}${isStreaming ? ` ${styles.acpThoughtViewStreaming}` : ''}`}>
      <button
        className={styles.acpThoughtViewHeader}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className={`${styles.acpThoughtViewChevron}${expanded ? ` ${styles.acpThoughtViewChevronOpen}` : ''}`}>
          &#x25b6;
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
}
