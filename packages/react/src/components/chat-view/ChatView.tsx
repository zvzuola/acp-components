import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useSession } from '../../hooks/useSession';
import { useSessions } from '../../hooks/useSessions';
import type { SessionId } from '@acp-components/core';
import type { Message } from '@acp-components/core';
import { MessageBubble } from './MessageBubble';
import { UserMessage } from './UserMessage';
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
  const { sessions } = useSessions();
  const sessionTitle = useMemo(() => {
    if (!sessionId) return null;
    return sessions.find((s) => s.id === sessionId)?.title;
  }, [sessions, sessionId]);
  const listRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  const [editText, setEditText] = useState<string | undefined>(undefined);

  const rounds = useMemo(() => groupMessagesIntoRounds(messages), [messages]);

  const handleUserMessageEdit = useCallback((text: string) => {
    setEditText(text);
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: isStreaming ? 'smooth' : 'instant',
      });
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
        <span className={styles.acpChatHeaderTitle}>{sessionTitle || t('chat.title')}</span>
      </div>
      <div className={styles.acpMessageList} ref={listRef} role="log" aria-live="polite" aria-label="Messages">
        {rounds.map((round, i) => {
          const isLastRound = i === rounds.length - 1;
          return (
            <div key={round.userMessage?.id ?? round.agentMessages[0]?.id ?? i} className={styles.acpRound}>
              {round.userMessage && (
                <UserMessage message={round.userMessage} onEdit={handleUserMessageEdit} />
              )}
              {round.agentMessages.length > 0 && (
                <MessageBubble messages={round.agentMessages} isStreaming={isLastRound && isStreaming} onNavigateFile={onNavigateFile} />
              )}
              {isLastRound && isStreaming && <StreamingIndicator />}
            </div>
          );
        })}
      </div>
      <div className={styles.acpChatBottom}>
        {plan.some((e) => e.status !== 'completed') && (
          <PlanView entries={plan} isStreaming={isStreaming} />
        )}
        <ChatComposer sessionId={sessionId} isStreaming={isStreaming} availableCommands={availableCommands} editText={editText} onEditTextConsumed={() => setEditText(undefined)} />
        <div className={styles.acpChatFooter}>
          <SessionConfigPanel sessionId={sessionId} />
          <UsageBar sessionId={sessionId} />
        </div>
      </div>
    </div>
  );
}
