import React, { useState, useCallback, useRef, useMemo } from 'react';
import { usePrompt } from '../../hooks/usePrompt';
import type { SessionId, ContentBlock, AvailableCommand } from '@agentclientprotocol/sdk';
import { CommandPalette } from '../command-palette';
import { useI18n } from '../../i18n';
import styles from './chat-composer.module.scss';

export interface ChatComposerProps {
  sessionId: SessionId | null;
  isStreaming: boolean;
  availableCommands?: AvailableCommand[];
}

function getCommandQuery(value: string, cursorPos: number): { query: string; slashIndex: number } | null {
  const beforeCursor = value.slice(0, cursorPos);
  const slashIdx = beforeCursor.lastIndexOf('/');

  if (slashIdx === -1) return null;
  if (slashIdx > 0 && beforeCursor[slashIdx - 1] !== ' ') return null;

  const afterSlash = beforeCursor.slice(slashIdx + 1);
  if (afterSlash.includes(' ')) return null;

  return { query: afterSlash, slashIndex: slashIdx };
}

export function ChatComposer({ sessionId, isStreaming, availableCommands }: ChatComposerProps) {
  const [value, setValue] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const { send, cancel } = usePrompt(sessionId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { t } = useI18n();

  const commandState = useMemo(() => {
    if (!availableCommands || availableCommands.length === 0) return null;
    const pos = textareaRef.current?.selectionStart ?? value.length;
    return getCommandQuery(value, pos);
  }, [value, availableCommands]);

  const showPalette = commandState !== null;

  // Filter commands by query
  const filteredCommands = useMemo(() => {
    if (!commandState || !commandState.query) return availableCommands ?? [];
    const q = commandState.query.toLowerCase();
    return (availableCommands ?? []).filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  }, [availableCommands, commandState]);

  const closePalette = useCallback(() => {
    setActiveIndex(0);
    textareaRef.current?.focus();
  }, []);

  const selectCommand = useCallback(
    (cmd: AvailableCommand) => {
      if (!commandState) return;
      const before = value.slice(0, commandState.slashIndex);
      const cursorPos = textareaRef.current?.selectionStart ?? commandState.slashIndex;
      const after = value.slice(cursorPos);
      const insertion = `/${cmd.name} `;
      const newValue = before + insertion + after;
      setValue(newValue);
      setActiveIndex(0);
      const cursorTarget = before.length + insertion.length;
      setTimeout(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.focus();
          ta.setSelectionRange(cursorTarget, cursorTarget);
        }
      }, 0);
    },
    [value, commandState]
  );

  const handleSend = useCallback(async () => {
    if (!value.trim() || !sessionId || isStreaming) return;
    const text = value;
    setValue('');
    const blocks: ContentBlock[] = [
      { type: 'text', text, _meta: null, annotations: null },
    ];
    await send(blocks);
  }, [value, sessionId, isStreaming, send]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showPalette) {
        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
            return;
          case 'ArrowUp':
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
            return;
          case 'Enter':
            if (filteredCommands[activeIndex]) {
              e.preventDefault();
              selectCommand(filteredCommands[activeIndex]);
              return;
            }
            // No match — let Enter send the message (fall through)
            break;
          case 'Escape':
            e.preventDefault();
            closePalette();
            return;
          case 'Tab':
            if (filteredCommands[activeIndex]) {
              e.preventDefault();
              selectCommand(filteredCommands[activeIndex]);
              return;
            }
            break;
        }
      }

      // Ctrl+Enter: insert newline (default behavior)
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        return;
      }

      // Enter without palette: send
      if (e.key === 'Enter' && !showPalette) {
        e.preventDefault();
        handleSend();
      }
    },
    [showPalette, filteredCommands, activeIndex, selectCommand, closePalette, handleSend]
  );

  const handleCancel = useCallback(() => {
    cancel();
  }, [cancel]);

  // Reset activeIndex when query changes
  const prevQuery = useRef(commandState?.query);
  if (commandState?.query !== prevQuery.current) {
    prevQuery.current = commandState?.query;
    // Reset is async-safe since it runs during render
    if (activeIndex !== 0) {
      setActiveIndex(0);
    }
  }

  return (
    <div className={styles.acpChatComposer}>
      {showPalette && (
        <CommandPalette
          inline
          open
          query={commandState.query}
          activeIndex={activeIndex}
          commands={availableCommands!}
          onSelect={selectCommand}
          onClose={closePalette}
          className={styles.acpComposerPalette}
        />
      )}
      <div className={styles.acpChatComposerForm}>
        <textarea
          ref={textareaRef}
          className={styles.acpChatComposerInput}
          placeholder={t('composer.placeholder')}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={!sessionId}
          aria-label={t('composer.ariaLabel')}
        />
        {isStreaming ? (
          <button
            className={styles.acpChatComposerCancel}
            onClick={handleCancel}
            aria-label={t('composer.cancelAriaLabel')}
            title={t('composer.cancel')}
          >
            &#x25a0;
          </button>
        ) : (
          <button
            className={styles.acpChatComposerSend}
            onClick={handleSend}
            disabled={!value.trim() || !sessionId}
            aria-label={t('composer.sendAriaLabel')}
            title={t('composer.send')}
          >
            &#x2191;
          </button>
        )}
      </div>
      <div className={styles.acpChatComposerHint}>{t('composer.hint')}</div>
    </div>
  );
}
