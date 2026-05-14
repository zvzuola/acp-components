import { createInstance } from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import React, { useMemo, useEffect } from 'react';
import { enUS } from './locales/en-US';
import { zhCN } from './locales/zh-CN';
import type { Resource } from 'i18next';

const STORAGE_KEY = 'acp-i18n-locale';

function detectLocale(defaultLocale: string): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch { /* localStorage unavailable */ }
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
  const i18n = useMemo(
    () => createI18nInstance(detectLocale(defaultLocale), customLocales),
    [defaultLocale, customLocales],
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, i18n.language);
    } catch { /* localStorage unavailable */ }
  }, [i18n.language]);

  return React.createElement(I18nextProvider, { i18n }, children);
}
