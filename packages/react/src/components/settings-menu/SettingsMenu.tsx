import React, { useCallback } from 'react';
import {
  SettingOutlined,
  BgColorsOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import { useI18n } from '../../i18n';
import { useSettings } from '../../context/SettingsContext';
import { usePlatform } from '../../context/PlatformContext';
import { Dropdown } from '../dropdown';
import styles from './settings-menu.module.scss';

export interface SettingsMenuProps {
  className?: string;
  /**
   * Called when the "Open settings" item is clicked — typically the host
   * switches its main view to a full-page Settings view. When omitted, the
   * item is not rendered (no dead entry on hosts without a settings view).
   */
  onOpenSettings?: () => void;
}

// ---------------------------------------------------------------------------
// ToggleSwitch — small toggle pill for the theme row (SettingsMenu-specific)
// ---------------------------------------------------------------------------
function ToggleSwitch({ on }: { on: boolean }) {
  return (
    <span className={`${styles.acpSettingsToggle}${on ? ` ${styles.acpSettingsToggleOn}` : ''}`}>
      <span className={styles.acpSettingsToggleKnob} />
    </span>
  );
}

export function SettingsMenu({ className, onOpenSettings }: SettingsMenuProps) {
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
    <div className={`${styles.acpSettingsMenu}${className ? ` ${className}` : ''}`}>
      <Dropdown placement="top-start">
        <Dropdown.Trigger asChild>
          <button
            className={styles.acpSettingsTrigger}
            aria-label={t('settings.title')}
            title={t('settings.title')}
          >
            <SettingOutlined />
          </button>
        </Dropdown.Trigger>
        <Dropdown.Content width={220}>
          <Dropdown.Section label={t('settings.title')}>
            {/* Theme toggle */}
            <Dropdown.Item
              icon={<BgColorsOutlined />}
              label={t('settings.theme')}
              value={theme === 'dark' ? t('settings.themeDark') : t('settings.themeLight')}
              onClick={toggleTheme}
              role="switch"
              aria-checked={theme === 'dark'}
            >
              <ToggleSwitch on={theme === 'dark'} />
            </Dropdown.Item>

            {/* Language with hover sub-menu */}
            <Dropdown.Submenu
              icon={<GlobalOutlined />}
              label={t('settings.language')}
              value={currentLang === 'zh-CN' ? '中文' : 'English'}
            >
              <Dropdown.SubmenuItem
                label="English"
                active={currentLang === 'en-US'}
                onClick={() => switchLanguage('en-US')}
              />
              <Dropdown.SubmenuItem
                label="中文"
                active={currentLang === 'zh-CN'}
                onClick={() => switchLanguage('zh-CN')}
              />
            </Dropdown.Submenu>

            {/* Open the full settings view (host-switched). Hidden when the
                host doesn't wire a settings view (no callback). */}
            {onOpenSettings && (
              <Dropdown.Item
                icon={<SettingOutlined />}
                label={t('settings.openSettings')}
                onClick={onOpenSettings}
              />
            )}
          </Dropdown.Section>
        </Dropdown.Content>
      </Dropdown>
    </div>
  );
}
