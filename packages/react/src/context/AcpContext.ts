import { createContext, useContext } from 'react';
import type { AcpClient, AgentConfig, AgentConnection } from '@acp-components/core';

/**
 * Agent data-layer context: connection / session state for the configured
 * agents. This context carries ONLY agent-facing values — `getClient`,
 * the `agents` list, `addAgent`/`removeAgent`, `isReady`, and the set of
 * built-in agent ids.
 *
 * Workspace state (`workspaces`, `addWorkspace`, `removeWorkspace`) is NOT
 * here — it lives in `acpStore` and is exposed to UI via `useWorkspaces()`.
 * The two are orthogonal: this context is the agent connection state, while
 * workspaces are directory-scoped session groupings that persist across
 * agent reconnects. See `useWorkspaces` for the rationale.
 */
export interface AcpContextValue {
  getClient(agentId: string): AcpClient | null;
  agents: AgentConnection[];
  addAgent(config: AgentConfig): Promise<void>;
  removeAgent(agentId: string): Promise<void>;
  /**
   * Ids of agents supplied via the `AcpProvider` `agents` prop — the host's
   * built-in set. These are NOT user-managed: they cannot be removed through
   * `removeAgent` (the call is rejected) and UI surfaces hide their delete
   * affordance. Only agents added at runtime via `addAgent` (e.g. through the
   * Agents management view) are removable.
   */
  builtinAgentIds: Set<string>;
  isReady: boolean;
}

export const AcpContext = createContext<AcpContextValue | null>(null);

export function useAcpContext(): AcpContextValue {
  const ctx = useContext(AcpContext);
  if (!ctx) {
    throw new Error('useAcpContext must be used within an AcpProvider');
  }
  return ctx;
}
