import { useStore } from 'zustand/react';
import { useMemo } from 'react';
import { sessionStore } from '@acp-components/core';
import type { Message, ToolCallState, PermissionRequest } from '@acp-components/core';
import type { SessionId, PlanEntry, UsageUpdate, SessionConfigOption, AvailableCommand } from '@acp-components/core';

export function useSession(sessionId: SessionId | null): {
  messages: Message[];
  isStreaming: boolean;
  pendingToolCalls: ToolCallState[];
  pendingPermissions: PermissionRequest[];
  plan: PlanEntry[];
  usage: UsageUpdate | null;
  configOptions: SessionConfigOption[];
  availableCommands: AvailableCommand[];
} {
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
    pendingPermissions: data.pendingPermissions,
    plan: data.plan,
    usage: data.usage,
    configOptions: data.configOptions,
    availableCommands: data.availableCommands,
  };
}
