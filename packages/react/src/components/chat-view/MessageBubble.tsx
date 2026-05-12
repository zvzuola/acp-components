import React, { useMemo } from 'react';
import { marked } from 'marked';
import type { Message, MessagePart } from '@acp-components/core';
import type { ContentBlock } from '@agentclientprotocol/sdk';
import { ToolCallCard } from './ToolCallCard';
import styles from './chat-view.module.scss';

export interface MessageBubbleProps {
  messages: Message[];
}

function MarkdownText({ text }: { text: string }) {
  const html = useMemo(() => marked.parse(text, { async: false }) as string, [text]);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function renderContent(content: ContentBlock) {
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

function renderPart(part: MessagePart, partIndex: number) {
  switch (part.type) {
    case 'thought':
      return (
        <details key={partIndex} style={{ marginBottom: 8 }}>
          <summary>Thinking</summary>
          {part.thought.map((block, j) => (
            <React.Fragment key={j}>{renderContent(block)}</React.Fragment>
          ))}
        </details>
      );
    case 'tool_calls':
      return part.toolCalls.map((tc) => (
        <ToolCallCard key={tc.toolCallId} toolCall={tc} />
      ));
    case 'content':
      return part.content.map((block, j) => (
        <React.Fragment key={j}>{renderContent(block)}</React.Fragment>
      ));
  }
}

export function MessageBubble({ messages }: MessageBubbleProps) {
  const role = messages[0]?.role ?? 'user';
  const isUser = role === 'user';
  const stopReason = messages.reduceRight<string | undefined>(
    (acc, m) => acc ?? m.stopReason, undefined
  );

  return (
    <div className={`${styles.acpMessageBubble} ${isUser ? styles.acpMessageBubbleUser : styles.acpMessageBubbleAgent}`}>
      <div className={styles.acpMessageBubbleAvatar} aria-hidden="true">
        {isUser ? 'U' : 'A'}
      </div>
      <div className={styles.acpMessageBubbleContent}>
        {messages.map((msg) => (
          <React.Fragment key={msg.id}>
            {msg.parts.map((part, j) => renderPart(part, j))}
          </React.Fragment>
        ))}
        {stopReason && (
          <div style={{ fontSize: 11, color: 'var(--acp-color-text-muted)', marginTop: 4 }}>
            {stopReason}
          </div>
        )}
      </div>
    </div>
  );
}
