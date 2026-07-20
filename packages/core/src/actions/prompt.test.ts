import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendPrompt, cancelPrompt, queuePrompt, dequeuePrompt } from './prompt';
import { sessionStore } from '../store/sessionStore';
import type { PromptResponse } from '@agentclientprotocol/sdk';
import type { ContentBlock } from '@agentclientprotocol/sdk';

/** Minimal fake AcpClient — only the surface area that `prompt.ts` touches. */
interface FakePromptClient {
  prompt: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
}

function resetSessionStore(): void {
  sessionStore.setState({ sessions: new Map() });
}

const SID = 'sess-1';
const textBlock: ContentBlock = { type: 'text', text: 'hi', _meta: null, annotations: null };

beforeEach(() => {
  resetSessionStore();
});

describe('sendPrompt', () => {
  it('adds a user message, flips streaming on, then off after success', async () => {
    const res: PromptResponse = { stopReason: 'end_turn', usage: null };
    const client: FakePromptClient = { prompt: vi.fn().mockResolvedValue(res), cancel: vi.fn() };

    const streamingSpy = vi.fn();
    const unsub = sessionStore.subscribe((s) => {
      const data = s.sessions.get(SID);
      if (data) streamingSpy(data.isStreaming);
    });

    await sendPrompt(client as unknown as Parameters<typeof sendPrompt>[0], SID, [textBlock]);

    // User message recorded.
    const data = sessionStore.getState().sessions.get(SID)!;
    expect(data.messages).toHaveLength(1);
    expect(data.messages[0].role).toBe('user');
    // prompt was called with the content blocks.
    expect(client.prompt).toHaveBeenCalledWith(SID, [textBlock]);
    // Streaming toggled on then off.
    expect(streamingSpy.mock.calls.map((c) => c[0])).toContain(true);
    expect(data.isStreaming).toBe(false);
    unsub();
  });

  it('sets stopReason on the user message when it is not end_turn', async () => {
    const res: PromptResponse = { stopReason: 'max_tokens', usage: null };
    const client: FakePromptClient = { prompt: vi.fn().mockResolvedValue(res), cancel: vi.fn() };
    await sendPrompt(client as unknown as Parameters<typeof sendPrompt>[0], SID, [textBlock]);
    expect(sessionStore.getState().sessions.get(SID)!.messages[0].stopReason).toBe('max_tokens');
  });

  it('does NOT set stopReason when it is end_turn', async () => {
    const res: PromptResponse = { stopReason: 'end_turn', usage: null };
    const client: FakePromptClient = { prompt: vi.fn().mockResolvedValue(res), cancel: vi.fn() };
    await sendPrompt(client as unknown as Parameters<typeof sendPrompt>[0], SID, [textBlock]);
    expect(sessionStore.getState().sessions.get(SID)!.messages[0].stopReason).toBeUndefined();
  });

  it('restores isStreaming=false and rethrows when client.prompt rejects', async () => {
    const client: FakePromptClient = {
      prompt: vi.fn().mockRejectedValue(new Error('boom')),
      cancel: vi.fn(),
    };
    await expect(
      sendPrompt(client as unknown as Parameters<typeof sendPrompt>[0], SID, [textBlock]),
    ).rejects.toThrow('boom');
    expect(sessionStore.getState().sessions.get(SID)!.isStreaming).toBe(false);
    // User message was still added before the call.
    expect(sessionStore.getState().sessions.get(SID)!.messages).toHaveLength(1);
  });

  it('returns the PromptResponse from the client', async () => {
    const res: PromptResponse = { stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } };
    const client: FakePromptClient = { prompt: vi.fn().mockResolvedValue(res), cancel: vi.fn() };
    const out = await sendPrompt(client as unknown as Parameters<typeof sendPrompt>[0], SID, [textBlock]);
    expect(out).toBe(res);
  });
});

describe('cancelPrompt', () => {
  it('forwards cancel to the client', async () => {
    const client: FakePromptClient = { prompt: vi.fn(), cancel: vi.fn().mockResolvedValue(undefined) };
    await cancelPrompt(client as unknown as Parameters<typeof cancelPrompt>[0], SID);
    expect(client.cancel).toHaveBeenCalledWith(SID);
  });
});

// ---------------------------------------------------------------------------
// queuePrompt
// ---------------------------------------------------------------------------

type QueueClient = Parameters<typeof queuePrompt>[0];

