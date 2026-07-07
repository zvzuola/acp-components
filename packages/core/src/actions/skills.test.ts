import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearSkills,
  setAgentSkills,
  removeAgentSkills,
} from './skills';
import { skillStore } from '../store/skillStore';
import type { Skill } from '../store/skillStore';

function resetStore(): void {
  skillStore.setState({ skillsByAgent: new Map() });
}

beforeEach(() => {
  resetStore();
});

const a: Skill = { id: 'code-review', name: 'Code Review' };
const b: Skill = { id: 'commit', name: 'Commit' };

describe('actions/skills — per-agent wrappers', () => {
  it('setAgentSkills writes to skillsByAgent', () => {
    setAgentSkills('agent-1', [a, b]);
    const list = skillStore.getState().skillsByAgent.get('agent-1')!;
    expect(list.map((s) => s.id)).toEqual(['code-review', 'commit']);
    expect(list.every((s) => s.agentId === 'agent-1')).toBe(true);
  });

  it('removeAgentSkills drops the entry', () => {
    setAgentSkills('agent-1', [a]);
    removeAgentSkills('agent-1');
    expect(skillStore.getState().skillsByAgent.has('agent-1')).toBe(false);
  });

  it('clearSkills empties the catalog', () => {
    setAgentSkills('agent-1', [a, b]);
    clearSkills();
    expect(skillStore.getState().skillsByAgent.size).toBe(0);
  });
});
