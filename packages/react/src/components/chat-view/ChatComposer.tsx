import React, { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import {
  FileTextOutlined,
  CloseOutlined,
  PaperClipOutlined,
  PauseOutlined,
  ArrowUpOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import type { ContentBlock, AvailableCommand, PromptCapabilities } from '@acp-components/core';
import { CommandPalette } from '../command-palette';
import { useI18n } from '../../i18n';
import styles from './chat-composer.module.scss';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Pure presentational composer. Owns only attachment state + the slash-command
 * palette; the text value is controlled by the caller, and sending / cancelling
 * is delegated entirely to {@link ChatComposerProps.onSend} /
 * {@link ChatComposerProps.onCancel}. The component never touches the prompt
 * action or the acp store - that wiring lives in the host (ChatView,
 * NewSessionView, ...).
 */
export interface ChatComposerProps {
  /** Controlled text value. */
  value: string;
  /** Called on every text change. */
  onChange: (value: string) => void;
  /**
   * Send the assembled content blocks (text + attached files, already shaped
   * per `promptCapabilities`). The composer clears its attachments on send;
   * the caller is responsible for clearing the text value (via `onChange`).
   */
  onSend: (blocks: ContentBlock[]) => void | Promise<void>;
  /** Called when the cancel button is clicked (shown while `isStreaming`). */
  onCancel?: () => void;
  /** Show the cancel button instead of send (agent is generating). */
  isStreaming: boolean;
  /** Disable the whole composer (e.g. no session yet). */
  disabled?: boolean;
  /** Override the textarea placeholder. */
  placeholder?: string;
  /** Drives attachment content-block shape (image / resource / link). */
  promptCapabilities?: PromptCapabilities;
  /** Slash-command catalog; when empty the palette never opens. */
  availableCommands?: AvailableCommand[];
}

interface AttachedFile {
  file: File;
  previewUrl: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ChatComposer
// ---------------------------------------------------------------------------

export function ChatComposer({
  value,
  onChange,
  onSend,
  onCancel,
  isStreaming,
  disabled = false,
  placeholder,
  promptCapabilities,
  availableCommands,
}: ChatComposerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();

  const [isDragOver, setIsDragOver] = useState(false);
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
      onChange(newValue);
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
    [value, commandState, onChange]
  );

  const sendText = useCallback(
    async (text: string) => {
      if ((!text.trim() && attachedFiles.length === 0) || isStreaming || disabled) return;
      const blocks = await buildContentBlocks(text, attachedFiles, promptCapabilities);
      setAttachedFiles([]);
      await onSend(blocks);
    },
    [isStreaming, disabled, attachedFiles, onSend, promptCapabilities]
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
            // Shift+Enter falls through to insert a newline instead of selecting.
            if (e.shiftKey) break;
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

      // Insert a newline on Shift+Enter or Ctrl/Cmd+Enter (default textarea behavior).
      if (e.key === 'Enter' && (e.shiftKey || e.ctrlKey || e.metaKey)) {
        return;
      }

      if (e.key === 'Enter' && !showPalette) {
        e.preventDefault();
        handleSend();
      }
    },
    [showPalette, filteredCommands, activeIndex, selectCommand, selectAndSendCommand, closePalette, handleSend]
  );

  // Auto-resize the textarea to fit its content (capped by CSS max-height so
  // long drafts scroll internally instead of growing the layout indefinitely).
  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  // Reusable attachment path shared by the file input, drag-and-drop, and paste.
  const addFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    const newEntries: AttachedFile[] = files.map((file) => ({
      file,
      previewUrl: null,
    }));
    setAttachedFiles((prev) => [...prev, ...newEntries]);

    // Generate previews for image files asynchronously.
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
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (disabled) return;
    if (Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault();
      setIsDragOver(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related === null || !e.currentTarget.contains(related)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragOver(false);
    addFiles(Array.from(e.dataTransfer.files ?? []));
  }, [disabled, addFiles]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (disabled) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  }, [disabled, addFiles]);

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFilesChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    addFiles(files);
    // Reset input so the same file can be re-selected.
    e.target.value = '';
  }, [addFiles]);

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

  const canSend =
    (value.trim().length > 0 || attachedFiles.length > 0) && !disabled && !isStreaming;

  return (
    <div
      className={styles.acpChatComposer}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
                    <span className={styles.acpChatComposerFileThumb}><FileTextOutlined /></span>
                  )}
                  <span className={styles.acpChatComposerFileName}>{af.file.name}</span>
                  <span className={styles.acpChatComposerFileSize}>{formatFileSize(af.file.size)}</span>
                  <button
                    className={styles.acpChatComposerFileRemove}
                    onClick={() => handleRemoveFile(i)}
                    aria-label={t('composer.removeFileAriaLabel')}
                  >
                    <CloseOutlined />
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            className={styles.acpChatComposerInput}
            placeholder={placeholder ?? t('composer.placeholder')}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setActiveIndex(0);
              setPaletteSuppressed(false);
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={() => showPalette && closePalette()}
            rows={1}
            disabled={disabled}
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
              disabled={disabled}
              aria-label={t('composer.attachFileAriaLabel')}
              title={t('composer.attachFile')}
            >
              <PaperClipOutlined />
            </button>
            {isStreaming ? (
              <button
                className={styles.acpChatComposerCancel}
                onClick={onCancel}
                disabled={!onCancel}
                aria-label={t('composer.cancelAriaLabel')}
                title={t('composer.cancel')}
              >
                <PauseOutlined />
              </button>
            ) : (
              <button
                className={styles.acpChatComposerSend}
                onClick={handleSend}
                disabled={!canSend}
                aria-label={t('composer.sendAriaLabel')}
                title={t('composer.send')}
              >
                <ArrowUpOutlined />
              </button>
            )}
          </div>
        </div>
      </div>

      {isDragOver && (
        <div className={styles.acpChatComposerDropOverlay} aria-hidden="true">
          <span className={styles.acpChatComposerDropIcon}><InboxOutlined /></span>
          <span className={styles.acpChatComposerDropText}>{t('composer.dropFiles')}</span>
        </div>
      )}
    </div>
  );
}
