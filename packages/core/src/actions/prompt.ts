import type { SessionId, ContentBlock, PromptResponse } from '@agentclientprotocol/sdk';
import type { AcpClient } from '../client/AcpClient';
import { sessionStore } from '../store/sessionStore';
import type { Message } from '../types';

let messageCounter = 0;

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++messageCounter}`;
}

export async function sendPrompt(client: AcpClient, sessionId: SessionId, contentBlocks: ContentBlock[]): Promise<PromptResponse> {
  const store = sessionStore.getState();
  store.ensureSession(sessionId);

  const userMsg: Message = {
    id: generateId('user'),
    role: 'user',
    parts: [{ type: 'content', content: contentBlocks }],
    timestamp: Date.now(),
  };
  store.addMessage(sessionId, userMsg);

  store.setIsStreaming(sessionId, true);

  try {
    const res = await client.prompt(sessionId, contentBlocks);
    store.setStopReason(sessionId, res.stopReason);
    return res;
  } catch (err) {
    store.setStopReason(sessionId, 'cancelled');
    throw err;
  } finally {
    store.setIsStreaming(sessionId, false);
  }
}

export async function cancelPrompt(client: AcpClient, sessionId: SessionId): Promise<void> {
  await client.cancel(sessionId);
}
