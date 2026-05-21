import React from 'react';
import type { Message, MessagePart } from '@acp-components/core';
import type { ContentBlock } from '@agentclientprotocol/sdk';
import { Markdown } from '../markdown';
import { ToolCallCard } from './ToolCallCard';
import { ThoughtView } from './ThoughtView';
import { PlanView } from './PlanView';
import styles from './chat-view.module.scss';

export interface MessageBubbleProps {
  messages: Message[];
  isStreaming?: boolean;
  onNavigateFile?: (path: string, line?: number | null) => void;
}

function renderContent(content: ContentBlock) {
  switch (content.type) {
    case 'text':
      return <Markdown>{(content as { text: string }).text}</Markdown>;
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

function renderPart(part: MessagePart, partIndex: number, isStreaming?: boolean, onNavigateFile?: (path: string, line?: number | null) => void) {
  switch (part.type) {
    case 'thought':
      return (
        <ThoughtView
          key={partIndex}
          thought={part.thought}
          isStreaming={!!isStreaming}
        />
      );
    case 'tool_calls':
      return part.toolCalls.map((tc) => (
        <ToolCallCard key={tc.toolCallId} toolCall={tc} onNavigate={onNavigateFile} />
      ));
    case 'content':
      return part.content.map((block, j) => (
        <React.Fragment key={j}>{renderContent(block)}</React.Fragment>
      ));
    case 'plan':
      if (!part.plan.every((e) => e.status === 'completed')) return null;
      return <PlanView key={partIndex} entries={part.plan} isStreaming={false} />;
  }
}

export function MessageBubble({ messages, isStreaming = false, onNavigateFile }: MessageBubbleProps) {
  const role = messages[0]?.role ?? 'user';
  const isUser = role === 'user';
  const stopReason = messages.reduceRight<string | undefined>(
    (acc, m) => acc ?? m.stopReason, undefined
  );

  const lastMsg = messages[messages.length - 1];
  const lastPart = lastMsg?.parts[lastMsg.parts.length - 1];
  const thoughtStillStreaming = isStreaming && lastPart?.type === 'thought';

  return (
    <div className={`${styles.acpMessageBubble} ${isUser ? styles.acpMessageBubbleUser : styles.acpMessageBubbleAgent}`}>
      <div className={styles.acpMessageBubbleContent}>
        {messages.map((msg) => (
          <React.Fragment key={msg.id}>
            {msg.parts.map((part, j) => {
              const isStreamingThought = msg === lastMsg && j === lastMsg.parts.length - 1 && thoughtStillStreaming;
              return renderPart(part, j, isStreamingThought, onNavigateFile);
            })}
          </React.Fragment>
        ))}
        {stopReason && (
          <div style={{ fontSize: 11, color: 'var(--acp-color-text-muted)', marginTop: 8 }}>
            {stopReason}
          </div>
        )}
      </div>
    </div>
  );
}
