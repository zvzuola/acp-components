import { useSession } from './useSession';
import type { SessionId } from '@agentclientprotocol/sdk';

export function useToolCalls(sessionId: SessionId | null) {
  const { pendingToolCalls } = useSession(sessionId);
  return {
    toolCalls: pendingToolCalls,
    activeToolCalls: pendingToolCalls.filter(
      (tc) => tc.status === 'pending' || tc.status === 'in_progress'
    ),
    completedToolCalls: pendingToolCalls.filter(
      (tc) => tc.status === 'completed' || tc.status === 'failed'
    ),
  };
}
