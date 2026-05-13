import { useCallback } from 'react';
import { useAcpContext } from '../context/AcpContext';
import { sendPrompt, cancelPrompt } from '@acp-components/core';
import type { SessionId, ContentBlock } from '@agentclientprotocol/sdk';

export function usePrompt(sessionId: SessionId | null) {
  const { client } = useAcpContext();

  const send = useCallback(async (contentBlocks: ContentBlock[]) => {
    if (!sessionId) return;
    return sendPrompt(client, sessionId, contentBlocks);
  }, [sessionId, client]);

  const cancel = useCallback(async () => {
    if (!sessionId) return;
    return cancelPrompt(client, sessionId);
  }, [sessionId, client]);

  return { send, cancel };
}
