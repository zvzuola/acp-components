import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ToolCallState } from '@acp-components/core';
import { ToolCallCard } from './ToolCallCard';

const toolCall: ToolCallState = {
  toolCallId: 'read-1',
  title: 'Read source',
  kind: 'read',
  status: 'completed',
  locations: [{ path: '/workspace/src/main.ts', line: 12 }],
};

function renderCard(onNavigate?: (path: string, line?: number | null) => void) {
  return render(
    <ToolCallCard
      sessionId="session-1"
      toolCall={toolCall}
      onNavigate={onNavigate}
      expanded
      onExpandedChange={() => {}}
    />,
  );
}

describe('ToolCallCard file locations', () => {
  it('renders a non-interactive location when file navigation is unavailable', () => {
    renderCard();

    expect(screen.getByText('main.ts').closest('[role="button"]')).toBeNull();
  });

  it('navigates when the host supplies a file handler', () => {
    const onNavigate = vi.fn();
    renderCard(onNavigate);

    fireEvent.click(screen.getByRole('button', { name: /main\.ts/ }));
    expect(onNavigate).toHaveBeenCalledWith('/workspace/src/main.ts', 12);
  });
});
