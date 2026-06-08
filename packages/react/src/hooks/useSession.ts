import { useStore } from 'zustand/react';
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
  const data = useStore(sessionStore, (s) => {
    if (!sessionId) return null;
    return s.sessions.get(sessionId) ?? null;
  });

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
