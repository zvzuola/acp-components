import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendPrompt, cancelPrompt } from './prompt';
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
