import React, { useMemo } from 'react';
import { marked } from 'marked';
import type { Message } from '@acp-components/core';
import { ToolCallCard } from './ToolCallCard';
import styles from './chat-view.module.scss';

export interface MessageBubbleProps {
  message: Message;
}

function MarkdownText({ text }: { text: string }) {
  const html = useMemo(() => marked.parse(text, { async: false }) as string, [text]);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function renderContent(content: Message['content'][number]) {
  switch (content.type) {
    case 'text':
      return <MarkdownText text={(content as { text: string }).text} />;
    case 'resource':
      const res = content as { resource: { uri: string; text?: string; mimeType?: string } };
      return (
        <div className={styles.acpMessageBubbleResource}>
          <span>&#x1f4c4;</span>
          <div>
            <div className={styles.acpMessageBubbleResourceName}>{res.resource.uri}</div>
            {res.resource.text && (
              <pre style={{ marginTop: 4, fontSize: 12 }}>{res.resource.text.slice(0, 500)}</pre>
            )}
          </div>
        </div>
      );
    case 'resource_link':
      const link = content as { uri: string; name: string };
      return (
        <div className={styles.acpMessageBubbleResource}>
          <span>&#x1f517;</span>
          <span className={styles.acpMessageBubbleResourceName}>{link.name || link.uri}</span>
        </div>
      );
    default:
      return null;
  }
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`${styles.acpMessageBubble} ${isUser ? styles.acpMessageBubbleUser : styles.acpMessageBubbleAgent}`}>
      <div className={styles.acpMessageBubbleAvatar} aria-hidden="true">
        {isUser ? 'U' : 'A'}
      </div>
      <div className={styles.acpMessageBubbleContent}>
        {message.thought && message.thought.length > 0 && (
          <details style={{ marginBottom: 8 }}>
            <summary>Thinking</summary>
            {message.thought.map((block, i) => (
              <React.Fragment key={i}>{renderContent(block)}</React.Fragment>
            ))}
          </details>
        )}
        {message.content.map((block, i) => (
          <React.Fragment key={i}>{renderContent(block)}</React.Fragment>
        ))}
        {message.toolCalls?.map((tc) => (
          <ToolCallCard key={tc.toolCallId} toolCall={tc} />
        ))}
        {message.stopReason && message.role === 'agent' && (
          <div style={{ fontSize: 11, color: 'var(--acp-color-text-muted)', marginTop: 4 }}>
            {message.stopReason}
          </div>
        )}
      </div>
    </div>
  );
}
