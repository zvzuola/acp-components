import { describe, it, expect, beforeEach } from 'vitest';
import { skillStore } from './skillStore';
import type { Skill } from './skillStore';

function resetStore(): void {
  skillStore.setState({ skills: [] });
}

beforeEach(() => {
  resetStore();
});

const a: Skill = { id: 'code-review', name: 'Code Review', group: 'built-in', pinned: true };
const b: Skill = { id: 'commit', name: 'Commit', description: 'Stage and commit.' };
const c: Skill = { id: 'test', name: 'Generate Tests', group: 'built-in' };

describe('skillStore — setSkills', () => {
  it('replaces the catalog', () => {
    skillStore.getState().setSkills([a, b]);
    expect(skillStore.getState().skills.map((s) => s.id)).toEqual(['code-review', 'commit']);
  });

  it('is a no-op (same state reference) when set to the same array reference', () => {
    skillStore.getState().setSkills([a]);
    const before = skillStore.getState();
    skillStore.getState().setSkills(skillStore.getState().skills);
    expect(skillStore.getState()).toBe(before);
  });

  it('setSkills([]) empties the catalog', () => {
    skillStore.getState().setSkills([a, b]);
    skillStore.getState().setSkills([]);
    expect(skillStore.getState().skills).toEqual([]);
  });
});

describe('skillStore — addSkill', () => {
  it('appends a new skill', () => {
    skillStore.getState().addSkill(a);
    skillStore.getState().addSkill(b);
    expect(skillStore.getState().skills).toHaveLength(2);
    expect(skillStore.getState().skills[1]).toBe(b);
  });

  it('is a no-op (same state reference) when adding a duplicate id', () => {
    skillStore.getState().addSkill(a);
    const before = skillStore.getState();
    skillStore.getState().addSkill({ ...a, name: 'Different name' });
    expect(skillStore.getState()).toBe(before);
    expect(skillStore.getState().skills[0].name).toBe('Code Review');
  });
});

describe('skillStore — updateSkill', () => {
  it('merges a patch into the matching skill', () => {
    skillStore.getState().setSkills([a, b]);
    skillStore.getState().updateSkill('commit', { pinned: true, description: 'updated' });
    const updated = skillStore.getState().skills.find((s) => s.id === 'commit');
    expect(updated?.pinned).toBe(true);
    expect(updated?.description).toBe('updated');
    expect(updated?.name).toBe('Commit'); // unchanged
  });

  it('does not mutate siblings', () => {
    skillStore.getState().setSkills([a, b]);
    const beforeA = skillStore.getState().skills[0];
    skillStore.getState().updateSkill('commit', { pinned: true });
    expect(skillStore.getState().skills[0]).toBe(beforeA);
  });

  it('is a no-op (same state reference) for an unknown id', () => {
    skillStore.getState().setSkills([a]);
    const before = skillStore.getState();
    skillStore.getState().updateSkill('nope', { pinned: true });
    expect(skillStore.getState()).toBe(before);
  });
});

describe('skillStore — removeSkill', () => {
  it('removes the matching skill', () => {
    skillStore.getState().setSkills([a, b, c]);
    skillStore.getState().removeSkill('commit');
    expect(skillStore.getState().skills.map((s) => s.id)).toEqual(['code-review', 'test']);
  });

  it('is a no-op (same state reference) for an unknown id', () => {
    skillStore.getState().setSkills([a]);
    const before = skillStore.getState();
    skillStore.getState().removeSkill('nope');
    expect(skillStore.getState()).toBe(before);
  });
});

describe('skillStore — togglePin', () => {
  it('flips pinned true → false', () => {
    skillStore.getState().setSkills([a]);
    expect(skillStore.getState().skills[0].pinned).toBe(true);
    skillStore.getState().togglePin('code-review');
    expect(skillStore.getState().skills[0].pinned).toBe(false);
  });

  it('flips pinned false → true', () => {
    skillStore.getState().setSkills([b]);
    expect(skillStore.getState().skills[0].pinned).toBeUndefined();
    skillStore.getState().togglePin('commit');
    expect(skillStore.getState().skills[0].pinned).toBe(true);
  });

  it('is a no-op (same state reference) for an unknown id', () => {
    skillStore.getState().setSkills([a]);
    const before = skillStore.getState();
    skillStore.getState().togglePin('nope');
    expect(skillStore.getState()).toBe(before);
  });
});

describe('skillStore — clear', () => {
  it('empties the catalog', () => {
    skillStore.getState().setSkills([a, b, c]);
    skillStore.getState().clear();
    expect(skillStore.getState().skills).toEqual([]);
  });

  it('is a no-op (same state reference) when already empty', () => {
    const before = skillStore.getState();
    skillStore.getState().clear();
    expect(skillStore.getState()).toBe(before);
  });
});
