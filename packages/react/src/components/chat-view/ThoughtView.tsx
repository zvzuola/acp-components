import React, { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import type { ContentBlock } from '@agentclientprotocol/sdk';
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
  const [expanded, setExpanded] = useState(true);
  const prevStreaming = useRef(isStreaming);

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
          {isStreaming ? 'Thinking...' : 'Thought'}
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
          <span className={styles.acpThoughtViewEmpty}>Reasoning...</span>
        </div>
      )}
    </div>
  );
}
