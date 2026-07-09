import React from 'react';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useI18n } from '../../i18n';
import { SETTINGS_SECTIONS } from './SettingsView';
import styles from './settings-sidebar.module.scss';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SettingsSidebarProps {
  /** Active settings section id (highlights the matching nav row). */
  activeSection: string;
  /** Called when the Back button is clicked — host exits settings. */
  onBack: () => void;
  /** Called when a section nav row is clicked, with the section id. */
  onSelectSection: (sectionId: string) => void;
  /** Extra class on the root */
  className?: string;
}

// ---------------------------------------------------------------------------
// NavRow — full-width icon + text, ghost → selected. Mirrors the generic
// Sidebar's NavButton visually (same tokens, same active treatment) so the
// settings sidebar reads as the same chrome, just a different nav set. Kept
// local — the markup is tiny and the self-contained-component convention here
// is one component per directory without shared UI atoms.
// ---------------------------------------------------------------------------
function NavRow({
  icon,
  label,
  active,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  const cls = [
    styles.acpSettingsSidebarNavBtn,
    active ? styles.acpSettingsSidebarNavBtnActive : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      aria-pressed={active}
      title={label}
    >
      {icon && (
        <span className={styles.acpSettingsSidebarNavBtnIcon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className={styles.acpSettingsSidebarNavBtnLabel}>{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// SettingsSidebar
//
// The sidebar shown while the settings view is active. Distinct from the
// generic <Sidebar>: it is nav-only (Back + the settings section list) with
// no session list and no gear footer — the section controls live in the
// main-area panel, and the Back button is the exit (the gear would be
// redundant). New sections surface here automatically via SETTINGS_SECTIONS.
// ---------------------------------------------------------------------------
export function SettingsSidebar({
  activeSection,
  onBack,
  onSelectSection,
  className,
}: SettingsSidebarProps) {
  const { t } = useI18n();

  return (
    <div className={`${styles.acpSettingsSidebar}${className ? ` ${className}` : ''}`}>
      <nav
        className={styles.acpSettingsSidebarNav}
        role="tablist"
        aria-label={t('settingsView.title')}
      >
        <NavRow
          icon={<ArrowLeftOutlined />}
          label={t('settingsView.back')}
          onClick={onBack}
        />
        {SETTINGS_SECTIONS.map((def) => (
          <NavRow
            key={def.id}
            icon={def.icon}
            label={t(def.labelKey)}
            active={activeSection === def.id}
            onClick={() => onSelectSection(def.id)}
          />
        ))}
      </nav>
    </div>
  );
}
