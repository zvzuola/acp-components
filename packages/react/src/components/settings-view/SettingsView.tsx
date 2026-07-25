import React from 'react';
import { BgColorsOutlined, KeyOutlined, RobotOutlined } from '@ant-design/icons';
import { useI18n } from '../../i18n';
import { AppearancePanel } from './AppearancePanel';
import { AgentsPanel } from './AgentsPanel';
import { KeyboardShortcutsPanel } from './KeyboardShortcutsPanel';
import styles from './settings-view.module.scss';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SettingsViewProps {
  /** Active sub-section id (must match a `SETTINGS_SECTIONS` id). Defaults to appearance. */
  activeSection?: string;
  /** Extra class on the root */
  className?: string;
}

/**
 * Definition of a settings sub-section surfaced as a sidebar nav button while
 * the settings view is active. The registry lives here (with the view that
 * renders the panels) so adding a section is a one-file change: append a def
 * + a panel branch in `SettingsView`. `WorkbenchShell` consumes this list to
 * build the settings-mode sidebar nav.
 */
export interface SettingsSectionDef {
  /** Stable unique id */
  id: string;
  /** i18n key for the sidebar nav label */
  labelKey: string;
  /** Optional leading icon */
  icon?: React.ReactNode;
}

/** The built-in settings sections, in sidebar order. */
export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  { id: 'appearance', labelKey: 'settingsView.sectionAppearance', icon: <BgColorsOutlined /> },
  { id: 'agents', labelKey: 'settingsView.sectionAgents', icon: <RobotOutlined /> },
  { id: 'shortcuts', labelKey: 'settingsView.sectionShortcuts', icon: <KeyOutlined /> },
];

/** The active section when entering the settings view. */
export const SETTINGS_SECTION_APPEARANCE = 'appearance';

/** The Agents management section id. WorkbenchShell jumps here from the
 * sidebar's Agents nav item. */
export const SETTINGS_SECTION_AGENTS = 'agents';
/** The Keyboard Shortcuts management section id. */
export const SETTINGS_SECTION_SHORTCUTS = 'shortcuts';

// ---------------------------------------------------------------------------
// SettingsView
//
// A full-page settings surface reachable from the settings dropdown's
// "Open settings" item. While active, the sidebar's top nav is replaced with
// a Back button + the section list (see SETTINGS_SECTIONS); `activeSection`
// selects which panel renders here. Add new sections by appending to
// SETTINGS_SECTIONS + a panel branch in `renderPanel`.
// ---------------------------------------------------------------------------
export function SettingsView({ activeSection = SETTINGS_SECTION_APPEARANCE, className }: SettingsViewProps) {
  const { t } = useI18n();

  const rootCls = [styles.acpSettingsView, className || ''].filter(Boolean).join(' ');

  // Resolve the active panel. Unknown/missing section falls back to appearance
  // so the view never renders an empty body. Add new sections by extending
  // this switch + SETTINGS_SECTIONS.
  const renderPanel = () => {
    switch (activeSection) {
      case SETTINGS_SECTION_AGENTS:
        return <AgentsPanel />;
      case SETTINGS_SECTION_SHORTCUTS:
        return <KeyboardShortcutsPanel />;
      default:
        return <AppearancePanel />;
    }
  };

  return (
    <div className={rootCls} role="application" aria-label={t('settingsView.title')}>
      <div className={styles.acpSettingsViewHeader}>
        <span className={styles.acpSettingsViewTitle}>{t('settingsView.title')}</span>
      </div>
      {renderPanel()}
    </div>
  );
}
