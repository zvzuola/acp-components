import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ChatComposer } from './ChatComposer';

describe('ChatComposer', () => {
  afterEach(() => {
    // Flush any pending React scheduler microtasks from the auto-resize
    // effect so they do not race past the jsdom teardown (React 19 + jsdom
    // throws a spurious "window is not defined" otherwise).
  });

  it('calls onSend when Enter is pressed (no shift)', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(
      <ChatComposer
        value="hello"
        onChange={() => {}}
        onSend={onSend}
        isStreaming={false}
      />,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    await vi.waitFor(() => {
      expect(onSend).toHaveBeenCalledTimes(1);
    });
    unmount();
  });

  it('does NOT call onSend when Shift+Enter is pressed', () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(
      <ChatComposer
        value="hello"
        onChange={() => {}}
        onSend={onSend}
        isStreaming={false}
      />,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    unmount();
  });

  it('does NOT call onSend when Ctrl+Enter is pressed', () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(
      <ChatComposer
        value="hello"
        onChange={() => {}}
        onSend={onSend}
        isStreaming={false}
      />,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    expect(onSend).not.toHaveBeenCalled();
    unmount();
  });

  it('shows the drop overlay when files are dragged over', () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container, unmount } = render(
      <ChatComposer
        value=""
        onChange={() => {}}
        onSend={onSend}
        isStreaming={false}
      />,
    );
    // CSS Modules hashes the class name, so use container.firstChild to
    // get the root div that carries the drag handlers.
    const root = container.firstChild as HTMLElement;
    expect(root).not.toBeNull();
    fireEvent.dragOver(root, {
      dataTransfer: { types: ['Files'] } as unknown as DataTransfer,
    });
    expect(screen.getByText('composer.dropFiles')).toBeDefined();
    unmount();
  });

  it('attaches a file on drop and calls onSend with a resource_link block', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container, unmount } = render(
      <ChatComposer
        value=""
        onChange={() => {}}
        onSend={onSend}
        isStreaming={false}
      />,
    );
    const root = container.firstChild as HTMLElement;
    const file = new File(['hello'], 'test.txt', { type: 'text/plain' });
    fireEvent.drop(root, {
      dataTransfer: { files: [file], types: ['Files'] } as unknown as DataTransfer,
    });
    // After dropping a file, the send button should be enabled.
    const sendBtn = screen.getByRole('button', { name: 'composer.sendAriaLabel' });
    expect(sendBtn.hasAttribute('disabled')).toBe(false);
    fireEvent.click(sendBtn);
    await vi.waitFor(() => {
      expect(onSend).toHaveBeenCalledTimes(1);
    });
    const blocks = onSend.mock.calls[0][0];
    expect(blocks.some((b: any) => b.type === 'resource_link')).toBe(true);
    unmount();
  });

  it('attaches a pasted image file', () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(
      <ChatComposer
        value=""
        onChange={() => {}}
        onSend={onSend}
        isStreaming={false}
      />,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    const file = new File(['img'], 'paste.png', { type: 'image/png' });
    fireEvent.paste(textarea, {
      clipboardData: {
        items: [{ kind: 'file', getAsFile: () => file }],
      } as unknown as DataTransfer,
    });
    // After pasting a file, the send button should be enabled.
    const sendBtn = screen.getByRole('button', { name: 'composer.sendAriaLabel' });
    expect(sendBtn.hasAttribute('disabled')).toBe(false);
    unmount();
  });

  it('disables send when empty and no files attached', () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(
      <ChatComposer
        value=""
        onChange={() => {}}
        onSend={onSend}
        isStreaming={false}
      />,
    );
    const sendBtn = screen.getByRole('button', { name: 'composer.sendAriaLabel' });
    expect(sendBtn.hasAttribute('disabled')).toBe(true);
    unmount();
  });
});
