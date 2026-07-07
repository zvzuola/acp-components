import { describe, it, expect, beforeEach } from 'vitest';
import { skillStore } from './skillStore';
import type { Skill } from './skillStore';

function resetStore(): void {
  skillStore.setState({ skillsByAgent: new Map() });
}

beforeEach(() => {
  resetStore();
});

const a: Skill = { id: 'code-review', name: 'Code Review', group: 'built-in' };
const b: Skill = { id: 'commit', name: 'Commit', description: 'Stage and commit.' };
const c: Skill = { id: 'test', name: 'Generate Tests', group: 'built-in' };

describe('skillStore — setAgentSkills', () => {
  it('stores the list under the agent, stamped with agentId', () => {
    skillStore.getState().setAgentSkills('agent-1', [b]);
    const list = skillStore.getState().skillsByAgent.get('agent-1')!;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'commit', name: 'Commit', agentId: 'agent-1' });
  });

  it('replaces the previous entry for the same agent (no merge)', () => {
    skillStore.getState().setAgentSkills('agent-1', [a, b]);
    skillStore.getState().setAgentSkills('agent-1', [c]);
    const list = skillStore.getState().skillsByAgent.get('agent-1')!;
    expect(list.map((s) => s.id)).toEqual(['test']);
  });

  it('does not touch other agents', () => {
    skillStore.getState().setAgentSkills('agent-1', [a]);
    skillStore.getState().setAgentSkills('agent-2', [b]);
    skillStore.getState().setAgentSkills('agent-1', [c]);
    expect(skillStore.getState().skillsByAgent.get('agent-2')!.map((s) => s.id)).toEqual(['commit']);
  });
});

describe('skillStore — removeAgentSkills', () => {
  it('drops the agent entry', () => {
    skillStore.getState().setAgentSkills('agent-1', [a]);
    skillStore.getState().setAgentSkills('agent-2', [b]);
    skillStore.getState().removeAgentSkills('agent-1');
    expect(skillStore.getState().skillsByAgent.has('agent-1')).toBe(false);
    expect(skillStore.getState().skillsByAgent.has('agent-2')).toBe(true);
  });

  it('is a no-op (same state reference) for an unknown agent', () => {
    const before = skillStore.getState();
    skillStore.getState().removeAgentSkills('nope');
    expect(skillStore.getState()).toBe(before);
  });
});

describe('skillStore — clear', () => {
  it('empties the per-agent catalogs', () => {
    skillStore.getState().setAgentSkills('agent-1', [a, b]);
    skillStore.getState().setAgentSkills('agent-2', [c]);
    skillStore.getState().clear();
    expect(skillStore.getState().skillsByAgent.size).toBe(0);
  });

  it('is a no-op (same state reference) when already empty', () => {
    const before = skillStore.getState();
    skillStore.getState().clear();
    expect(skillStore.getState()).toBe(before);
  });
});
