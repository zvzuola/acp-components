import React from 'react';
import { SessionList } from '../session-list';
import type { SessionMeta } from '@acp-components/core';
import { SettingsMenu } from '../settings-menu/SettingsMenu';
import { useI18n } from '../../i18n';
import styles from './sidebar.module.scss';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** View id used by the sidebar nav. The built-in ids live in <WorkbenchShell>. */
export type SidebarViewId = string;

/**
 * A navigation entry rendered as a full-width icon+text button at the top of
 * the sidebar. The sidebar is a pure renderer — it draws exactly the items
 * passed via {@link SidebarProps.navItems} (the built-in Skill entry is
 * injected by <WorkbenchShell>, not hardcoded here). There is no Sessions nav
 * button: the session list is always shown in the body, and selecting a
 * session is handled by the host (it implies switching the main view back to
 * the session).
 */
export interface SidebarNavItem {
  /** Stable unique id (must not collide with the built-ins) */
  id: SidebarViewId;
  /** Button label text */
  label: string;
  /** Optional leading icon */
  icon?: React.ReactNode;
  /** Disable the nav button (still visible, not activatable) */
  disabled?: boolean;
}

export interface SidebarProps {
  /** Extra class on the root */
  className?: string;
  /** Active view — marks the matching nav button as pressed. Required. */
  activeView: SidebarViewId;
  /** Called when a nav button is clicked. Required. */
  onActiveViewChange: (view: SidebarViewId) => void;
  /** Nav items to render, in order. The sidebar renders exactly these. */
  navItems?: SidebarNavItem[];
  /**
   * Called when a session in the sidebar's SessionList is clicked (whether or
   * not it is already active). Lets the host flip its main view back to the
   * session even when the clicked session is the current one.
   */
  onSelectSession?: (session: SessionMeta) => void;
  /**
   * Called when the footer's SettingsMenu "Open settings" item is clicked.
   * Lets the host flip its main view to the settings view. Forwarded to
   * <SettingsMenu>; omitted when the host has no settings view to open (the
   * menu item is then hidden).
   */
  onOpenSettings?: () => void;
}

// ---------------------------------------------------------------------------
// NavButton — full-width icon + text
// ---------------------------------------------------------------------------
function NavButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const cls = [
    styles.acpSidebarNavBtn,
    active ? styles.acpSidebarNavBtnActive : '',
    disabled ? styles.acpSidebarNavBtnDisabled : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={label}
    >
      {icon && (
        <span className={styles.acpSidebarNavBtnIcon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className={styles.acpSidebarNavBtnLabel}>{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
export function Sidebar({
  className,
  activeView,
  onActiveViewChange,
  navItems = [],
  onSelectSession,
  onOpenSettings,
}: SidebarProps) {
  const { t } = useI18n();

  return (
    <div className={`${styles.acpSidebar}${className ? ` ${className}` : ''}`}>
      {navItems.length > 0 && (
        <nav
          className={styles.acpSidebarNav}
          role="tablist"
          aria-label={t('sidebar.navAriaLabel')}
        >
          {navItems.map((item) => (
            <NavButton
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={activeView === item.id}
              disabled={item.disabled}
              onClick={() =>
                !item.disabled && onActiveViewChange(item.id)
              }
            />
          ))}
        </nav>
      )}

      <div className={styles.acpSidebarBody}>
        <SessionList onSelectSession={onSelectSession} />
      </div>

      <div className={styles.acpSidebarFooter}>
        <SettingsMenu onOpenSettings={onOpenSettings} />
      </div>
    </div>
  );
}
