import { useStore } from 'zustand/react';
import { useMemo } from 'react';
import { sessionStore } from '@acp-components/core';
import type { SessionId } from '@agentclientprotocol/sdk';

export function useSession(sessionId: SessionId | null) {
  const sessions = useStore(sessionStore, (s) => s.sessions);

  const data = useMemo(() => {
    if (!sessionId) return null;
    return sessions.get(sessionId) ?? null;
  }, [sessions, sessionId]);

  if (!data) {
    return {
      messages: [],
      isStreaming: false,
      pendingToolCalls: [],
      stopReason: null,
      pendingPermissions: [],
      plan: [],
      usage: null,
      configOptions: [],
      availableCommands: [],
    };
  }

  return {
    messages: data.messages,
    isStreaming: data.isStreaming,
    pendingToolCalls: Array.from(data.pendingToolCalls.values()),
    stopReason: data.stopReason,
    pendingPermissions: data.pendingPermissions,
    plan: data.plan,
    usage: data.usage,
    configOptions: data.configOptions,
    availableCommands: data.availableCommands,
  };
}
