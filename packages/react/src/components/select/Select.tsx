import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styles from './select.module.scss';

// =============================================================================
// Types
// =============================================================================

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectOptionGroup {
  label: string;
  options: SelectOption[];
}

export interface SelectProps {
  /** Flat options or grouped options */
  options: (SelectOption | SelectOptionGroup)[];
  /** Currently selected value */
  value: string;
  /** Called with the newly selected value */
  onChange: (value: string) => void;
  /** Text shown when no value is selected */
  placeholder?: string;
  disabled?: boolean;
  /** Hide the trigger border for a cleaner inline appearance */
  borderless?: boolean;
  className?: string;
  'aria-label'?: string;
  id?: string;
}

// =============================================================================
// Helpers
// =============================================================================

interface FlatOption {
  value: string;
  label: string;
  groupLabel?: string;
}

function flattenOptions(options: (SelectOption | SelectOptionGroup)[]): FlatOption[] {
  const result: FlatOption[] = [];
  for (const opt of options) {
    if ('options' in opt) {
      for (const child of opt.options) {
        result.push({ value: child.value, label: child.label, groupLabel: opt.label });
      }
    } else {
      result.push({ value: opt.value, label: opt.label });
    }
  }
  return result;
}

function isGroup(opt: SelectOption | SelectOptionGroup): opt is SelectOptionGroup {
  return 'options' in opt;
}

// =============================================================================
// Constants
// =============================================================================

const POPOVER_GAP = 4;
const POPOVER_MAX_HEIGHT = 240;
const POPOVER_VIEWPORT_MARGIN = 8;

// =============================================================================
// Select
// =============================================================================

