import React, { useEffect, useRef, useMemo } from 'react';
import { useSession } from '../../hooks/useSession';
import type { SessionId } from '@agentclientprotocol/sdk';
import type { Message } from '@acp-components/core';
import { MessageBubble } from './MessageBubble';
import { ChatComposer } from './ChatComposer';
import { StreamingIndicator } from './StreamingIndicator';
import { PlanView } from './PlanView';
import { UsageBar } from '../status-bar/UsageBar';
import { SessionConfigPanel } from '../session-config-panel';
import { useI18n } from '../../i18n';
import styles from './chat-view.module.scss';

export interface ChatViewProps {
  sessionId: SessionId | null;
  onNavigateFile?: (path: string, line?: number | null) => void;
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

export function ChatView({ sessionId, onNavigateFile }: ChatViewProps) {
  const { messages, isStreaming, plan, availableCommands } = useSession(sessionId);
  const listRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  const rounds = useMemo(() => groupMessagesIntoRounds(messages), [messages]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  if (!sessionId) {
    return (
      <div className={styles.acpChatView}>
        <div className={styles.acpChatEmpty}>
          {t('chat.emptyState')}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.acpChatView}>
      <div className={styles.acpChatHeader}>
        <span className={styles.acpChatHeaderTitle}>{t('chat.title')}</span>
        <div className={styles.acpChatHeaderControls}>
          <SessionConfigPanel sessionId={sessionId} />
          <UsageBar sessionId={sessionId} />
        </div>
      </div>
      <div className={styles.acpMessageList} ref={listRef} role="log" aria-live="polite" aria-label="Messages">
        {rounds.map((round, i) => {
          const isLastRound = i === rounds.length - 1;
          return (
            <div key={round.userMessage?.id ?? round.agentMessages[0]?.id ?? i} className={styles.acpRound}>
              {round.userMessage && (
                <MessageBubble messages={[round.userMessage]} onNavigateFile={onNavigateFile} />
              )}
              {round.agentMessages.length > 0 && (
                <MessageBubble messages={round.agentMessages} isStreaming={isLastRound && isStreaming} onNavigateFile={onNavigateFile} />
              )}
              {isLastRound && isStreaming && <StreamingIndicator />}
            </div>
          );
        })}
      </div>
      {plan.some((e) => e.status !== 'completed') && (
        <div className={styles.acpPlanWrapper}>
          <PlanView entries={plan} isStreaming={isStreaming} />
        </div>
      )}
      <ChatComposer sessionId={sessionId} isStreaming={isStreaming} availableCommands={availableCommands} />
    </div>
  );
}
