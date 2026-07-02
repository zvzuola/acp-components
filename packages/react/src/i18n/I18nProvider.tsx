import { createInstance } from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import React, { useMemo, useEffect } from 'react';
import { enUS } from './locales/en-US';
import { zhCN } from './locales/zh-CN';
import { usePlatform } from '../context/PlatformContext';
import type { Resource } from 'i18next';

const STORAGE_KEY = 'acp-i18n-locale';

/**
 * Map a BCP-47 locale tag to one of the built-in locales; falls back to the
 * tag itself when no built-in matches (i18n will resolve it via fallbackLng).
 */
function normalizeLocale(tag: string | undefined, defaultLocale: string): string {
  if (!tag) return defaultLocale;
  if (tag.startsWith('zh')) return 'zh-CN';
  if (tag.startsWith('en')) return 'en-US';
  return tag;
}

function detectLocale(
  defaultLocale: string,
  storageSync?: (key: string) => string | null,
  systemLocale?: string,
): string {
  // Prefer the user's explicit choice from storage; fall back to localStorage
  // for hosts that cannot provide a synchronous reader.
  try {
    const stored = storageSync?.(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch { /* storage unavailable */ }
  // Then the platform-reported system locale (host delegates to the browser /
  // OS) — never `navigator` directly in the UI.
  return normalizeLocale(systemLocale, defaultLocale);
}

function createI18nInstance(lng: string, customLocales?: Record<string, Record<string, string>>) {
  const resources: Resource = {
    'en-US': { translation: enUS },
    'zh-CN': { translation: zhCN },
  };
  if (customLocales) {
    for (const lang of Object.keys(customLocales)) {
      if (!resources[lang]) {
        resources[lang] = { translation: {} };
      }
      Object.assign(resources[lang].translation, customLocales[lang]);
    }
  }

  const instance = createInstance();
  instance.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: 'en-US',
    interpolation: {
      escapeValue: false,
      prefix: '{',
      suffix: '}',
    },
    returnNull: false,
    returnEmptyString: false,
  });
  return instance;
}

export interface I18nProviderProps {
  defaultLocale?: string;
  customLocales?: Record<string, Record<string, string>>;
  children: React.ReactNode;
}

export function I18nProvider({ defaultLocale = 'en-US', customLocales, children }: I18nProviderProps) {
  // I18nProvider sits inside PlatformProvider (platform is outermost in the
  // host entry points), so usePlatform is safe here.
  const { storage, system } = usePlatform();
  const i18nStorage = storage('i18n');

  const i18n = useMemo(
    () =>
      createI18nInstance(
        detectLocale(defaultLocale, i18nStorage.getItemSync, system?.getLocale?.()),
        customLocales,
      ),
    [defaultLocale, customLocales, i18nStorage, system],
  );

  useEffect(() => {
    // Keep the active locale in sync if the host reports the system language
    // changed (e.g. the user switches OS language while the app runs). Only
    // follow the system when the user has not pinned an explicit choice.
    if (!system?.onLocaleChanged) return;
    return system.onLocaleChanged((locale) => {
      const stored = i18nStorage.getItemSync?.(STORAGE_KEY);
      if (stored) return; // respect an explicit user choice
      const next = normalizeLocale(locale, defaultLocale);
      if (next !== i18n.language) i18n.changeLanguage(next).catch(() => {});
    });
  }, [system, i18nStorage, i18n, defaultLocale]);

  useEffect(() => {
    // Fire-and-forget; the sync read on next mount already covers persistence.
    i18nStorage.setItem(STORAGE_KEY, i18n.language).catch(() => {});
  }, [i18n.language, i18nStorage]);

  return React.createElement(I18nextProvider, { i18n }, children);
}
