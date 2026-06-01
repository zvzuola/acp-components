import { createContext, useContext } from 'react';
import type { AcpClient, AgentConfig, AgentConnection, WorkspaceState } from '@acp-components/core';

export interface AcpContextValue {
  getClient(agentId: string): AcpClient | null;
  agents: AgentConnection[];
  workspaces: WorkspaceState[];
  addAgent(config: AgentConfig): Promise<void>;
  removeAgent(agentId: string): Promise<void>;
  isReady: boolean;
  addWorkspace: (cwd: string) => void;
  removeWorkspace: (cwd: string) => void;
}

export const AcpContext = createContext<AcpContextValue | null>(null);

export function useAcpContext(): AcpContextValue {
  const ctx = useContext(AcpContext);
  if (!ctx) {
    throw new Error('useAcpContext must be used within an AcpProvider');
  }
  return ctx;
}
