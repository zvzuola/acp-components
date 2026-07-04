import { skillStore } from '../store/skillStore';
import type { Skill } from '../store/skillStore';

// ---------------------------------------------------------------------------
// Public Actions (orchestration layer — store only holds pure data)
// ---------------------------------------------------------------------------

/** Replace the whole skill catalog. */
export function setSkills(skills: Skill[]): void {
  skillStore.getState().setSkills(skills);
}

/** Add a skill; no-op if a skill with the same id already exists. */
export function addSkill(skill: Skill): void {
  skillStore.getState().addSkill(skill);
}

/** Merge a partial patch into a skill by id; no-op if unknown. */
export function updateSkill(id: string, patch: Partial<Skill>): void {
  skillStore.getState().updateSkill(id, patch);
}

/** Remove a skill by id; no-op if unknown. */
export function removeSkill(id: string): void {
  skillStore.getState().removeSkill(id);
}

/** Flip the `pinned` flag on a skill by id; no-op if unknown. */
export function toggleSkillPin(id: string): void {
  skillStore.getState().togglePin(id);
}

/** Empty the skill catalog. */
export function clearSkills(): void {
  skillStore.getState().clear();
}
