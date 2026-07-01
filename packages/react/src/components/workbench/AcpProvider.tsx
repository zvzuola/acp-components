import React, { useMemo, useState } from 'react';
import { AcpContext } from '../../context/AcpContext';
import { SettingsContext } from '../../context/SettingsContext';
import { useAcpProvider } from '../../hooks/useAcpProvider';
import type { AgentConfig } from '@acp-components/core';
import type { ExtMethodHandler, ExtNotificationHandler } from '@acp-components/core';
import { useI18n } from '../../i18n';
import styles from './loading.module.scss';

export interface AcpProviderProps {
  agents: AgentConfig[];
  theme?: 'light' | 'dark';
  children: React.ReactNode;
  onExtMethod?: ExtMethodHandler;
  onExtNotification?: ExtNotificationHandler;
}

export function AcpProvider({
  agents,
  theme: initialTheme = 'dark',
  children,
  onExtMethod,
  onExtNotification,
}: AcpProviderProps) {
  const provider = useAcpProvider({
    agents,
    onExtMethod,
    onExtNotification,
  });
  const { t } = useI18n();

  // Runtime theme state — initialized from prop, switchable via useSettings().setTheme()
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);

  // Sync theme to <body> so portaled components (Select, etc.) inherit CSS variables
  React.useEffect(() => {
    document.body.setAttribute('data-acp-theme', theme);
    return () => {
      document.body.removeAttribute('data-acp-theme');
    };
  }, [theme]);

  // Sync if the parent changes the initialTheme prop after mount
  React.useEffect(() => {
    setTheme(initialTheme);
  }, [initialTheme]);

  const settingsValue = useMemo(() => ({ theme, setTheme }), [theme]);

  // AcpContext carries ONLY agent data-layer values. Native capabilities
  // (file open, file content read, directory pickers, …) live on Platform and
  // are accessed via usePlatform() — the two contexts are orthogonal.
  // Workspace state (list / add / remove) is exposed via `useWorkspaces()`,
  // not this context.
  const contextValue = useMemo(() => ({
    getClient: provider.getClient,
    agents: provider.agents,
    addAgent: provider.addAgent,
    removeAgent: provider.removeAgent,
    isReady: provider.isReady,
  }), [provider]);

  if (!provider.isReady) {
    return (
      <SettingsContext.Provider value={settingsValue}>
        <div className={styles.acpLoading}>
          <div className={styles.acpLoadingSpinner} />
          <span>{t('loading.connecting')}</span>
        </div>
      </SettingsContext.Provider>
    );
  }

  return (
    <SettingsContext.Provider value={settingsValue}>
      <AcpContext.Provider value={contextValue}>
        <div>
          {children}
        </div>
      </AcpContext.Provider>
    </SettingsContext.Provider>
  );
}
