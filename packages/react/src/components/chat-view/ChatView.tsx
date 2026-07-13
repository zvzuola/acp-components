import React, { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { useSessionMessages, useSessionIsStreaming, useSessionPlan, useSessionAvailableCommands, useSessionPendingPermissions } from '../../hooks/useSession';
import { useAcpStore } from '../../hooks/useAcpStore';
import { useFileViewer } from '../../hooks/useFileViewer';
import { usePrompt } from '../../hooks/usePrompt';
import type { SessionId, ContentBlock, PromptCapabilities } from '@acp-components/core';
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
import { PermissionPrompt } from '../permission-prompt/PermissionPrompt';

export interface ChatViewProps {
  sessionId: SessionId | null;
  /**
   * Override the file-open handler. Defaults to the global `useFileViewer`
   * `openFile` action (drives the built-in FileViewer). Provide this to route
   * file navigation to a custom destination instead.
   */
  onNavigateFile?: (path: string, line?: number | null) => void;
  /**
   * Whether to render the built-in header bar (session title). Defaults to
   * true. Set to false when embedding ChatView inside a container that
   * provides its own header (e.g. split panes in SessionView).
   */
  showHeader?: boolean;
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
  const sessionRef = useRef(sessionId);

  return useMemo(() => {
    // Full reset when session changes — done inline (during render) instead of
    // in an effect, so the refs are correct before the first useMemo pass.
    if (sessionRef.current !== sessionId) {
      sessionRef.current = sessionId;
      prevMessagesRef.current = [];
      roundsRef.current = [];
    }

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
  }, [messages, sessionId]);
}

export function ChatView({ sessionId, onNavigateFile, showHeader = true }: ChatViewProps) {
  const messages = useSessionMessages(sessionId);
  const isStreaming = useSessionIsStreaming(sessionId);
  const plan = useSessionPlan(sessionId);
  const availableCommands = useSessionAvailableCommands(sessionId);
  const pendingPermissions = useSessionPendingPermissions(sessionId);
  const { send, cancel } = usePrompt(sessionId);
  const promptCapabilities = useAcpStore((s) => {
    if (!sessionId) return undefined;
    for (const [, ws] of s.workspaces) {
      const meta = ws.sessions.get(sessionId);
      if (meta) {
        const agent = s.agents.get(meta.agentId);
        return agent?.capabilities?.promptCapabilities;
      }
    }
    return undefined;
  }) as PromptCapabilities | undefined;
  const { openFile: openFileAction } = useFileViewer();
  // Host override takes precedence; otherwise route to the global file viewer.
  const navigateFile = onNavigateFile ?? openFileAction;
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

  // Debounce timer for showing the scroll-to-bottom button. During streaming,
  // content growth can transiently push us off the bottom (before followOutput
  // catches up); debouncing here keeps the button from flickering on/off every
  // chunk. Cancelled if we return to bottom within the window.
  const showBtnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [composerValue, setComposerValue] = useState('');

  const rounds = useRounds(messages, sessionId);

  // Stable ref for rounds.length so itemContent callback doesn't invalidate
  // when a new round starts (avoids Virtuoso re-rendering all visible items).
  const roundsLengthRef = useRef(rounds.length);
  roundsLengthRef.current = rounds.length;

  const handleUserMessageEdit = useCallback((text: string) => {
    setComposerValue(text);
    // Focus the composer so the user can edit immediately.
    setTimeout(() => {
      const ta = window.document.querySelector<HTMLTextAreaElement>(
        `.${styles.acpChatView} textarea`,
      );
      if (ta) {
        ta.focus();
        ta.setSelectionRange(text.length, text.length);
      }
    }, 0);
  }, []);

  const handleComposerSend = useCallback(
    async (blocks: ContentBlock[]) => {
      if (!sessionId) return;
      setComposerValue('');
      await send(blocks);
    },
    [sessionId, send],
  );

  const handleComposerCancel = useCallback(() => {
    void cancel();
  }, [cancel]);

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

  // Clean up the debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (showBtnTimerRef.current) {
        clearTimeout(showBtnTimerRef.current);
        showBtnTimerRef.current = null;
      }
    };
  }, []);

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    if (atBottom) {
      // Back at bottom — cancel any pending button-show and hide immediately.
      if (showBtnTimerRef.current) {
        clearTimeout(showBtnTimerRef.current);
        showBtnTimerRef.current = null;
      }
      setIsAtBottom(true);
      userScrolledUpRef.current = false;
      return;
    }

    if (userScrolledUpRef.current) {
      // User explicitly scrolled up — show the button immediately, no debounce.
      if (showBtnTimerRef.current) {
        clearTimeout(showBtnTimerRef.current);
        showBtnTimerRef.current = null;
      }
      setIsAtBottom(false);
      return;
    }

    // Content grew and we fell off the bottom before followOutput caught up —
    // scroll the native scroller element directly to catch up. Unlike
    // Virtuoso's scrollToIndex (which computes its target from the item-size
    // tree that lags behind the real DOM mid-stream), scrollHeight stays
    // accurate while the last message is still growing.
    const el = scrollerElRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
    }

    // Debounce the button-show so transient off-bottom states during streaming
    // (between chunks / mid-follow-animation) don't flicker the button. Only
    // show if we stay off-bottom for the full window.
    if (showBtnTimerRef.current) clearTimeout(showBtnTimerRef.current);
    showBtnTimerRef.current = setTimeout(() => {
      showBtnTimerRef.current = null;
      setIsAtBottom(false);
    }, 200);
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
      const isLastRound = _index === roundsLengthRef.current - 1;
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
                onNavigateFile={navigateFile}
              />
            )}
            {isLastRound && isStreaming && <StreamingIndicator />}
          </div>
        </div>
      );
    },
    [sessionId, isStreaming, handleUserMessageEdit, navigateFile],
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
      {showHeader && (
        <div className={styles.acpChatHeader}>
          <span className={styles.acpChatHeaderTitle}>{sessionTitle || t('chat.title')}</span>
        </div>
      )}
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
        {pendingPermissions.length > 0 ? (
          <PermissionPrompt sessionId={sessionId} />
        ) : (
          <ChatComposer
            value={composerValue}
            onChange={setComposerValue}
            onSend={handleComposerSend}
            onCancel={handleComposerCancel}
            isStreaming={isStreaming}
            disabled={!sessionId}
            promptCapabilities={promptCapabilities}
            availableCommands={availableCommands}
          />
        )}
        <div className={styles.acpChatFooter}>
          <SessionConfigPanel sessionId={sessionId} />
          <UsageBar sessionId={sessionId} />
        </div>
      </div>
    </div>
  );
}
