import { createStore } from 'zustand/vanilla';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A skill surfaced by the host (or fetched from an agent extension). The ACP
 * protocol does not yet define a skill primitive, so the shape is owned by the
 * UI layer; hosts populate it from whatever source they have.
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
  /** Mark as pinned / favorite — pinned skills sort first */
  pinned?: boolean;
  /** Disable the skill card (still visible, not activatable) */
  disabled?: boolean;
}

/**
 * Pure data + atomic setters for the skill catalog. Business orchestration
 * (if any) lives in `actions/skills.ts` — NOT here. Mirrors the fileViewerStore
 * split (store = data box, actions = orchestration).
 */
export interface SkillStoreState {
  /** Skill catalog; empty until a host populates it via `setSkills`/`addSkill`. */
  skills: Skill[];

  /** Replace the whole catalog. */
  setSkills: (skills: Skill[]) => void;
  /** Add a skill; no-op if a skill with the same id already exists. */
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

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const skillStore = createStore<SkillStoreState>((set) => ({
  skills: [],

  setSkills: (skills) =>
    set((state) => (state.skills === skills ? state : { skills })),

  addSkill: (skill) =>
    set((state) => {
      if (state.skills.some((s) => s.id === skill.id)) return state;
      return { skills: [...state.skills, skill] };
    }),

  updateSkill: (id, patch) =>
    set((state) => {
      const idx = state.skills.findIndex((s) => s.id === id);
      if (idx === -1) return state;
      const next = [...state.skills];
      next[idx] = { ...next[idx], ...patch };
      return { skills: next };
    }),

  removeSkill: (id) =>
    set((state) => {
      const idx = state.skills.findIndex((s) => s.id === id);
      if (idx === -1) return state;
      return { skills: state.skills.filter((s) => s.id !== id) };
    }),

  togglePin: (id) =>
    set((state) => {
      const idx = state.skills.findIndex((s) => s.id === id);
      if (idx === -1) return state;
      const next = [...state.skills];
      const cur = next[idx];
      next[idx] = { ...cur, pinned: !cur.pinned };
      return { skills: next };
    }),

  clear: () =>
    set((state) => (state.skills.length === 0 ? state : { skills: [] })),
}));
