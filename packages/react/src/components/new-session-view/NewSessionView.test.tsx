import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acpStore } from '@acp-components/core';
import { AcpContext } from '../../context/AcpContext';
import type { AcpContextValue } from '../../context/AcpContext';
import { NewSessionView } from './NewSessionView';

vi.mock('../../i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../../context/PlatformContext', () => ({
  usePlatform: () => ({}),
}));

const acpContext: AcpContextValue = {
  getClient: () => null,
  agents: [],
  addAgent: async () => {},
  removeAgent: async () => {},
  builtinAgentIds: new Set(),
  isReady: true,
};

beforeEach(() => {
  acpStore.setState({
    agents: new Map(),
    workspaces: new Map(),
    activeSessionId: null,
    pendingAuth: null,
  });
});

describe('NewSessionView empty state', () => {
  it('offers agent setup instead of showing the composer', () => {
    const onAddAgent = vi.fn();

    render(
      <AcpContext.Provider value={acpContext}>
        <NewSessionView onAddAgent={onAddAgent} />
      </AcpContext.Provider>,
    );

    expect(screen.getByText('newSession.noAgents')).not.toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'newSession.addAgent' }));
    expect(onAddAgent).toHaveBeenCalledOnce();
  });
});
