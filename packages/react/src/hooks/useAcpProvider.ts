import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from 'zustand/react';
import { useShallow } from 'zustand/shallow';
import { createAcpProvider, acpStore } from '@acp-components/core';
import type { MultiAgentProviderOptions, MultiAgentProviderInstance, AgentConfig, StdioTransportFactory } from '@acp-components/core';
import { usePlatform } from '../context/PlatformContext';

export function useAcpProvider(options: MultiAgentProviderOptions) {
  const providerRef = useRef<MultiAgentProviderInstance | null>(null);
  const [ready, setReady] = useState(false);

  // Resolve the host stdio transport factory from Platform.process. A host
  // that can't spawn a child process (e.g. web) omits the slice → `null` →
  // `{ type: 'stdio' }` configs fail fast at connect. The AgentsPanel picker
  // gates `stdio` on the same capability, so the two never disagree.
  const { process: processSlice } = usePlatform();
  const stdioFactory: StdioTransportFactory | null =
    processSlice?.createStdioTransport ?? null;

  if (!providerRef.current) {
    providerRef.current = createAcpProvider(options, stdioFactory);
  }

  useEffect(() => {
    const provider = providerRef.current!;
    const unsub = provider.subscribe(() => {
      setReady(provider.ready);
    });
    if (provider.ready) {
      setReady(true);
    }
    // Subscribe only — do NOT `provider.destroy()` on cleanup. The provider is
    // a singleton pinned by `providerRef`: destroying it on unmount (which
    // React 18 StrictMode triggers as mount→unmount→mount in dev) would tear
    // down every agent connection, and because the ref is NOT cleared, the
    // remount would reuse the destroyed instance — leaving `getClient` dead and
    // `ready` stale with no way to reconnect short of a full reload. Lifecycle
    // teardown is the host app's responsibility (the provider lives for the
    // whole app; a destroyed-on-unmount model only makes sense for a
    // per-component provider, which this isn't).
    return () => {
      unsub();
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
