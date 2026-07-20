import type { SessionId, ContentBlock, PromptResponse } from '@agentclientprotocol/sdk';
import type { AcpClient } from '../client/AcpClient';
import { sessionStore } from '../store/sessionStore';
import type { Message, QueuedMessage } from '../types';
import { generateId } from '../utils/id';

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
    if (res.stopReason && res.stopReason !== 'end_turn') {
      store.setStopReason(sessionId, res.stopReason);
    }
    return res;
  } finally {
    store.setIsStreaming(sessionId, false);
  }
}

export async function cancelPrompt(client: AcpClient, sessionId: SessionId): Promise<void> {
  await client.cancel(sessionId);
}

// ---------------------------------------------------------------------------
// Prompt queue — FIFO of prompts submitted while the agent is streaming.
// ---------------------------------------------------------------------------

/** Per-session flush subscription so we can tear them down when the session is removed. */
const flushSubscriptions = new Map<SessionId, () => void>();

function ensureFlushSubscription(client: AcpClient, sessionId: SessionId): void {
  if (flushSubscriptions.has(sessionId)) return;

  let wasStreaming = sessionStore.getState().sessions.get(sessionId)?.isStreaming ?? false;

  const unsub = sessionStore.subscribe((state) => {
    const data = state.sessions.get(sessionId);
    if (!data) {
      // Session removed — stop watching.
      flushSubscriptions.delete(sessionId);
      unsub();
      return;
    }

    const isStreaming = data.isStreaming;
    const turnEnded = wasStreaming && !isStreaming;
    // Update BEFORE flushing: both shiftQueuedMessage and sendPrompt re-enter
    // this subscriber synchronously, and a stale `wasStreaming` would satisfy
    // the edge condition again, draining the whole queue recursively.
    wasStreaming = isStreaming;
    if (turnEnded && data.queuedMessages.length > 0) {
      const next = sessionStore.getState().shiftQueuedMessage(sessionId);
      if (next) {
        void sendPrompt(client, sessionId, next.content).catch((err) => {
          console.error('[prompt-queue] Failed to send queued prompt:', err);
        });
      }
    }
  });

  flushSubscriptions.set(sessionId, unsub);
}

export async function queuePrompt(client: AcpClient, sessionId: SessionId, contentBlocks: ContentBlock[]): Promise<PromptResponse | undefined> {
  const data = sessionStore.getState().sessions.get(sessionId);
  if (!data || !data.isStreaming) {
    return sendPrompt(client, sessionId, contentBlocks);
  }

  const queued: QueuedMessage = {
    id: generateId('queued'),
    content: contentBlocks,
    queuedAt: Date.now(),
  };
  sessionStore.getState().enqueueMessage(sessionId, queued);
  ensureFlushSubscription(client, sessionId);
  return undefined;
}

export function dequeuePrompt(sessionId: SessionId, queuedId: string): void {
  sessionStore.getState().dequeueMessage(sessionId, queuedId);
}