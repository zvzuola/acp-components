import { useCallback, useMemo } from 'react';
import { useStore } from 'zustand/react';
import {
  skillStore,
  clearSkills as coreClearSkills,
  setAgentSkills as coreSetAgentSkills,
  removeAgentSkills as coreRemoveAgentSkills,
} from '@acp-components/core';
import type { Skill } from '@acp-components/core';

export type { Skill };

/** One agent's slice of the per-agent skill catalog. */
export interface AgentSkillGroup {
  agentId: string;
  skills: Skill[];
}

export interface UseSkillsReturn {
  /**
   * Per-agent catalog, newest agent first by insertion. Populated when the
   * React layer calls `AcpClient.listSkills()` per connected agent and writes
   * the result via `setAgentSkills`.
   */
  agentSkills: AgentSkillGroup[];
  /** Empty the catalog. */
  clear: () => void;
  /** Replace the per-agent catalog for `agentId` (latest `listSkills()`). */
  setAgentSkills: (agentId: string, skills: Skill[]) => void;
  /** Drop the per-agent catalog for `agentId`. */
  removeAgentSkills: (agentId: string) => void;
}

type SkillStoreState = ReturnType<typeof skillStore.getState>;

/**
 * Subscribe to the global skill store (backed by `skillStore` in
 * `@acp-components/core`). State is shared across every component that calls
 * this hook — no props threading required. The per-agent catalog is populated
 * by the React layer from `AcpClient.listSkills()` (see `SkillView`).
 */
export function useSkills(): UseSkillsReturn {
  // Selectors return the store's own references (which only change on a real
  // mutation) so `useSyncExternalStore` does not loop. The per-agent Map is
  // rebuilt as a new reference on every `setAgentSkills` / `removeAgentSkills`,
  // so plain `===` is sufficient — no `useShallow` wrapper (which would
  // re-create wrapper objects each render and trigger an infinite loop).
  const skillsByAgent = useStore(
    skillStore,
    useCallback((s: SkillStoreState) => s.skillsByAgent, []),
  );

  // Flatten the Map to the public array shape. A new array each render is fine
  // here — it is derived value, not the snapshot `useSyncExternalStore` reads.
  const agentSkills = useMemo<AgentSkillGroup[]>(
    () => Array.from(skillsByAgent.entries()).map(([agentId, skills]) => ({ agentId, skills })),
    [skillsByAgent],
  );

  const handleClear = useCallback(() => coreClearSkills(), []);
  const handleSetAgentSkills = useCallback(
    (agentId: string, next: Skill[]) => coreSetAgentSkills(agentId, next),
    [],
  );
  const handleRemoveAgentSkills = useCallback(
    (agentId: string) => coreRemoveAgentSkills(agentId),
    [],
  );

  return {
    agentSkills,
    clear: handleClear,
    setAgentSkills: handleSetAgentSkills,
    removeAgentSkills: handleRemoveAgentSkills,
  };
}
