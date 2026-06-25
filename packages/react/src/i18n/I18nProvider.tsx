import { createInstance } from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import React, { useMemo, useEffect } from 'react';
import { enUS } from './locales/en-US';
import { zhCN } from './locales/zh-CN';
import { usePlatform } from '../context/PlatformContext';
import type { Resource } from 'i18next';

const STORAGE_KEY = 'acp-i18n-locale';

function detectLocale(defaultLocale: string, storageSync?: (key: string) => string | null): string {
  // Prefer the platform's sync storage read; fall back to localStorage for hosts
  // that cannot provide a synchronous reader.
  try {
    const stored = storageSync?.(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch { /* storage unavailable */ }
  if (typeof navigator !== 'undefined' && navigator.language) {
    const nav = navigator.language;
    if (nav.startsWith('zh')) return 'zh-CN';
    if (nav.startsWith('en')) return 'en-US';
  }
  return defaultLocale;
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
  const { storage } = usePlatform();
  const i18nStorage = storage('i18n');

  const i18n = useMemo(
    () => createI18nInstance(detectLocale(defaultLocale, i18nStorage.getItemSync), customLocales),
    [defaultLocale, customLocales, i18nStorage],
  );

  useEffect(() => {
    // Fire-and-forget; the sync read on next mount already covers persistence.
    i18nStorage.setItem(STORAGE_KEY, i18n.language).catch(() => {});
  }, [i18n.language, i18nStorage]);

  return React.createElement(I18nextProvider, { i18n }, children);
}
