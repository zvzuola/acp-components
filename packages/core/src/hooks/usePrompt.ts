import { useCallback } from 'react';
import { useAcpContext } from '../context/AcpContext';
import { useSessionStore } from '../store/sessionStore';
import type { SessionId, ContentBlock } from '@agentclientprotocol/sdk';
import type { Message } from '../types';

let messageCounter = 0;

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++messageCounter}`;
}

export function usePrompt(sessionId: SessionId | null) {
  const { client } = useAcpContext();
  const addMessage = useSessionStore((s) => s.addMessage);
  const setIsStreaming = useSessionStore((s) => s.setIsStreaming);
  const setStopReason = useSessionStore((s) => s.setStopReason);
  const ensureSession = useSessionStore((s) => s.ensureSession);

  const send = useCallback(async (contentBlocks: ContentBlock[]) => {
    if (!sessionId) return;
    ensureSession(sessionId);

    const userMsg: Message = {
      id: generateId('user'),
      role: 'user',
      content: contentBlocks,
      timestamp: Date.now(),
    };
    addMessage(sessionId, userMsg);

    setIsStreaming(sessionId, true);

    try {
      const res = await client.prompt(sessionId, contentBlocks);
      setStopReason(sessionId, res.stopReason);
      return res;
    } catch (err) {
      setStopReason(sessionId, 'cancelled');
      throw err;
    } finally {
      setIsStreaming(sessionId, false);
    }
  }, [sessionId, client, addMessage, setIsStreaming, setStopReason, ensureSession]);

  const cancel = useCallback(async () => {
    if (!sessionId) return;
    await client.cancel(sessionId);
  }, [sessionId, client]);

  return { send, cancel };
}
