import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Platform } from '../../context/PlatformContext';
import { PlatformContext } from '../../context/PlatformContext';
import { SessionView } from './SessionView';

vi.mock('../../i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('./SessionPanes', () => ({
  SessionPanes: ({ headerExtras, onNavigateFile }: {
    headerExtras?: React.ReactNode;
    onNavigateFile?: (path: string) => void;
  }) => (
    <div data-testid="session-panes" data-can-navigate={String(!!onNavigateFile)}>
      {headerExtras}
    </div>
  ),
}));

vi.mock('./SessionPanel', () => ({
  SessionPanel: ({ showFilesTab }: { showFilesTab?: boolean }) => (
    <div data-testid="session-panel" data-show-files={String(showFilesTab)} />
  ),
}));

const storage = () => ({
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
});

function renderWithPlatform(platform: Platform) {
  return render(
    <PlatformContext.Provider value={platform}>
      <SessionView sessionId={null} />
    </PlatformContext.Provider>,
  );
}

describe('SessionView platform capabilities', () => {
  it('hides file UI and navigation when the host has no file-system capability', () => {
    renderWithPlatform({ platform: 'web', os: undefined, storage });

    expect(screen.queryByTestId('session-panel')).toBeNull();
    expect(screen.getByTestId('session-panes').getAttribute('data-can-navigate')).toBe('false');
    expect(screen.queryByRole('button', { name: 'sessionView.collapse' })).toBeNull();
  });

  it('keeps the built-in Files panel when the host provides fs', () => {
    renderWithPlatform({
      platform: 'desktop',
      os: 'windows',
      storage,
      fs: {
        readDirectory: async () => [],
        readFileContent: async () => '',
      },
    });

    expect(screen.getByTestId('session-panel').getAttribute('data-show-files')).toBe('true');
    expect(screen.getByTestId('session-panes').getAttribute('data-can-navigate')).toBe('true');
    expect(screen.getByRole('button', { name: 'sessionView.collapse' })).not.toBeNull();
  });
});
