import React, { useEffect, useRef, useMemo } from 'react';
import { useSession } from '@acp-components/core';
import type { SessionId } from '@agentclientprotocol/sdk';
import type { Message } from '@acp-components/core';
import { MessageBubble } from './MessageBubble';
import { ChatComposer } from './ChatComposer';
import { StreamingIndicator } from './StreamingIndicator';
import { ModelSelector } from './ModelSelector';
import { SessionModeSelector } from '../status-bar/SessionModeSelector';
import { PlanView } from './PlanView';
import styles from './chat-view.module.scss';

export interface ChatViewProps {
  sessionId: SessionId | null;
}

interface Round {
  userMessage?: Message;
  agentMessages: Message[];
}

function groupMessagesIntoRounds(messages: Message[]): Round[] {
  const rounds: Round[] = [];
  let currentRound: Round | null = null;

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (currentRound) {
        rounds.push(currentRound);
      }
      currentRound = { userMessage: msg, agentMessages: [] };
    } else {
      if (!currentRound) {
        currentRound = { agentMessages: [] };
      }
      currentRound.agentMessages.push(msg);
    }
  }

  if (currentRound && (currentRound.userMessage || currentRound.agentMessages.length > 0)) {
    rounds.push(currentRound);
  }

  return rounds;
}

export function ChatView({ sessionId }: ChatViewProps) {
  const { messages, isStreaming, plan } = useSession(sessionId);
  const listRef = useRef<HTMLDivElement>(null);

  const rounds = useMemo(() => groupMessagesIntoRounds(messages), [messages]);

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
        {rounds.map((round, i) => {
          const isLastRound = i === rounds.length - 1;
          return (
            <div key={round.userMessage?.id ?? round.agentMessages[0]?.id ?? i} className={styles.acpRound}>
              {round.userMessage && (
                <MessageBubble messages={[round.userMessage]} />
              )}
              {round.agentMessages.length > 0 && (
                <MessageBubble messages={round.agentMessages} isStreaming={isLastRound && isStreaming} />
              )}
              {isLastRound && isStreaming && <StreamingIndicator />}
            </div>
          );
        })}
      </div>
      <PlanView entries={plan} isStreaming={isStreaming} />
      <ChatComposer sessionId={sessionId} isStreaming={isStreaming} />
    </div>
  );
}
