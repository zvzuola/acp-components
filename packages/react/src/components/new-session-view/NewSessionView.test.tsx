import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acpStore } from '@acp-components/core';
import type { AcpClient, AgentConnection } from '@acp-components/core';
import { AcpContext } from '../../context/AcpContext';
import type { AcpContextValue } from '../../context/AcpContext';
import { NewSessionView } from './NewSessionView';

const platformMocks = vi.hoisted(() => ({
  openFilePicker: vi.fn(),
}));

vi.mock('../../i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../../context/PlatformContext', () => ({
  usePlatform: () => ({
    dialogs: { openFilePicker: platformMocks.openFilePicker },
  }),
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
  platformMocks.openFilePicker.mockReset();
  acpStore.setState({
    agents: new Map(),
    workspaces: new Map(),
    activeSessionId: null,
    pendingAuth: null,
  });
});

function renderWithAgent(client: AcpClient, onSubmitted?: (sessionId: string) => void) {
  const agent: AgentConnection = {
    id: 'agent-1',
    name: 'Agent 1',
    status: 'connected',
    agentInfo: null,
    capabilities: null,
    authMethods: [],
  };
  acpStore.getState().addAgent(agent);

  return render(
    <AcpContext.Provider value={{ ...acpContext, getClient: () => client }}>
      <NewSessionView onSubmitted={onSubmitted} />
    </AcpContext.Provider>,
  );
}

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

describe('NewSessionView workspace selection', () => {
  it('asks for a folder before creating and sending a session', async () => {
    platformMocks.openFilePicker.mockResolvedValue('C:\\work\\project');
    const newSession = vi.fn().mockResolvedValue({ sessionId: 'session-1' });
    const prompt = vi.fn().mockResolvedValue({ stopReason: 'end_turn' });
    const onSubmitted = vi.fn();
    const client = { newSession, prompt } as unknown as AcpClient;
    renderWithAgent(client, onSubmitted);

    const textbox = screen.getByRole('textbox');
    fireEvent.change(textbox, { target: { value: 'Help me' } });
    fireEvent.click(screen.getByRole('button', { name: 'composer.sendAriaLabel' }));

    await waitFor(() => {
      expect(platformMocks.openFilePicker).toHaveBeenCalledWith({ directory: true });
      expect(newSession).toHaveBeenCalledWith('C:\\work\\project');
      expect(prompt).toHaveBeenCalledWith('session-1', [
        expect.objectContaining({ type: 'text', text: 'Help me' }),
      ]);
      expect(onSubmitted).toHaveBeenCalledWith('session-1');
    });
    expect(acpStore.getState().workspaces.has('C:\\work\\project')).toBe(true);
    expect((textbox as HTMLTextAreaElement).value).toBe('');
  });

  it('keeps the draft and does not create a session when folder selection is cancelled', async () => {
    platformMocks.openFilePicker.mockResolvedValue(null);
    const newSession = vi.fn();
    const prompt = vi.fn();
    const client = { newSession, prompt } as unknown as AcpClient;
    renderWithAgent(client);

    const textbox = screen.getByRole('textbox');
    fireEvent.change(textbox, { target: { value: 'Keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'composer.sendAriaLabel' }));

    await waitFor(() => expect(platformMocks.openFilePicker).toHaveBeenCalledOnce());
    expect(newSession).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
    expect((textbox as HTMLTextAreaElement).value).toBe('Keep this draft');
  });
});
