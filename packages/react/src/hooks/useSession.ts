import { useStore } from 'zustand/react';
import { useShallow } from 'zustand/react/shallow';
import { sessionStore } from '@acp-components/core';
import type { Message, ToolCallState, PermissionRequest } from '@acp-components/core';
import type { SessionId, PlanEntry, UsageUpdate, SessionConfigOption, AvailableCommand } from '@acp-components/core';

// Module-level stable empty defaults so Object.is comparisons work when session is absent
const EMPTY_MESSAGES: Message[] = [];
const EMPTY_PLAN: PlanEntry[] = [];
const EMPTY_TOOL_CALLS: ToolCallState[] = [];
const EMPTY_PERMISSIONS: PermissionRequest[] = [];
const EMPTY_CONFIG_OPTIONS: SessionConfigOption[] = [];
const EMPTY_COMMANDS: AvailableCommand[] = [];

// ---------------------------------------------------------------------------
// Fine-grained hooks — each subscribes to a SINGLE slice of session state.
// When e.g. `usage` updates, only `useSessionUsage` re-renders; ChatView
// (which uses `useSessionMessages` + `useSessionIsStreaming`) stays quiet.
// ---------------------------------------------------------------------------

export function useSessionMessages(sessionId: SessionId | null): Message[] {
  return useStore(sessionStore, (s) => {
    if (!sessionId) return EMPTY_MESSAGES;
    return s.sessions.get(sessionId)?.messages ?? EMPTY_MESSAGES;
  });
}

export function useSessionIsStreaming(sessionId: SessionId | null): boolean {
  return useStore(sessionStore, (s) => {
    if (!sessionId) return false;
    return s.sessions.get(sessionId)?.isStreaming ?? false;
  });
}

export function useSessionPlan(sessionId: SessionId | null): PlanEntry[] {
  return useStore(sessionStore, (s) => {
    if (!sessionId) return EMPTY_PLAN;
    return s.sessions.get(sessionId)?.plan ?? EMPTY_PLAN;
  });
}

export function useSessionAvailableCommands(sessionId: SessionId | null): AvailableCommand[] {
  return useStore(sessionStore, (s) => {
    if (!sessionId) return EMPTY_COMMANDS;
    return s.sessions.get(sessionId)?.availableCommands ?? EMPTY_COMMANDS;
  });
}

/**
 * Uses shallow equality because the selector converts Map → Array, which
 * produces a new array reference on every store change. Shallow comparison
 * prevents re-renders when only non-tool-call fields (e.g. messages) change.
 */
export function useSessionPendingToolCalls(sessionId: SessionId | null): ToolCallState[] {
  return useStore(
    sessionStore,
    useShallow((s) => {
      if (!sessionId) return EMPTY_TOOL_CALLS;
      const data = s.sessions.get(sessionId);
      if (!data) return EMPTY_TOOL_CALLS;
      return Array.from(data.pendingToolCalls.values());
    }),
  );
}

export function useSessionPendingPermissions(sessionId: SessionId | null): PermissionRequest[] {
  return useStore(sessionStore, (s) => {
    if (!sessionId) return EMPTY_PERMISSIONS;
    return s.sessions.get(sessionId)?.pendingPermissions ?? EMPTY_PERMISSIONS;
  });
}

export function useSessionConfigOptions(sessionId: SessionId | null): SessionConfigOption[] {
  return useStore(sessionStore, (s) => {
    if (!sessionId) return EMPTY_CONFIG_OPTIONS;
    return s.sessions.get(sessionId)?.configOptions ?? EMPTY_CONFIG_OPTIONS;
  });
}

export function useSessionUsage(sessionId: SessionId | null): UsageUpdate | null {
  return useStore(sessionStore, (s) => {
    if (!sessionId) return null;
    return s.sessions.get(sessionId)?.usage ?? null;
  });
}
