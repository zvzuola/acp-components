import { createStore } from 'zustand/vanilla';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A skill fetched from an agent via `AcpClient.listSkills()` (`_acp/skills/list`
 * extension method). The ACP protocol does not yet define a skill primitive,
 * so the shape is owned by the UI layer.
 *
 * core owns the pure-data shape (no React types). The react layer extends this
 * with an optional `icon` React node for rendering — see `SkillView`.
 */
export interface Skill {
  /** Stable unique id */
  id: string;
  /** Display name */
  name: string;
  /** One-line description shown under the name */
  description?: string;
  /** Optional source/group label, e.g. "built-in" / an agent id */
  group?: string;
  /** Optional icon hint (e.g. an antd icon name or emoji). The react layer
   * maps this to a rendered icon; ignored by pure-data consumers. */
  iconName?: string;
  /** Disable the skill card (still visible, not activatable) */
  disabled?: boolean;
  /**
   * Owning agent. Stamped automatically by `setAgentSkills`; the React layer
   * uses it to group skills by agent in the view.
   */
  agentId?: string;
  /**
   * Source workspace root this skill was reported for. When `_acp/skills/list`
   * is called with `cwds`, the agent returns one entry per cwd
   * (`{ cwd, skills: [...] }`); each skill is stamped with the `cwd` of the
   * entry it came from. Absent for agents that return a flat catalog
   * (legacy / no-cwd response shape).
   */
  cwd?: string;
}

/**
 * Pure data + atomic setters for the skill catalog. Business orchestration
 * (if any) lives in `actions/skills.ts` — NOT here. Mirrors the fileViewerStore
 * split (store = data box, actions = orchestration).
 *
 * The catalog is per-agent: keyed by agentId, each entry is the most recent
 * `listSkills()` result for that agent. The same skill id on two agents does
 * not collide.
 */
export interface SkillStoreState {
  /**
   * Per-agent skill catalog. Keyed by agentId; each entry is the most recent
   * `listSkills()` result for that agent. Stamped with `agentId` on write.
   */
  skillsByAgent: Map<string, Skill[]>;

  /** Empty the catalog. */
  clear: () => void;

  /**
   * Replace the per-agent catalog for `agentId`. Each skill is stamped with
   * `agentId`.
   */
  setAgentSkills: (agentId: string, skills: Skill[]) => void;
  /** Drop the per-agent catalog for `agentId` (e.g. on agent disconnect). */
  removeAgentSkills: (agentId: string) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const skillStore = createStore<SkillStoreState>((set) => ({
  skillsByAgent: new Map(),

  clear: () =>
    set((state) =>
      state.skillsByAgent.size === 0 ? state : { skillsByAgent: new Map() },
    ),

  setAgentSkills: (agentId, skills) =>
    set((state) => {
      const stamped = skills.map((s) => ({ ...s, agentId }));
      const next = new Map(state.skillsByAgent);
      next.set(agentId, stamped);
      return { skillsByAgent: next };
    }),

  removeAgentSkills: (agentId) =>
    set((state) => {
      if (!state.skillsByAgent.has(agentId)) return state;
      const next = new Map(state.skillsByAgent);
      next.delete(agentId);
      return { skillsByAgent: next };
    }),
}));
