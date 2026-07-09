import React, { useCallback } from 'react';
import { BgColorsOutlined, GlobalOutlined } from '@ant-design/icons';
import { useI18n } from '../../i18n';
import { useSettings } from '../../context/SettingsContext';
import { usePlatform } from '../../context/PlatformContext';
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
];

/** The active section when entering the settings view. */
export const SETTINGS_SECTION_APPEARANCE = 'appearance';

// ---------------------------------------------------------------------------
// ToggleSwitch — small toggle pill for the theme row (SettingsView-specific)
// Mirrors the one in SettingsMenu so the two surfaces stay visually in sync.
// ---------------------------------------------------------------------------
function ToggleSwitch({ on }: { on: boolean }) {
  return (
    <span className={`${styles.acpSettingsViewToggle}${on ? ` ${styles.acpSettingsViewToggleOn}` : ''}`}>
      <span className={styles.acpSettingsViewToggleKnob} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// AppearancePanel — theme + language. Today the only settings panel.
// ---------------------------------------------------------------------------
function AppearancePanel() {
  const { t, i18n } = useI18n();
  const { theme, setTheme } = useSettings();
  const { storage } = usePlatform();

  const currentLang = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US';

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const switchLanguage = useCallback((lang: string) => {
    i18n.changeLanguage(lang);
    storage('i18n').setItem('acp-i18n-locale', lang).catch(() => {});
  }, [i18n, storage]);

  return (
    <div className={styles.acpSettingsViewItems} role="list" aria-label={t('settingsView.sectionAppearance')}>
      {/* Theme */}
      <button
        type="button"
        className={styles.acpSettingsViewRow}
        onClick={toggleTheme}
        role="switch"
        aria-checked={theme === 'dark'}
      >
        <span className={styles.acpSettingsViewRowIcon} aria-hidden="true">
          <BgColorsOutlined />
        </span>
        <span className={styles.acpSettingsViewRowLabel}>{t('settingsView.theme')}</span>
        <span className={styles.acpSettingsViewRowValue}>
          {theme === 'dark' ? t('settingsView.themeDark') : t('settingsView.themeLight')}
        </span>
        <ToggleSwitch on={theme === 'dark'} />
      </button>

      {/* Language */}
      <div className={styles.acpSettingsViewRow}>
        <span className={styles.acpSettingsViewRowIcon} aria-hidden="true">
          <GlobalOutlined />
        </span>
        <span className={styles.acpSettingsViewRowLabel}>{t('settingsView.language')}</span>
        <div className={styles.acpSettingsViewLangOptions} role="group" aria-label={t('settingsView.language')}>
          <button
            type="button"
            className={`${styles.acpSettingsViewLangBtn}${currentLang === 'en-US' ? ` ${styles.acpSettingsViewLangBtnActive}` : ''}`}
            onClick={() => switchLanguage('en-US')}
            aria-pressed={currentLang === 'en-US'}
          >
            {t('settingsView.langEnglish')}
          </button>
          <button
            type="button"
            className={`${styles.acpSettingsViewLangBtn}${currentLang === 'zh-CN' ? ` ${styles.acpSettingsViewLangBtnActive}` : ''}`}
            onClick={() => switchLanguage('zh-CN')}
            aria-pressed={currentLang === 'zh-CN'}
          >
            {t('settingsView.langChinese')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsView
//
// A full-page settings surface reachable from the settings dropdown's
// "Open settings" item. While active, the sidebar's top nav is replaced with
// a Back button + the section list (see SETTINGS_SECTIONS); `activeSection`
// selects which panel renders here. Today only "appearance" exists — new
// sections are added by appending to SETTINGS_SECTIONS + a panel branch below.
// ---------------------------------------------------------------------------
export function SettingsView({ activeSection = SETTINGS_SECTION_APPEARANCE, className }: SettingsViewProps) {
  const { t } = useI18n();

  const rootCls = [styles.acpSettingsView, className || ''].filter(Boolean).join(' ');

  // Resolve the active panel. Unknown/missing section falls back to appearance
  // so the view never renders an empty body. Add new sections by extending
  // this switch + SETTINGS_SECTIONS.
  const renderPanel = () => {
    switch (activeSection) {
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
