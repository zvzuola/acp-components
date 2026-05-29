import { useCallback } from 'react';
import { useAcpContext } from '../context/AcpContext';
import { callExtMethod as coreCallExtMethod, sendExtNotification as coreSendExtNotification } from '@acp-components/core';
import type { AcpClient } from '@acp-components/core';

export function useExtensions() {
  const { getClient } = useAcpContext();

  const getClientByName = useCallback((agentId: string): AcpClient | null => {
    return getClient(agentId);
  }, [getClient]);

  const callExtMethod = useCallback(async (
    agentId: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    const client = getClient(agentId);
    if (!client) throw new Error(`Agent ${agentId} not found`);
    return coreCallExtMethod(client, method, params);
  }, [getClient]);

  const sendExtNotification = useCallback(async (
    agentId: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<void> => {
    const client = getClient(agentId);
    if (!client) throw new Error(`Agent ${agentId} not found`);
    return coreSendExtNotification(client, method, params);
  }, [getClient]);

  return { callExtMethod, sendExtNotification };
}
