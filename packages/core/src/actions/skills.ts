import { skillStore } from '../store/skillStore';
import type { Skill } from '../store/skillStore';

// ---------------------------------------------------------------------------
// Public Actions (orchestration layer — store only holds pure data)
// ---------------------------------------------------------------------------

/** Empty the skill catalog. */
export function clearSkills(): void {
  skillStore.getState().clear();
}

/**
 * Replace the per-agent catalog for `agentId` (the latest `listSkills()` result
 * for that agent). The React layer calls this after fetching
 * `AcpClient.listSkills()`.
 */
export function setAgentSkills(agentId: string, skills: Skill[]): void {
  skillStore.getState().setAgentSkills(agentId, skills);
}

/** Drop the per-agent catalog for `agentId` (e.g. on agent disconnect). */
export function removeAgentSkills(agentId: string): void {
  skillStore.getState().removeAgentSkills(agentId);
}
