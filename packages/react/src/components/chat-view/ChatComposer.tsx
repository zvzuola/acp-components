import React, { useState, useCallback, useRef, KeyboardEvent } from 'react';
import { usePrompt } from '@acp-components/core';
import type { SessionId, ContentBlock } from '@agentclientprotocol/sdk';
import styles from './composer.module.scss';

export interface ChatComposerProps {
  sessionId: SessionId | null;
  isStreaming: boolean;
}

export function ChatComposer({ sessionId, isStreaming }: ChatComposerProps) {
  const [value, setValue] = useState('');
  const { send, cancel } = usePrompt(sessionId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(async () => {
    if (!value.trim() || !sessionId || isStreaming) return;
    const text = value;
    setValue('');
    const blocks: ContentBlock[] = [
      { type: 'text', text, _meta: null, annotations: null },
    ];
    await send(blocks);
  }, [value, sessionId, isStreaming, send]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleCancel = useCallback(() => {
    cancel();
  }, [cancel]);

  const adjustHeight = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  };

  return (
    <div className={styles.acpChatComposer}>
      <div className={styles.acpChatComposerForm}>
        <textarea
          ref={textareaRef}
          className={styles.acpChatComposerInput}
          placeholder="Type a message... (Ctrl+Enter to send)"
          value={value}
          onChange={(e) => { setValue(e.target.value); adjustHeight(); }}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={!sessionId}
          aria-label="Message input"
        />
        {isStreaming ? (
          <button
            className={styles.acpChatComposerCancel}
            onClick={handleCancel}
            aria-label="Cancel generation"
            title="Cancel"
          >
            &#x25a0;
          </button>
        ) : (
          <button
            className={styles.acpChatComposerSend}
            onClick={handleSend}
            disabled={!value.trim() || !sessionId}
            aria-label="Send message"
            title="Send (Ctrl+Enter)"
          >
            &#x2191;
          </button>
        )}
      </div>
      <div className={styles.acpChatComposerHint}>Ctrl+Enter to send</div>
    </div>
  );
}
