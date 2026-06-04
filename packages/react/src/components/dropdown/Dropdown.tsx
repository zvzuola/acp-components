import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  cloneElement,
  isValidElement,
} from 'react';
import styles from './dropdown.module.scss';

// =============================================================================
// Context
// =============================================================================

interface DropdownContextValue {
  open: boolean;
  toggle: () => void;
  close: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  placement: DropdownPlacement;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

function useDropdownContext(): DropdownContextValue {
  const ctx = useContext(DropdownContext);
  if (!ctx) {
    throw new Error('Dropdown compound components must be used within <Dropdown>');
  }
  return ctx;
}

// =============================================================================
// Types
// =============================================================================

type DropdownPlacement = 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end';

// =============================================================================
// Dropdown (root)
// =============================================================================

export interface DropdownProps {
  children: React.ReactNode;
  placement?: DropdownPlacement;
  className?: string;
}

function DropdownRoot({ children, placement = 'bottom-start', className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        contentRef.current && !contentRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const ctx: DropdownContextValue = {
    open,
    toggle,
    close,
    triggerRef,
    contentRef,
    placement,
  };

  const placementClass =
    placement === 'top-start' ? styles.acpDropdownPlacementTopStart :
    placement === 'top-end' ? styles.acpDropdownPlacementTopEnd :
    placement === 'bottom-end' ? styles.acpDropdownPlacementBottomEnd :
    styles.acpDropdownPlacementBottomStart;

  return (
    <DropdownContext.Provider value={ctx}>
      <div
        className={`${styles.acpDropdown}${placementClass ? ` ${placementClass}` : ''}${className ? ` ${className}` : ''}`}
        data-acp-dropdown-open={open || undefined}
      >
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

// =============================================================================
// Trigger
// =============================================================================

export interface DropdownTriggerProps {
  children: React.ReactNode;
  /** When true, clones child element and attaches ref/onClick directly (no wrapper button). */
  asChild?: boolean;
  className?: string;
}

function Trigger({ children, asChild = false, className }: DropdownTriggerProps) {
  const { open, toggle, triggerRef } = useDropdownContext();

  if (asChild && isValidElement(children)) {
    const child = children as React.ReactElement<{
      ref?: React.Ref<HTMLElement>;
      onClick?: () => void;
      className?: string;
    }>;
    return cloneElement(child, {
      ref: triggerRef,
      onClick: toggle,
      className: `${child.props.className ?? ''}${open ? ` ${styles.acpDropdownTriggerActive}` : ''}`.trim(),
    });
  }

  return (
    <button
      ref={triggerRef as React.RefObject<HTMLButtonElement>}
      type="button"
      className={`${styles.acpDropdownTrigger}${open ? ` ${styles.acpDropdownTriggerActive}` : ''}${className ? ` ${className}` : ''}`}
      onClick={toggle}
    >
      {children}
    </button>
  );
}

// =============================================================================
// Content (floating panel)
// =============================================================================

export interface DropdownContentProps {
  children: React.ReactNode;
  className?: string;
  /** Panel width in pixels. Default: 220 */
  width?: number;
}

function Content({ children, className, width = 220 }: DropdownContentProps) {
  const { open, contentRef } = useDropdownContext();

  if (!open) return null;

  return (
    <div
      ref={contentRef}
      className={`${styles.acpDropdownContent}${className ? ` ${className}` : ''}`}
      style={{ width }}
      role="menu"
    >
      {children}
    </div>
  );
}

// =============================================================================
// Section (grouped items with optional label)
// =============================================================================

export interface DropdownSectionProps {
  children: React.ReactNode;
  label?: string;
}

function Section({ children, label }: DropdownSectionProps) {
  return (
    <div className={styles.acpDropdownSection} role="group" aria-label={label}>
      {label && (
        <div className={styles.acpDropdownSectionLabel}>{label}</div>
      )}
      {children}
    </div>
  );
}

// =============================================================================
// Item (clickable row with icon / label / value / slot)
// =============================================================================

export interface DropdownItemProps {
  /** Icon element rendered on the left */
  icon?: React.ReactNode;
  /** Primary label text */
  label: React.ReactNode;
  /** Secondary value text rendered on the right (before children/chevron) */
  value?: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  /** Extra slot on the right edge (e.g. toggle switch, badge) */
  children?: React.ReactNode;
  className?: string;
  /** ARIA role override. Default: "menuitem" */
  role?: string;
  /** For switch-like items */
  'aria-checked'?: boolean;
}

function Item({
  icon,
  label,
  value,
  disabled,
  onClick,
  children,
  className,
  role = 'menuitem',
  'aria-checked': ariaChecked,
}: DropdownItemProps) {
  const handleClick = () => {
    if (disabled) return;
    onClick?.();
  };

  return (
    <button
      type="button"
      className={`${styles.acpDropdownItem}${disabled ? ` ${styles.acpDropdownItemDisabled}` : ''}${className ? ` ${className}` : ''}`}
      onClick={handleClick}
      disabled={disabled}
      role={role}
      aria-checked={ariaChecked}
    >
      {icon && <span className={styles.acpDropdownItemIcon}>{icon}</span>}
      <span className={styles.acpDropdownItemLabel}>{label}</span>
      {value && <span className={styles.acpDropdownItemValue}>{value}</span>}
      {children}
    </button>
  );
}

// =============================================================================
// Submenu (hover-expandable group with nested items)
// =============================================================================

export interface DropdownSubmenuProps {
  icon?: React.ReactNode;
  label: React.ReactNode;
  value?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

function Submenu({ icon, label, value, children, className }: DropdownSubmenuProps) {
  const [expanded, setExpanded] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setExpanded(true);
  }, []);

  const handleLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => setExpanded(false), 200);
  }, []);

