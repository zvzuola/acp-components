import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { AvailableCommand } from '@agentclientprotocol/sdk';
import { useI18n } from '../../i18n';
import styles from './command-palette.module.scss';

export interface CommandPaletteProps {
  commands: AvailableCommand[];
  onSelect: (command: AvailableCommand) => void;
  disabled?: boolean;
  /** Inline mode: no trigger button, no search input, controlled externally */
  inline?: boolean;
  /** External control of open state (inline mode) */
  open?: boolean;
  /** External query text (inline mode) */
  query?: string;
  /** External active index (inline mode, for keyboard nav) */
  activeIndex?: number;
  /** Called when the palette requests close (Escape key) */
  onClose?: () => void;
  /** Additional class name for the wrapper */
  className?: string;
}

export function CommandPalette({
  commands,
  onSelect,
  disabled,
  inline,
  open: openProp,
  query: queryProp,
  activeIndex: activeIndexProp,
  onClose,
  className,
}: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [internalQuery, setInternalQuery] = useState('');
  const [internalActiveIndex, setInternalActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const isControlled = !!(inline && openProp !== undefined);
  const open = isControlled ? openProp : internalOpen;
  const query = inline && queryProp !== undefined ? queryProp : internalQuery;
  const activeIndex = isControlled && activeIndexProp !== undefined ? activeIndexProp : internalActiveIndex;
  const { t } = useI18n();

  const filtered = useMemo(() => {
    if (!query || !query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  }, [commands, query]);

  // Reset internal activeIndex when query changes (standalone mode only)
  useEffect(() => {
    if (!isControlled) {
      setInternalActiveIndex(0);
    }
  }, [query, isControlled]);

  const openPalette = useCallback(() => {
    if (disabled || commands.length === 0) return;
    setInternalOpen(true);
    setInternalQuery('');
    setInternalActiveIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [disabled, commands.length]);

  const closePalette = useCallback(() => {
    if (isControlled) {
      onClose?.();
    } else {
      setInternalOpen(false);
      setInternalQuery('');
      triggerRef.current?.focus();
    }
  }, [isControlled, onClose]);

  const selectCommand = useCallback(
    (command: AvailableCommand) => {
      onSelect(command);
      if (!isControlled) {
        setInternalOpen(false);
        setInternalQuery('');
      }
    },
    [onSelect, isControlled]
  );

  // Keyboard navigation (standalone mode only — inline mode handled by parent)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setInternalActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setInternalActiveIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filtered[internalActiveIndex]) {
            selectCommand(filtered[internalActiveIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          closePalette();
          break;
      }
    },
    [filtered, internalActiveIndex, selectCommand, closePalette]
  );

  // Scroll active item into view
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  // Close on outside click (standalone mode only)
  useEffect(() => {
    if (!open || isControlled) return;
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        closePalette();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, closePalette, isControlled]);

  if (!open) {
    if (!inline) {
      return (
        <div className={`${styles.acpCommandPalette}${className ? ` ${className}` : ''}`}>
          <button
            ref={triggerRef}
            className={styles.acpCommandPaletteTrigger}
            onClick={openPalette}
            disabled={disabled || commands.length === 0}
            aria-label={t('commandPalette.open')}
            title={t('commandPalette.commands')}
          >
            /
          </button>
        </div>
      );
    }
    return null;
  }

  return (
    <div className={`${styles.acpCommandPalette}${className ? ` ${className}` : ''}`}>
      {!inline && (
        <button
          ref={triggerRef}
          className={styles.acpCommandPaletteTrigger}
          onClick={openPalette}
          disabled={disabled || commands.length === 0}
          aria-label={t('commandPalette.open')}
          title={t('commandPalette.commands')}
        >
          /
        </button>
      )}
      <div ref={popoverRef} className={`${styles.acpCommandPalettePopover}${inline ? ` ${styles.acpCommandPalettePopoverInline}` : ''}`}>
        {!inline && (
          <div className={styles.acpCommandPaletteSearch}>
            <input
              ref={inputRef}
              type="text"
              placeholder={t('commandPalette.searchPlaceholder')}
              value={internalQuery}
              onChange={(e) => {
                setInternalQuery(e.target.value);
                setInternalActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
              aria-label={t('commandPalette.filterCommands')}
            />
          </div>
        )}
        <div ref={listRef} className={styles.acpCommandPaletteList} role="listbox">
          {filtered.length === 0 ? (
            <div className={styles.acpCommandPaletteEmpty}>
              {t('commandPalette.noMatching')}
            </div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.name}
                className={`${styles.acpCommandPaletteItem}${
                  i === activeIndex ? ` ${styles.acpCommandPaletteItemActive}` : ''
                }`}
                role="option"
                aria-selected={i === activeIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => selectCommand(cmd)}
                onMouseEnter={() => {
                  if (!isControlled) {
                    setInternalActiveIndex(i);
                  }
                }}
              >
                <span className={styles.acpCommandPaletteItemIcon}>/</span>
                <span className={styles.acpCommandPaletteItemBody}>
                  <div className={styles.acpCommandPaletteItemName}>
                    /{cmd.name}
                  </div>
                  <div className={styles.acpCommandPaletteItemDesc}>
                    {cmd.description}
                  </div>
                  {cmd.input && (
                    <div className={styles.acpCommandPaletteItemHint}>
                      {cmd.input.hint}
                    </div>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
