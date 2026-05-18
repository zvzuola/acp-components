import { useAcpStore } from './useAcpStore';

export function useConnectionStatus(agentId: string) {
  const agents = useAcpStore((s) => s.agents);
  const agent = agents.get(agentId);

  return {
    agentId,
    status: agent?.status ?? ('disconnected' as const),
    isConnected: agent?.status === 'connected',
    isConnecting: agent?.status === 'connecting',
    hasError: agent?.status === 'error',
    agentName: agent?.agentInfo?.title ?? agent?.agentInfo?.name ?? agent?.name ?? 'Unknown',
    agentVersion: agent?.agentInfo?.version,
  };
}

export function useAllAgentStatuses() {
  const agents = useAcpStore((s) => s.agents);
  const agentList = Array.from(agents.values());

  const allConnected = agentList.every((a) => a.status === 'connected');
  const anyConnecting = agentList.some((a) => a.status === 'connecting');
  const anyError = agentList.some((a) => a.status === 'error');

  return {
    agents: agentList,
    overallStatus: allConnected ? 'connected' : anyConnecting ? 'connecting' : anyError ? 'error' : 'disconnected',
  };
}