  const handleSubEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const handleSubLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => setExpanded(false), 200);
  }, []);

  return (
    <div
      className={`${styles.acpDropdownSubmenuGroup}${expanded ? ` ${styles.acpDropdownSubmenuGroupExpanded}` : ''}${className ? ` ${className}` : ''}`}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <div className={styles.acpDropdownItem} role="menuitem" aria-haspopup="true" aria-expanded={expanded}>
        {icon && <span className={styles.acpDropdownItemIcon}>{icon}</span>}
        <span className={styles.acpDropdownItemLabel}>{label}</span>
        {value && <span className={styles.acpDropdownItemValue}>{value}</span>}
        <span className={`${styles.acpDropdownChevron}${expanded ? ` ${styles.acpDropdownChevronExpanded}` : ''}`}>
          ›
        </span>
      </div>

      {expanded && (
        <div
          className={styles.acpDropdownSubmenu}
          onMouseEnter={handleSubEnter}
          onMouseLeave={handleSubLeave}
          role="menu"
        >
          {children}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SubmenuItem — simplified item for use inside Submenu
// =============================================================================

export interface DropdownSubmenuItemProps {
  label: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

function SubmenuItem({ label, active, onClick, className }: DropdownSubmenuItemProps) {
  const { close } = useDropdownContext();

  const handleClick = () => {
    onClick?.();
    close();
  };

  return (
    <button
      type="button"
      className={`${styles.acpDropdownSubmenuItem}${active ? ` ${styles.acpDropdownSubmenuItemActive}` : ''}${className ? ` ${className}` : ''}`}
      onClick={handleClick}
      role="menuitem"
    >
      <span>{label}</span>
      {active && <span className={styles.acpDropdownSubmenuCheck}>✓</span>}
    </button>
  );
}

// =============================================================================
// Compose compound component
// =============================================================================

export const Dropdown = Object.assign(DropdownRoot, {
  Trigger,
  Content,
  Section,
  Item,
  Submenu,
  SubmenuItem,
});
