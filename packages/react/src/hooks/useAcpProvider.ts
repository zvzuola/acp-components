import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from 'zustand/react';
import { useShallow } from 'zustand/shallow';
import { createAcpProvider, acpStore } from '@acp-components/core';
import type { MultiAgentProviderOptions, MultiAgentProviderInstance, AgentConfig } from '@acp-components/core';

export function useAcpProvider(options: MultiAgentProviderOptions) {
  const providerRef = useRef<MultiAgentProviderInstance | null>(null);
  const [ready, setReady] = useState(false);

  if (!providerRef.current) {
    providerRef.current = createAcpProvider(options);
  }

  useEffect(() => {
    const provider = providerRef.current!;
    const unsub = provider.subscribe(() => {
      setReady(provider.ready);
    });
    if (provider.ready) {
      setReady(true);
    }
    return () => {
      unsub();
      provider.destroy();
    };
  }, []);

  const agents = useStore(acpStore, useShallow((s) => Array.from(s.agents.values())));

  const getClient = useCallback((agentId: string) => {
    return providerRef.current?.getClient(agentId) ?? null;
  }, []);

  const addAgent = useCallback(async (config: AgentConfig) => {
    await providerRef.current?.addAgent(config);
  }, []);

  const removeAgent = useCallback(async (agentId: string) => {
    await providerRef.current?.removeAgent(agentId);
  }, []);

  return {
    getClient,
    agents,
    addAgent,
    removeAgent,
    isReady: ready,
  };
}
