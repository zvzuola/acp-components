import React, { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { useSessionMessages, useSessionIsStreaming, useSessionPlan, useSessionAvailableCommands } from '../../hooks/useSession';
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

/**
 * Incremental round grouping — avoids O(n) full recomputation on every chunk
 * during streaming. When only the last message changed (the common streaming
 * pattern from appendContent/appendThought fast-path), we patch just the last
 * round instead of rebuilding the entire rounds array.
 */
function useRounds(messages: Message[], sessionId: SessionId | null): Round[] {
  const prevMessagesRef = useRef<Message[]>([]);
  const roundsRef = useRef<Round[]>([]);

  // Full reset when session changes
  useEffect(() => {
    prevMessagesRef.current = [];
    roundsRef.current = [];
  }, [sessionId]);

  return useMemo(() => {
    const prev = prevMessagesRef.current;

    // Fast path: same-length array, only the last message changed (streaming)
    if (
      prev.length === messages.length &&
      messages.length > 0 &&
      roundsRef.current.length > 0
    ) {
      let onlyLastChanged = true;
      for (let i = 0; i < messages.length - 1; i++) {
        if (prev[i] !== messages[i]) {
          onlyLastChanged = false;
          break;
        }
      }

      if (onlyLastChanged) {
        const lastMsg = messages[messages.length - 1];
        const rounds = roundsRef.current;
        const lastIdx = rounds.length - 1;
        const lastRound = rounds[lastIdx];

        const updatedRound: Round = { ...lastRound };
        if (lastMsg.role === 'user') {
          updatedRound.userMessage = lastMsg;
        } else {
          const agentMsgs = lastRound.agentMessages;
          const agentLastIdx = agentMsgs.length - 1;
          if (agentLastIdx >= 0 && agentMsgs[agentLastIdx].id === lastMsg.id) {
            // Replace existing last agent message (streaming update)
            updatedRound.agentMessages = [
              ...agentMsgs.slice(0, agentLastIdx),
              lastMsg,
            ];
          } else {
            // Append new agent message (new message in the same round, e.g. tool_call)
            updatedRound.agentMessages = [...agentMsgs, lastMsg];
          }
        }

        const newRounds = [...rounds.slice(0, lastIdx), updatedRound];
        prevMessagesRef.current = messages;
        roundsRef.current = newRounds;
        return newRounds;
      }
    }

    // Slow path: full recomputation (structural change or initial render)
    const newRounds = groupMessagesIntoRounds(messages);
    prevMessagesRef.current = messages;
    roundsRef.current = newRounds;
    return newRounds;
  }, [messages]);
}

export function ChatView({ sessionId, onNavigateFile }: ChatViewProps) {
  const messages = useSessionMessages(sessionId);
  const isStreaming = useSessionIsStreaming(sessionId);
  const plan = useSessionPlan(sessionId);
  const availableCommands = useSessionAvailableCommands(sessionId);
  const sessionTitle = useAcpStore((s) => {
    if (!sessionId) return null;
    for (const ws of s.workspaces.values()) {
      const meta = ws.sessions.get(sessionId);
      if (meta) return meta.title;
    }
    return null;
  });
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const scrollerElRef = useRef<HTMLElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const { t } = useI18n();

  // Intent-based auto-scroll tracking: only stop following when the user
  // *explicitly* scrolls up (wheel/touch). Content growth alone never stops it.
  const userScrolledUpRef = useRef(false);

  const [editText, setEditText] = useState<string | undefined>(undefined);

  const rounds = useRounds(messages, sessionId);

  const handleUserMessageEdit = useCallback((text: string) => {
    setEditText(text);
  }, []);

  // Listen for user-initiated scroll events (wheel / touch) to detect when
  // the user explicitly scrolls up — only then do we stop auto-following.
  useEffect(() => {
    const scroller = scrollerElRef.current;
    if (!scroller) return;

    let touchStartY = 0;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        userScrolledUpRef.current = true;
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? 0;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? touchStartY;
      const deltaY = touchStartY - y;
      if (deltaY < -5) {
        // finger moved downward → scrolling up in content
        userScrolledUpRef.current = true;
      }
    };

    scroller.addEventListener('wheel', handleWheel, { passive: true });
    scroller.addEventListener('touchstart', handleTouchStart, { passive: true });
    scroller.addEventListener('touchmove', handleTouchMove, { passive: true });
    return () => {
      scroller.removeEventListener('wheel', handleWheel);
      scroller.removeEventListener('touchstart', handleTouchStart);
      scroller.removeEventListener('touchmove', handleTouchMove);
    };
  }, [sessionId]);

  // When switching sessions, reset scroll intent.
  useEffect(() => {
    userScrolledUpRef.current = false;
  }, [sessionId]);

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    console.debug('ChatView: atBottom state changed:', atBottom, Date.now());
    setIsAtBottom(atBottom);
    if (atBottom) {
      userScrolledUpRef.current = false;
    } else if (!userScrolledUpRef.current) {
      // Content grew and we fell off the bottom — scroll to catch up.
      virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'auto' });
    }
  }, []);

  const handleScrollToBottom = useCallback(() => {
    userScrolledUpRef.current = false;
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
          key={sessionId} // reset virtuoso state when sessionId changes
          ref={virtuosoRef}
          scrollerRef={(el) => { scrollerElRef.current = el as HTMLElement | null; }}
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
