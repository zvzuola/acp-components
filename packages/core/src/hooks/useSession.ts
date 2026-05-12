import { useMemo } from 'react';
import { useSessionStore } from '../store/sessionStore';
import type { SessionId } from '@agentclientprotocol/sdk';

export function useSession(sessionId: SessionId | null) {
  const sessions = useSessionStore((s) => s.sessions);

  const data = useMemo(() => {
    if (!sessionId) return null;
    return sessions.get(sessionId) ?? null;
  }, [sessions, sessionId]);

  if (!data) {
    return {
      messages: [],
      isStreaming: false,
      pendingToolCalls: [],
      currentModeId: null,
      availableModes: [],
      currentModelId: null,
      availableModels: [],
      stopReason: null,
      pendingPermissions: [],
      plan: [],
      usage: null,
    };
  }

  return {
    messages: data.messages,
    isStreaming: data.isStreaming,
    pendingToolCalls: Array.from(data.pendingToolCalls.values()),
    currentModeId: data.currentModeId,
    availableModes: data.availableModes,
    currentModelId: data.currentModelId,
    availableModels: data.availableModels,
    stopReason: data.stopReason,
    pendingPermissions: data.pendingPermissions,
    plan: data.plan,
    usage: data.usage,
  };
}
