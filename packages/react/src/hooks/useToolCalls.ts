import { useSessionPendingToolCalls } from './useSession';
import type { SessionId } from '@acp-components/core';

export function useToolCalls(sessionId: SessionId | null) {
  const pendingToolCalls = useSessionPendingToolCalls(sessionId);
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
