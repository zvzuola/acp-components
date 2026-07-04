import { useCallback } from 'react';
import { useStore } from 'zustand/react';
import {
  skillStore,
  setSkills as coreSetSkills,
  addSkill as coreAddSkill,
  updateSkill as coreUpdateSkill,
  removeSkill as coreRemoveSkill,
  toggleSkillPin as coreToggleSkillPin,
  clearSkills as coreClearSkills,
} from '@acp-components/core';
import type { Skill } from '@acp-components/core';

export type { Skill };

export interface UseSkillsReturn {
  /** Skill catalog (read from the global store). Empty until a host populates it. */
  skills: Skill[];
  /** Replace the whole catalog. */
  setSkills: (skills: Skill[]) => void;
  /** Add a skill; no-op if the id already exists. */
  addSkill: (skill: Skill) => void;
  /** Merge a partial patch into a skill by id; no-op if unknown. */
  updateSkill: (id: string, patch: Partial<Skill>) => void;
  /** Remove a skill by id; no-op if unknown. */
  removeSkill: (id: string) => void;
  /** Flip the `pinned` flag on a skill by id; no-op if unknown. */
  togglePin: (id: string) => void;
  /** Empty the catalog. */
  clear: () => void;
}

type SkillStoreState = ReturnType<typeof skillStore.getState>;

/**
 * Subscribe to the global skill store (backed by `skillStore` in
 * `@acp-components/core`). State is shared across every component that calls
 * this hook — no props threading required. Hosts populate the catalog via
 * `setSkills` / `addSkill` (e.g. from a host-side catalog or an agent extension
 * listing).
 */
export function useSkills(): UseSkillsReturn {
  const skills = useStore(
    skillStore,
    useCallback((s: SkillStoreState) => s.skills, []),
  );

  const handleSetSkills = useCallback((next: Skill[]) => coreSetSkills(next), []);
  const handleAddSkill = useCallback((skill: Skill) => coreAddSkill(skill), []);
  const handleUpdateSkill = useCallback(
    (id: string, patch: Partial<Skill>) => coreUpdateSkill(id, patch),
    [],
  );
  const handleRemoveSkill = useCallback((id: string) => coreRemoveSkill(id), []);
  const handleTogglePin = useCallback((id: string) => coreToggleSkillPin(id), []);
  const handleClear = useCallback(() => coreClearSkills(), []);

  return {
    skills,
    setSkills: handleSetSkills,
    addSkill: handleAddSkill,
    updateSkill: handleUpdateSkill,
    removeSkill: handleRemoveSkill,
    togglePin: handleTogglePin,
    clear: handleClear,
  };
}