export function Select({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  borderless,
  className,
  'aria-label': ariaLabel,
  id,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const flat = useMemo(() => flattenOptions(options), [options]);

  const selectedLabel = useMemo(() => {
    const found = flat.find((o) => o.value === value);
    return found?.label ?? placeholder ?? '';
  }, [flat, value, placeholder]);

  // ── Calculate popover position on open ─────────────────────────────────
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const viewportH = window.innerHeight;

    const spaceBelow = viewportH - triggerRect.bottom - POPOVER_VIEWPORT_MARGIN;
    const spaceAbove = triggerRect.top - POPOVER_VIEWPORT_MARGIN;

    // Decide placement: prefer below unless insufficient space
    let dir: 'bottom' | 'top' = 'bottom';
    let maxH = POPOVER_MAX_HEIGHT;

    if (spaceBelow < POPOVER_MAX_HEIGHT && spaceAbove > spaceBelow) {
      dir = 'top';
      maxH = Math.min(POPOVER_MAX_HEIGHT, spaceAbove);
    } else {
      maxH = Math.min(POPOVER_MAX_HEIGHT, spaceBelow);
    }

    setPlacement(dir);

    const triggerW = triggerRect.width;

    if (dir === 'bottom') {
      setPopoverStyle({
        position: 'fixed',
        top: triggerRect.bottom + POPOVER_GAP,
        left: triggerRect.left,
        minWidth: triggerW,
        maxHeight: maxH,
      });
    } else {
      setPopoverStyle({
        position: 'fixed',
        bottom: viewportH - triggerRect.top + POPOVER_GAP,
        left: triggerRect.left,
        minWidth: triggerW,
        maxHeight: maxH,
      });
    }
  }, [open]);

  // ── Close on outside click ────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      if (listRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Scroll focused option into view ───────────────────────────────────
  useEffect(() => {
    if (!open || focusIdx < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[role="option"]');
    if (items[focusIdx]) {
      items[focusIdx].scrollIntoView({ block: 'nearest' });
    }
  }, [open, focusIdx]);

  // ── Keyboard navigation ───────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (!open) {
            setOpen(true);
            setFocusIdx(0);
          } else {
            setFocusIdx((i) => (i + 1) % flat.length);
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (open) {
            setFocusIdx((i) => (i <= 0 ? flat.length - 1 : i - 1));
          }
          break;

        case 'Enter':
        case ' ':
          e.preventDefault();
          if (open && focusIdx >= 0) {
            onChange(flat[focusIdx].value);
            setOpen(false);
            triggerRef.current?.focus();
          } else {
            setOpen(true);
            setFocusIdx(flat.findIndex((o) => o.value === value));
          }
          break;

        case 'Escape':
          e.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
          break;

        case 'Tab':
          setOpen(false);
          break;
      }
    },
    [open, focusIdx, flat, onChange, value],
  );

  // ── Select an option by click ─────────────────────────────────────────
  const handleSelect = useCallback(
    (optValue: string) => {
      onChange(optValue);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange],
  );

  const toggle = useCallback(() => {
    if (disabled) return;
    setOpen((o) => {
      if (!o) {
        const idx = flat.findIndex((opt) => opt.value === value);
        setFocusIdx(idx >= 0 ? idx : 0);
      }
      return !o;
    });
  }, [disabled, flat, value]);

  // ── Popover renderer ──────────────────────────────────────────────────
  const popover = open && (
    <div
      ref={listRef}
      className={`${styles.acpSelectPopover}${placement === 'top' ? ` ${styles.acpSelectPopoverTop}` : ''}`}
      style={popoverStyle}
      role="listbox"
      tabIndex={-1}
    >
      {options.map((opt, groupIdx) => {
        if (isGroup(opt)) {
          return (
            <div key={groupIdx} className={styles.acpSelectGroup} role="group" aria-label={opt.label}>
              <div className={styles.acpSelectGroupLabel}>{opt.label}</div>
              {opt.options.map((child) => {
                const globalIdx = flat.findIndex((f) => f.value === child.value);
                const isSelected = child.value === value;
                const isFocused = globalIdx === focusIdx;
                return (
                  <div
                    key={child.value}
                    className={`${styles.acpSelectOption}${isSelected ? ` ${styles.acpSelectOptionSelected}` : ''}${isFocused ? ` ${styles.acpSelectOptionFocused}` : ''}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(child.value)}
                    onMouseEnter={() => setFocusIdx(globalIdx)}
                  >
                    <span className={styles.acpSelectOptionLabel}>{child.label}</span>
                    {isSelected && (
                      <span className={styles.acpSelectCheck} aria-hidden="true">✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        }

        // Flat option
        const globalIdx = flat.findIndex((f) => f.value === opt.value);
        const isSelected = opt.value === value;
        const isFocused = globalIdx === focusIdx;
        return (
          <div
            key={opt.value}
            className={`${styles.acpSelectOption}${isSelected ? ` ${styles.acpSelectOptionSelected}` : ''}${isFocused ? ` ${styles.acpSelectOptionFocused}` : ''}`}
            role="option"
            aria-selected={isSelected}
            onClick={() => handleSelect(opt.value)}
            onMouseEnter={() => setFocusIdx(globalIdx)}
          >
            <span className={styles.acpSelectOptionLabel}>{opt.label}</span>
            {isSelected && (
              <span className={styles.acpSelectCheck} aria-hidden="true">✓</span>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={`${styles.acpSelect}${disabled ? ` ${styles.acpSelectDisabled}` : ''}${className ? ` ${className}` : ''}`}
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`${styles.acpSelectTrigger}${open ? ` ${styles.acpSelectTriggerOpen}` : ''}${borderless ? ` ${styles.acpSelectTriggerBorderless}` : ''}`}
        onClick={toggle}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        disabled={disabled}
        tabIndex={0}
      >
        <span className={`${styles.acpSelectValue}${!flat.some((o) => o.value === value) ? ` ${styles.acpSelectPlaceholder}` : ''}`}>
          {selectedLabel}
        </span>
        <span className={`${styles.acpSelectChevron}${open ? ` ${styles.acpSelectChevronOpen}` : ''}`} aria-hidden="true" />
      </button>

      {createPortal(popover, document.body)}
    </div>
  );
}
