import { useCallback, useMemo } from 'react';
import { useAcpContext } from '../context/AcpContext';
import { useAcpStore } from './useAcpStore';
import { sendPrompt, cancelPrompt } from '@acp-components/core';
import type { SessionId, ContentBlock } from '@agentclientprotocol/sdk';

export function usePrompt(sessionId: SessionId | null) {
  const { getClient } = useAcpContext();
  const sessions = useAcpStore((s) => s.sessions);

  const client = useMemo(() => {
    if (!sessionId) return null;
    const agentId = sessions.get(sessionId)?.agentId;
    if (!agentId) return null;
    return getClient(agentId);
  }, [sessionId, sessions, getClient]);

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
