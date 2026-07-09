import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AcpContext } from '../../context/AcpContext';
import { SettingsContext } from '../../context/SettingsContext';
import { useAcpProvider } from '../../hooks/useAcpProvider';
import type { AgentConfig } from '@acp-components/core';
import { usePlatform } from '../../context/PlatformContext';
import { loadAgents, saveAgents } from '../../utils/agentStorage';
import { useI18n } from '../../i18n';
import styles from './loading.module.scss';

export interface AcpProviderProps {
  agents: AgentConfig[];
  theme?: 'light' | 'dark';
  children: React.ReactNode;
}

export function AcpProvider({
  agents,
  theme: initialTheme = 'dark',
  children,
}: AcpProviderProps) {
  const provider = useAcpProvider({
    agents,
  });
  const { t } = useI18n();
  const { storage } = usePlatform();

  // Runtime theme state — initialized from prop, switchable via useSettings().setTheme()
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);

  // ── Agent config persistence ──────────────────────────────────────────
  // The store keeps only the live `AgentConnection` (status/info/capabilities),
  // not the originating `AgentConfig` — so to persist user-added agents we hold
  // their configs in a ref keyed by id and save the set to `storage('agents')`
  // on every add/remove. On mount we load the cached configs and replay any
  // whose id is NOT already supplied by the `agents` prop (the prop is the
  // host's built-in set; cached entries are the user-managed additions).
  const agentsStorage = useMemo(() => storage('agents'), [storage]);
  const persistedConfigs = useRef<Map<string, AgentConfig>>(new Map());
  // Ids supplied via the `agents` prop — the host's built-in agent set. These
  // are not user-managed: the restore effect skips them (no double-connect),
  // `removeAgent` refuses them, and UI surfaces hide their delete affordance.
  const builtinAgentIds = useMemo(() => new Set(agents.map((a) => a.id)), [agents]);

  // Restore cached agent configs on mount. Skip ids already covered by the
  // `agents` prop to avoid double-connecting a built-in. `provider.addAgent`
  // connects independently of the `ready` gate, so restored agents come online
  // even while the initial prop-agent batch is still connecting.
  useEffect(() => {
    let cancelled = false;
    loadAgents(agentsStorage)
      .then((cached) => {
        if (cancelled) return;
        for (const config of cached) {
          if (builtinAgentIds.has(config.id)) continue;
          persistedConfigs.current.set(config.id, config);
          // Fire-and-forget: connection failures are handled inside the
          // provider (it sets the agent to `error` status), so don't block
          // restoration of the remaining cached agents on one failure.
          void provider.addAgent(config);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('[agents] Failed to load cached agent configs:', e);
      });
    return () => {
      cancelled = true;
    };
    // Restore is a mount-only side effect: the cache is replayed exactly once
    // at launch. `agentsStorage` is memoized on `storage` identity and never
    // changes after mount, so the effect runs once. `propAgentIds` and
    // `provider.addAgent` are read here but intentionally excluded from the
    // deps — re-running when the host swaps the `agents` prop would risk
    // re-connecting already-restored agents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentsStorage]);

  // Persisted add: connect, then remember the config + flush to storage.
  const addAgent = useCallback(
    async (config: AgentConfig) => {
      await provider.addAgent(config);
      persistedConfigs.current.set(config.id, config);
      saveAgents(agentsStorage, [...persistedConfigs.current.values()]).catch((e) => {
        console.error('[agents] Failed to persist agent configs:', e);
      });
    },
    [provider, agentsStorage],
  );

  // Persisted remove: disconnect, then drop the config + flush to storage.
  // Built-in agents (from the `agents` prop) are NOT user-managed and cannot
  // be removed — reject before touching the connection or the cache. The UI
  // hides their delete affordance, but this guard is the source of truth.
  const removeAgent = useCallback(
    async (agentId: string) => {
      if (builtinAgentIds.has(agentId)) {
        console.warn(
          `[agents] Refusing to remove built-in agent "${agentId}": it is supplied by the host and is not user-managed.`,
        );
        return;
      }
      await provider.removeAgent(agentId);
      persistedConfigs.current.delete(agentId);
      saveAgents(agentsStorage, [...persistedConfigs.current.values()]).catch((e) => {
        console.error('[agents] Failed to persist agent configs:', e);
      });
    },
    [provider, agentsStorage, builtinAgentIds],
  );

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
  // not this context. `addAgent`/`removeAgent` here are the persistence-wrapped
  // versions (the raw connect/disconnect lives on `provider`).
  const contextValue = useMemo(() => ({
    getClient: provider.getClient,
    agents: provider.agents,
    addAgent,
    removeAgent,
    builtinAgentIds,
    isReady: provider.isReady,
  }), [provider, addAgent, removeAgent, builtinAgentIds]);

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