function makeDeferredClient() {
  const res: PromptResponse = { stopReason: 'end_turn', usage: null };
  let resolveCurrent: ((value: PromptResponse) => void) | null = null;
  const prompt = vi.fn(
    () =>
      new Promise<PromptResponse>((resolve) => {
        resolveCurrent = resolve;
      }),
  );
  return {
    prompt,
    cancel: vi.fn(),
    /** Resolve the in-flight prompt call (ending the current turn). */
    finishTurn: () => resolveCurrent?.(res),
  };
}

async function flushMicrotasks(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

describe('queuePrompt', () => {
  const sid = 'queue-sess';

  it('sends immediately when the session is idle', async () => {
    const client = makeDeferredClient();
    const promise = queuePrompt(client as unknown as QueueClient, sid, [textBlock]);
    client.finishTurn();
    await promise;
    expect(client.prompt).toHaveBeenCalledTimes(1);
    expect(sessionStore.getState().sessions.get(sid)!.queuedMessages).toHaveLength(0);
  });

  it('queues while streaming and flushes after the turn ends', async () => {
    const client = makeDeferredClient();
    // Start a turn so isStreaming=true.
    const first = queuePrompt(client as unknown as QueueClient, sid, [textBlock]);
    expect(sessionStore.getState().sessions.get(sid)!.isStreaming).toBe(true);

    // Second prompt lands in the queue instead of being sent.
    const secondBlock: ContentBlock = { type: 'text', text: 'queued', _meta: null, annotations: null };
    await queuePrompt(client as unknown as QueueClient, sid, [secondBlock]);
    expect(client.prompt).toHaveBeenCalledTimes(1);
    expect(sessionStore.getState().sessions.get(sid)!.queuedMessages).toHaveLength(1);

    // End the first turn — the queued prompt is sent automatically.
    client.finishTurn();
    await first;
    await flushMicrotasks();
    expect(client.prompt).toHaveBeenCalledTimes(2);
    expect(client.prompt).toHaveBeenLastCalledWith(sid, [secondBlock]);
    expect(sessionStore.getState().sessions.get(sid)!.queuedMessages).toHaveLength(0);
    client.finishTurn();
    await flushMicrotasks();
  });

  it('flushes multiple queued messages in FIFO order', async () => {
    const client = makeDeferredClient();
    const first = queuePrompt(client as unknown as QueueClient, sid, [textBlock]);
    const block2: ContentBlock = { type: 'text', text: 'q2', _meta: null, annotations: null };
    const block3: ContentBlock = { type: 'text', text: 'q3', _meta: null, annotations: null };
    await queuePrompt(client as unknown as QueueClient, sid, [block2]);
    await queuePrompt(client as unknown as QueueClient, sid, [block3]);
    expect(sessionStore.getState().sessions.get(sid)!.queuedMessages).toHaveLength(2);

    client.finishTurn();
    await first;
    await flushMicrotasks();
    expect(client.prompt).toHaveBeenNthCalledWith(2, sid, [block2]);

    client.finishTurn();
    await flushMicrotasks();
    expect(client.prompt).toHaveBeenNthCalledWith(3, sid, [block3]);
    expect(sessionStore.getState().sessions.get(sid)!.queuedMessages).toHaveLength(0);
    client.finishTurn();
    await flushMicrotasks();
  });

  it('dequeuePrompt removes a queued message so it is never sent', async () => {
    const client = makeDeferredClient();
    const first = queuePrompt(client as unknown as QueueClient, sid, [textBlock]);
    await queuePrompt(client as unknown as QueueClient, sid, [textBlock]);
    const queuedId = sessionStore.getState().sessions.get(sid)!.queuedMessages[0].id;

    dequeuePrompt(sid, queuedId);
    expect(sessionStore.getState().sessions.get(sid)!.queuedMessages).toHaveLength(0);

    client.finishTurn();
    await first;
    await flushMicrotasks();
    expect(client.prompt).toHaveBeenCalledTimes(1);
  });

  it('does not flush after the session is removed', async () => {
    const client = makeDeferredClient();
    const first = queuePrompt(client as unknown as QueueClient, sid, [textBlock]);
    await queuePrompt(client as unknown as QueueClient, sid, [textBlock]);

    sessionStore.getState().removeSession(sid);
    client.finishTurn();
    await first;
    await flushMicrotasks();
    expect(client.prompt).toHaveBeenCalledTimes(1);
  });
});
