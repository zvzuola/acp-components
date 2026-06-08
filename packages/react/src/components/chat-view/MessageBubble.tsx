import React from 'react';
import { FileTextOutlined, LinkOutlined } from '@ant-design/icons';
import type { Message, MessagePart, SessionId } from '@acp-components/core';
import type { ContentBlock } from '@acp-components/core';
import { sessionStore } from '@acp-components/core';
import { useI18n } from '../../i18n';
import { Markdown } from '../markdown';
import { ToolCallCard } from './ToolCallCard';
import { ThoughtView } from './ThoughtView';
import { PlanView } from './PlanView';
import styles from './chat-view.module.scss';

export interface MessageBubbleProps {
  sessionId: SessionId | null;
  messages: Message[];
  isStreaming?: boolean;
  onNavigateFile?: (path: string, line?: number | null) => void;
}

function renderContent(content: ContentBlock) {
  if ('annotations' in content && content.annotations != null) return null;
  switch (content.type) {
    case 'text':
      return <Markdown>{(content as { text: string }).text}</Markdown>;
    case 'resource':
      const res = content as { resource: { uri: string; text?: string; mimeType?: string } };
      const rawName = res.resource.uri.split('/').pop() || res.resource.uri;
      const fileName = decodeURIComponent(rawName);
      return (
        <div className={styles.acpMessageBubbleResource}>
          <span><FileTextOutlined /></span>
          <div>
            <div className={styles.acpMessageBubbleResourceName}>{fileName}</div>
          </div>
        </div>
      );
    case 'resource_link':
      const link = content as { uri: string; name: string };
      return (
        <div className={styles.acpMessageBubbleResource}>
          <span><LinkOutlined /></span>
          <span className={styles.acpMessageBubbleResourceName}>{link.name || link.uri}</span>
        </div>
      );
    case 'image': {
      const img = content as { data: string; mimeType: string; uri?: string | null };
      const src = `data:${img.mimeType};base64,${img.data}`;
      return (
        <img
          className={styles.acpMessageBubbleImage}
          src={src}
          alt={img.uri || 'image'}
        />
      );
    }
    default:
      return null;
  }
}

function renderPart(
  part: MessagePart,
  partIndex: number,
  sessionId: SessionId | null,
  messageId: string,
  isStreaming?: boolean,
  onNavigateFile?: (path: string, line?: number | null) => void,
) {
  const expanded = (part as { expanded?: boolean }).expanded ?? false;

  function setExpanded(value: boolean) {
    if (!sessionId) return;
    sessionStore.getState().setPartExpanded(sessionId, messageId, partIndex, value);
  }

  switch (part.type) {
    case 'thought':
      return (
        <ThoughtView
          key={partIndex}
          thought={part.thought}
          isStreaming={!!isStreaming}
          expanded={expanded}
          onExpandedChange={setExpanded}
        />
      );
    case 'tool_calls':
      return part.toolCalls.map((tc) => (
        <ToolCallCard
          key={tc.toolCallId}
          sessionId={sessionId}
          toolCall={tc}
          onNavigate={onNavigateFile}
          expanded={expanded}
          onExpandedChange={setExpanded}
        />
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

function areMessagesEqual(a: Message[], b: Message[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

interface AgentMessageProps {
  message: Message;
  sessionId: SessionId | null;
  isStreaming: boolean;
  onNavigateFile?: (path: string, line?: number | null) => void;
}

const AgentMessage = React.memo(function AgentMessage({
  message,
  sessionId,
  isStreaming,
  onNavigateFile,
}: AgentMessageProps) {
  const { t } = useI18n();
  const lastPartIndex = message.parts.length - 1;
  const lastPart = message.parts[lastPartIndex];
  const thoughtStillStreaming = isStreaming && lastPart?.type === 'thought';

  return (
    <>
      {message.parts.map((part, j) => {
        const isStreamingThought = j === lastPartIndex && thoughtStillStreaming;
        return renderPart(part, j, sessionId, message.id, isStreamingThought, onNavigateFile);
      })}
      {message.stopReason && (
        <div className={styles.acpMessageBubbleStopReason}>
          {t(`stopReason.${message.stopReason}`)}
        </div>
      )}
    </>
  );
});

export const MessageBubble = React.memo(function MessageBubble({ sessionId, messages, isStreaming = false, onNavigateFile }: MessageBubbleProps) {
  const lastIdx = messages.length - 1;

  return (
    <div className={`${styles.acpMessageBubble} ${styles.acpMessageBubbleAgent}`}>
      <div className={styles.acpMessageBubbleContent}>
        {messages.map((msg, i) => (
          <AgentMessage
            key={msg.id}
            message={msg}
            sessionId={sessionId}
            isStreaming={isStreaming && i === lastIdx}
            onNavigateFile={onNavigateFile}
          />
        ))}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.sessionId === nextProps.sessionId &&
    prevProps.isStreaming === nextProps.isStreaming &&
    prevProps.onNavigateFile === nextProps.onNavigateFile &&
    areMessagesEqual(prevProps.messages, nextProps.messages)
  );
});
