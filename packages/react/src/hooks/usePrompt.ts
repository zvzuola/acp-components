import { useCallback, useMemo } from 'react';
import { useAcpContext } from '../context/AcpContext';
import { useAcpStore } from './useAcpStore';
import { sendPrompt, cancelPrompt, acpStore } from '@acp-components/core';
import type { SessionId, ContentBlock } from '@agentclientprotocol/sdk';

export function usePrompt(sessionId: SessionId | null) {
  const { getClient } = useAcpContext();

  const client = useMemo(() => {
    if (!sessionId) return null;
    const state = acpStore.getState();
    for (const [, ws] of state.workspaces) {
      const meta = ws.sessions.get(sessionId);
      if (meta) return getClient(meta.agentId);
    }
    return null;
  }, [sessionId, getClient]);

  const send = useCallback(async (contentBlocks: ContentBlock[]) => {
    if (!sessionId || !client) return;
    return sendPrompt(client, sessionId, contentBlocks);
  }, [sessionId, client]);

  const cancel = useCallback(async () => {
    if (!sessionId || !client) return;
    return cancelPrompt(client, sessionId);
  }, [sessionId, client]);

  return { send, cancel };
}
