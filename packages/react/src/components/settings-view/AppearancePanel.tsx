import React, { useCallback } from 'react';
import { BgColorsOutlined, GlobalOutlined } from '@ant-design/icons';
import { useI18n } from '../../i18n';
import { useSettings } from '../../context/SettingsContext';
import { usePlatform } from '../../context/PlatformContext';
import styles from './appearance-panel.module.scss';

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
// AppearancePanel — theme + language. One of the settings sub-section panels.
// ---------------------------------------------------------------------------
export function AppearancePanel() {
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
