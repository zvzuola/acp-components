import React, { useRef, useMemo, useState, useCallback } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { useSession } from '../../hooks/useSession';
import { useAcpStore } from '../../hooks/useAcpStore';
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
  const sessionTitle = useAcpStore((s) => {
    if (!sessionId) return null;
    for (const ws of s.workspaces.values()) {
      const meta = ws.sessions.get(sessionId);
      if (meta) return meta.title;
    }
    return null;
  });
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const { t } = useI18n();

  const [editText, setEditText] = useState<string | undefined>(undefined);

  const rounds = useMemo(() => groupMessagesIntoRounds(messages), [messages]);

  const handleUserMessageEdit = useCallback((text: string) => {
    setEditText(text);
  }, []);

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    setIsAtBottom(atBottom);
  }, []);

  const handleScrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: isStreaming ? 'auto' : 'smooth' });
  }, [isStreaming]);


  const followOutput = useCallback(
    (_isAtBottom: boolean) => {
      return isStreaming ? 'smooth' : 'auto';
    },
    [isStreaming],
  );

  const computeItemKey = useCallback(
    (_index: number, round: Round) => {
      const key = round.userMessage?.id ?? round.agentMessages[0]?.id;
      return key ?? `round-${_index}`;
    },
    [],
  );

  const itemContent = useCallback(
    (_index: number, round: Round) => {
      const isLastRound = _index === rounds.length - 1;
      return (
        <div className={styles.acpVirtuosoItem}>
          <div className={styles.acpRound}>
            {round.userMessage && (
              <UserMessage message={round.userMessage} onEdit={handleUserMessageEdit} />
            )}
            {round.agentMessages.length > 0 && (
              <MessageBubble
                sessionId={sessionId}
                messages={round.agentMessages}
                isStreaming={isLastRound && isStreaming}
                onNavigateFile={onNavigateFile}
              />
            )}
            {isLastRound && isStreaming && <StreamingIndicator />}
          </div>
        </div>
      );
    },
    [rounds.length, isStreaming, handleUserMessageEdit, onNavigateFile],
  );

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
      <div className={styles.acpMessageListWrapper}>
        <Virtuoso
          ref={virtuosoRef}
          className={styles.acpMessageList}
          data={rounds}
          computeItemKey={computeItemKey}
          itemContent={itemContent}
          followOutput={followOutput}
          atBottomStateChange={handleAtBottomStateChange}
          initialTopMostItemIndex={{ index: 'LAST', align: 'end' }}
        />
        {!isAtBottom && (
          <button
            className={styles.acpScrollToBottom}
            onClick={handleScrollToBottom}
            aria-label={t('chat.scrollToBottom')}
            type="button"
          >
            <span className={styles.acpScrollToBottomArrow} />
          </button>
        )}
      </div>
      <div className={styles.acpChatBottom}>
        {plan.some((e) => e.status !== 'completed') && (
          <PlanView entries={plan} isStreaming={isStreaming} />
        )}
        <ChatComposer
          sessionId={sessionId}
          isStreaming={isStreaming}
          availableCommands={availableCommands}
          editText={editText}
          onEditTextConsumed={() => setEditText(undefined)}
        />
        <div className={styles.acpChatFooter}>
          <SessionConfigPanel sessionId={sessionId} />
          <UsageBar sessionId={sessionId} />
        </div>
      </div>
    </div>
  );
}
