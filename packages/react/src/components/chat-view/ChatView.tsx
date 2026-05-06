import React, { useEffect, useRef } from 'react';
import { useSession } from '@acp-components/core';
import type { SessionId } from '@agentclientprotocol/sdk';
import { MessageBubble } from './MessageBubble';
import { ChatComposer } from './ChatComposer';
import { StreamingIndicator } from './StreamingIndicator';
import { ModelSelector } from './ModelSelector';
import { SessionModeSelector } from '../status-bar/SessionModeSelector';
import styles from './chat-view.module.scss';

export interface ChatViewProps {
  sessionId: SessionId | null;
}

export function ChatView({ sessionId }: ChatViewProps) {
  const { messages, isStreaming } = useSession(sessionId);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  if (!sessionId) {
    return (
      <div className={styles.acpChatView}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--acp-color-text-muted)' }}>
          Select or create a session to begin
        </div>
      </div>
    );
  }

  return (
    <div className={styles.acpChatView}>
      <div className={styles.acpChatHeader}>
        <span className={styles.acpChatHeaderTitle}>Chat</span>
        <div className={styles.acpChatHeaderControls}>
          <SessionModeSelector sessionId={sessionId} />
          <ModelSelector sessionId={sessionId} />
        </div>
      </div>
      <div className={styles.acpMessageList} ref={listRef} role="log" aria-live="polite" aria-label="Messages">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isStreaming && <StreamingIndicator />}
      </div>
      <ChatComposer sessionId={sessionId} isStreaming={isStreaming} />
    </div>
  );
}
