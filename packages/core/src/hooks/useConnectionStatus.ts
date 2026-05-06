import { useAcpStore } from '../store/acpStore';

export function useConnectionStatus() {
  const connectionStatus = useAcpStore((s) => s.connectionStatus);
  const agentInfo = useAcpStore((s) => s.agentInfo);

  return {
    status: connectionStatus,
    isConnected: connectionStatus === 'connected',
    isConnecting: connectionStatus === 'connecting',
    hasError: connectionStatus === 'error',
    agentName: agentInfo?.title ?? agentInfo?.name ?? 'Unknown',
    agentVersion: agentInfo?.version,
  };
}
