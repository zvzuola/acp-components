import { describe, it, expect, beforeEach } from 'vitest';
import {
  setSkills,
  addSkill,
  updateSkill,
  removeSkill,
  toggleSkillPin,
  clearSkills,
} from './skills';
import { skillStore } from '../store/skillStore';
import type { Skill } from '../store/skillStore';

function resetStore(): void {
  skillStore.setState({ skills: [] });
}

beforeEach(() => {
  resetStore();
});

const a: Skill = { id: 'code-review', name: 'Code Review', pinned: true };
const b: Skill = { id: 'commit', name: 'Commit' };

describe('actions/skills — thin wrappers over skillStore', () => {
  it('setSkills replaces the catalog', () => {
    setSkills([a, b]);
    expect(skillStore.getState().skills).toHaveLength(2);
  });

  it('addSkill appends, ignoring duplicates by id', () => {
    addSkill(a);
    addSkill({ ...a, name: 'dup' });
    addSkill(b);
    expect(skillStore.getState().skills.map((s) => s.id)).toEqual(['code-review', 'commit']);
  });

  it('updateSkill merges a patch', () => {
    setSkills([b]);
    updateSkill('commit', { pinned: true });
    expect(skillStore.getState().skills[0].pinned).toBe(true);
    expect(skillStore.getState().skills[0].name).toBe('Commit');
  });

  it('removeSkill removes by id', () => {
    setSkills([a, b]);
    removeSkill('code-review');
    expect(skillStore.getState().skills.map((s) => s.id)).toEqual(['commit']);
  });

  it('toggleSkillPin flips the pinned flag', () => {
    setSkills([a]);
    expect(skillStore.getState().skills[0].pinned).toBe(true);
    toggleSkillPin('code-review');
    expect(skillStore.getState().skills[0].pinned).toBe(false);
    toggleSkillPin('code-review');
    expect(skillStore.getState().skills[0].pinned).toBe(true);
  });

  it('clearSkills empties the catalog', () => {
    setSkills([a, b]);
    clearSkills();
    expect(skillStore.getState().skills).toEqual([]);
  });
});
