import React, { useEffect, useMemo, useState } from 'react';
import { AppstoreOutlined, PlusOutlined } from '@ant-design/icons';
import type { SessionId } from '@acp-components/core';
import { useActions } from '../../context/HotkeysContext';
import { Workbench } from './Workbench';
import type { WorkbenchProps } from './Workbench';
import { Sidebar } from '../sidebar/Sidebar';
import type { SidebarNavItem, SidebarViewId } from '../sidebar/Sidebar';
import { SessionView } from '../session-view/SessionView';
import { SkillView } from '../skill-view/SkillView';
import { NewSessionView } from '../new-session-view';
import { SettingsView, SettingsSidebar } from '../settings-view';
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
export const SIDEBAR_VIEW_SETTINGS = 'settings';

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
  onSidebarWidthChange?: WorkbenchProps['onSidebarWidthChange'];
}

// ---------------------------------------------------------------------------
// WorkbenchShell
// ---------------------------------------------------------------------------
export function WorkbenchShell({
  sessionId,
  navItems = [],
  className,
  sidebarWidth,
  onSidebarWidthChange,
}: WorkbenchShellProps) {
  const { t } = useI18n();
  const storeSessionId = useAcpStore((s) => s.activeSessionId);
  const resolvedSessionId = sessionId === undefined ? storeSessionId : sessionId;

  // ── Active view ──────────────────────────────────────────────────────
  // Owned entirely by WorkbenchShell; defaults to the new-session view so
  // the app opens on the landing/composer screen. The effect below still
  // flips back to the sessions view as soon as a session becomes active.
  const [current, setCurrent] = useState<SidebarViewId>(
    SIDEBAR_VIEW_NEW_SESSION,
  );

  // Active settings sub-section. Only meaningful while
  // `current === SIDEBAR_VIEW_SETTINGS`; survives leaving/entering settings
  // so returning to a section keeps your place.
 const [settingsSection, setSettingsSection] = useState<string>(
   'appearance',
 );
  // --- Global actions: switch between built-in views ---
  // Registered via `useActions`, the single source of truth for app-level
  // shortcuts: on desktop hosts with a native menu bar the actions appear
  // as real menu items (accelerator owned by the OS), while on web they
  // fall back to a webview keydown listener. Either path routes to the
  // same handler, so the experience is identical across platforms.
  const actionBindings = useMemo(
    () => [
      {
        id: 'new-session',
        shortcut: 'Mod+1',
        handler: () => setCurrent(SIDEBAR_VIEW_NEW_SESSION),
        label: t('shortcuts.newSession'),
        submenu: t('shortcuts.file'),
      },
      {
        id: 'skills',
        shortcut: 'Mod+2',
        handler: () => setCurrent(SIDEBAR_VIEW_SKILLS),
        label: t('shortcuts.skills'),
        submenu: t('shortcuts.file'),
      },
      {
        id: 'settings',
        shortcut: 'Mod+,',
        handler: () => setCurrent(SIDEBAR_VIEW_SETTINGS),
        label: t('shortcuts.settings'),
        submenu: t('shortcuts.file'),
      },
    ],
    [t],
  );
  useActions(actionBindings);

 // Selecting a session in the sidebar's SessionList flips the store's
  // activeSessionId. When that happens while the main area is showing a
  // non-session view (Skills, New Session, or Settings), switch back to the
  // session view — clicking a session means "show me this conversation".
  useEffect(() => {
    if (
      storeSessionId &&
      (current === SIDEBAR_VIEW_SKILLS ||
        current === SIDEBAR_VIEW_NEW_SESSION ||
        current === SIDEBAR_VIEW_SETTINGS)
    ) {
      setCurrent(SIDEBAR_VIEW_SESSIONS);
    }
    // Only react to session changes, not to `current` (this effect drives
    // `current`, so depending on it would loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSessionId]);

  // ── Sidebar nav items ─────────────────────────────────────────────────
  // The built-in entries for the NORMAL sidebar (New Session / Skills + host
  // items). The settings-mode sidebar is a separate <SettingsSidebar> with its
  // own nav (Back + section list sourced from SETTINGS_SECTIONS), so this list
  // only feeds the non-settings sidebar.
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
    if (current === SIDEBAR_VIEW_SETTINGS) {
      return (
        <SettingsView
          activeSection={settingsSection}
          className={styles.acpWorkbenchShellMainSettingsView}
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
    settingsSection,
  ]);

  // ── Sidebar: pick the dedicated settings sidebar while in settings mode,
  // the normal workspace sidebar otherwise. Two separate components keep each
  // path self-contained — no shared router, sentinel ids, or region overrides.
  const sidebar =
    current === SIDEBAR_VIEW_SETTINGS ? (
      <SettingsSidebar
        activeSection={settingsSection}
        onBack={() => setCurrent(SIDEBAR_VIEW_NEW_SESSION)}
        onSelectSection={setSettingsSection}
      />
    ) : (
      <Sidebar
        activeView={current}
        onActiveViewChange={setCurrent}
        navItems={sidebarNavItems}
        onSelectSession={() => setCurrent(SIDEBAR_VIEW_SESSIONS)}
        onOpenSettings={() => setCurrent(SIDEBAR_VIEW_SETTINGS)}
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
      onSidebarWidthChange={onSidebarWidthChange}
    />
  );
}
