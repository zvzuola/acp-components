import React, { useEffect, useMemo, useState } from 'react';
import { AppstoreOutlined, PlusOutlined } from '@ant-design/icons';
import type { SessionId } from '@acp-components/core';
import { Workbench } from './Workbench';
import type { WorkbenchProps } from './Workbench';
import { Sidebar } from '../sidebar/Sidebar';
import type { SidebarNavItem, SidebarViewId } from '../sidebar/Sidebar';
import { SessionView } from '../session-view/SessionView';
import { SkillView } from '../skill-view/SkillView';
import { NewSessionView } from '../new-session-view';
import { useAcpStore } from '../../hooks/useAcpStore';
import { useI18n } from '../../i18n';
import styles from './workbench-shell.module.scss';

// ---------------------------------------------------------------------------
// Built-in view ids — owned by WorkbenchShell (the component that configures
// the built-in nav items + main views). The sidebar is a pure renderer and
// does not know these values.
// ---------------------------------------------------------------------------
export const SIDEBAR_VIEW_SESSIONS = 'sessions';
export const SIDEBAR_VIEW_SKILLS = 'skills';
export const SIDEBAR_VIEW_NEW_SESSION = 'new-session';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A host-injected nav item + main-area view. Appears after the built-in Skill
 * entry in the sidebar nav, and its `content` renders in the main area when
 * active. If you only want to add a sidebar entry without a main-area view,
 * set `content` to `null`.
 */
export interface WorkbenchNavItem {
  /** Stable unique id (must not collide with the built-ins) */
  id: SidebarViewId;
  /** Sidebar nav button label */
  label: string;
  /** Optional leading icon */
  icon?: React.ReactNode;
  /** Main-area content shown when this item is active */
  content?: React.ReactNode;
  /** Disable the nav button (still visible, not activatable) */
  disabled?: boolean;
}

export interface WorkbenchShellProps {
  /**
   * Active session id — passed through to the built-in SessionView. Defaults
   * to the store's `activeSessionId`. Pass `null` to opt out of auto-tracking.
   */
  sessionId?: SessionId | null;

  // ── Host-injected nav + views ────────────────────────────────────────
  /** Extra nav items appended to the sidebar (after the built-in Skill entry). */
  navItems?: WorkbenchNavItem[];

  // ── Workbench passthrough ────────────────────────────────────────────
  /** Extra class on the root */
  className?: string;
  /** Passthrough to <Workbench> for sidebar/panel sizing. */
  sidebarWidth?: WorkbenchProps['sidebarWidth'];
  panelWidth?: WorkbenchProps['panelWidth'];
  onSidebarWidthChange?: WorkbenchProps['onSidebarWidthChange'];
  onPanelWidthChange?: WorkbenchProps['onPanelWidthChange'];
}

// ---------------------------------------------------------------------------
// WorkbenchShell
// ---------------------------------------------------------------------------
export function WorkbenchShell({
  sessionId,
  navItems = [],
  className,
  sidebarWidth,
  panelWidth,
  onSidebarWidthChange,
  onPanelWidthChange,
}: WorkbenchShellProps) {
  const { t } = useI18n();
  const storeSessionId = useAcpStore((s) => s.activeSessionId);
  const resolvedSessionId = sessionId === undefined ? storeSessionId : sessionId;

  // ── Active view ──────────────────────────────────────────────────────
  // Owned entirely by WorkbenchShell; defaults to the sessions view.
  const [current, setCurrent] = useState<SidebarViewId>(
    SIDEBAR_VIEW_SESSIONS,
  );

  // Selecting a session in the sidebar's SessionList flips the store's
  // activeSessionId. When that happens while the main area is showing a
  // non-session view (Skills or New Session), switch back to the session
  // view — clicking a session means "show me this conversation".
  useEffect(() => {
    if (
      storeSessionId &&
      (current === SIDEBAR_VIEW_SKILLS || current === SIDEBAR_VIEW_NEW_SESSION)
    ) {
      setCurrent(SIDEBAR_VIEW_SESSIONS);
    }
    // Only react to session changes, not to `current` (this effect drives
    // `current`, so depending on it would loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSessionId]);

  // ── Sidebar nav items ─────────────────────────────────────────────────
  // The built-in entries are configured here (not hardcoded in <Sidebar>)
  // so the sidebar stays a pure renderer. The "New session" action sits at
  // the top (a primary affordance, like codex's new-chat button), followed
  // by Skills; the host's items follow in order.
  const sidebarNavItems: SidebarNavItem[] = useMemo(
    () => [
      {
        id: SIDEBAR_VIEW_NEW_SESSION,
        label: t('sidebar.navNewSession'),
        icon: <PlusOutlined />,
      },
      {
        id: SIDEBAR_VIEW_SKILLS,
        label: t('sidebar.navSkills'),
        icon: <AppstoreOutlined />,
      },
      ...navItems.map((it) => ({
        id: it.id,
        label: it.label,
        icon: it.icon,
        disabled: it.disabled,
      })),
    ],
    [navItems, t],
  );

  // ── Main area: resolve the view for `current` ────────────────────────
  const mainContent = useMemo(() => {
    if (current === SIDEBAR_VIEW_SESSIONS) {
      return (
        <SessionView sessionId={resolvedSessionId} />
      );
    }
    if (current === SIDEBAR_VIEW_SKILLS) {
      return (
        <SkillView
          className={styles.acpWorkbenchShellMainSkillView}
        />
      );
    }
    if (current === SIDEBAR_VIEW_NEW_SESSION) {
      return (
        <NewSessionView
          onSubmitted={() => setCurrent(SIDEBAR_VIEW_SESSIONS)}
        />
      );
    }
    // Host-injected view: look up content from navItems.
    const injected = navItems.find((it) => it.id === current);
    return injected?.content ?? null;
  }, [
    current,
    resolvedSessionId,
    navItems,
  ]);

  const sidebar = (
    <Sidebar
      activeView={current}
      onActiveViewChange={setCurrent}
      navItems={sidebarNavItems}
      onSelectSession={() => setCurrent(SIDEBAR_VIEW_SESSIONS)}
    />
  );

  return (
    <Workbench
      className={className}
      sidebar={sidebar}
      main={
        <div
          className={styles.acpWorkbenchShellMain}
          role="region"
          aria-label={t('workbenchShell.mainAriaLabel')}
        >
          {mainContent}
        </div>
      }
      sidebarWidth={sidebarWidth}
      panelWidth={panelWidth}
      onSidebarWidthChange={onSidebarWidthChange}
      onPanelWidthChange={onPanelWidthChange}
    />
  );
}
