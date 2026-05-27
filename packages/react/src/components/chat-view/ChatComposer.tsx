import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { usePrompt } from '../../hooks/usePrompt';
import { useAcpStore } from '../../hooks/useAcpStore';
import type { SessionId, ContentBlock, AvailableCommand, PromptCapabilities } from '@agentclientprotocol/sdk';
import { CommandPalette } from '../command-palette';
import { useI18n } from '../../i18n';
import styles from './chat-composer.module.scss';

export interface ChatComposerProps {
  sessionId: SessionId | null;
  isStreaming: boolean;
  availableCommands?: AvailableCommand[];
  editText?: string;
  onEditTextConsumed?: () => void;
}

interface AttachedFile {
  file: File;
  previewUrl: string | null;
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function buildContentBlocks(
  text: string,
  attachedFiles: AttachedFile[],
  promptCapabilities?: PromptCapabilities,
): Promise<ContentBlock[]> {
  const blocks: ContentBlock[] = [];

  for (const af of attachedFiles) {
    const { file } = af;
    if (file.type.startsWith('image/')) {
      const data = await fileToBase64(file);
      blocks.push({
        type: 'image',
        data,
        mimeType: file.type,
        uri: `file://${file.name}`,
        _meta: null,
        annotations: null,
      });
    } else if (promptCapabilities?.embeddedContext) {
      const data = await fileToBase64(file);
      blocks.push({
        type: 'resource',
        resource: {
          blob: data,
          uri: `file://${file.name}`,
          mimeType: file.type || undefined,
        },
        _meta: null,
        annotations: null,
      });
    } else {
      blocks.push({
        type: 'resource_link',
        uri: `file://${file.name}`,
        name: file.name,
        mimeType: file.type || undefined,
        size: file.size,
        _meta: null,
        annotations: null,
      });
    }
  }

  if (text.trim()) {
    blocks.push({ type: 'text', text, _meta: null, annotations: null });
  }

  return blocks;
}

export function ChatComposer({ sessionId, isStreaming, availableCommands, editText, onEditTextConsumed }: ChatComposerProps) {
  const [value, setValue] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
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
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();

  const [paletteSuppressed, setPaletteSuppressed] = useState(false);

  const commandState = useMemo(() => {
    if (!availableCommands || availableCommands.length === 0) return null;
    const pos = textareaRef.current?.selectionStart ?? value.length;
    return getCommandQuery(value, pos);
  }, [value, availableCommands]);

  const showPalette = commandState !== null && !paletteSuppressed;

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
    setPaletteSuppressed(true);
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
      setPaletteSuppressed(true);
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

  const sendText = useCallback(
    async (text: string) => {
      if ((!text.trim() && attachedFiles.length === 0) || !sessionId || isStreaming) return;
      setValue('');
      const blocks = await buildContentBlocks(text, attachedFiles, promptCapabilities);
      setAttachedFiles([]);
      await send(blocks);
    },
    [sessionId, isStreaming, attachedFiles, send, promptCapabilities]
  );

  const handleSend = useCallback(async () => {
    await sendText(value);
  }, [value, sendText]);

  const selectAndSendCommand = useCallback(
    async (cmd: AvailableCommand) => {
      if (!commandState) return;
      const before = value.slice(0, commandState.slashIndex);
      const cursorPos = textareaRef.current?.selectionStart ?? commandState.slashIndex;
      const after = value.slice(cursorPos);
      const finalText = before + `/${cmd.name} ` + after;
      setActiveIndex(0);
      await sendText(finalText);
    },
    [value, commandState, sendText]
  );

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
              selectAndSendCommand(filteredCommands[activeIndex]);
              return;
            }
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

      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        return;
      }

      if (e.key === 'Enter' && !showPalette) {
        e.preventDefault();
        handleSend();
      }
    },
    [showPalette, filteredCommands, activeIndex, selectCommand, selectAndSendCommand, closePalette, handleSend]
  );

  const handleCancel = useCallback(() => {
    cancel();
  }, [cancel]);

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFilesChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const newEntries: AttachedFile[] = files.map((file) => ({
      file,
      previewUrl: file.type.startsWith('image/') ? null : null,
    }));
    setAttachedFiles((prev) => [...prev, ...newEntries]);

    // Generate previews for image files asynchronously
    for (const entry of newEntries) {
      if (entry.file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          setAttachedFiles((prev) =>
            prev.map((af) =>
              af.file === entry.file ? { ...af, previewUrl: reader.result as string } : af
            )
          );
        };
        reader.readAsDataURL(entry.file);
      }
    }

    // Reset input so the same file can be re-selected
    e.target.value = '';
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const prevQuery = useRef(commandState?.query);
  if (commandState?.query !== prevQuery.current) {
    prevQuery.current = commandState?.query;
    if (activeIndex !== 0) {
      setActiveIndex(0);
    }
  }

  const canSend = (value.trim().length > 0 || attachedFiles.length > 0) && !!sessionId;

  useEffect(() => {
    if (editText == null) return;
    setValue(editText);
    onEditTextConsumed?.();
    setTimeout(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(editText.length, editText.length);
      }
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editText]);

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
        <div className={styles.acpChatComposerBody}>
          {attachedFiles.length > 0 && (
            <div className={styles.acpChatComposerFileList}>
              {attachedFiles.map((af, i) => (
                <div key={`${af.file.name}-${i}`} className={styles.acpChatComposerFileChip}>
                  {af.previewUrl ? (
                    <img src={af.previewUrl} alt={af.file.name} className={styles.acpChatComposerFileThumb} />
                  ) : (
                    <span className={styles.acpChatComposerFileThumb}>&#x1f4c4;</span>
                  )}
                  <span className={styles.acpChatComposerFileName}>{af.file.name}</span>
                  <span className={styles.acpChatComposerFileSize}>{formatFileSize(af.file.size)}</span>
                  <button
                    className={styles.acpChatComposerFileRemove}
                    onClick={() => handleRemoveFile(i)}
                    aria-label={t('composer.removeFileAriaLabel')}
                  >
                    &#x2715;
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            className={styles.acpChatComposerInput}
            placeholder={t('composer.placeholder')}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setActiveIndex(0);
              setPaletteSuppressed(false);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => showPalette && closePalette()}
            rows={1}
            disabled={!sessionId}
            aria-label={t('composer.ariaLabel')}
          />
          <div className={styles.acpChatComposerActions}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={handleFilesChange}
            />
            <button
              className={styles.acpChatComposerAttachBtn}
              onClick={handleAttachClick}
              disabled={!sessionId}
              aria-label={t('composer.attachFileAriaLabel')}
              title={t('composer.attachFile')}
            >
              &#x1f4ce;
            </button>
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
                disabled={!canSend}
                aria-label={t('composer.sendAriaLabel')}
                title={t('composer.send')}
              >
                &#x2191;
              </button>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
