import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';
import { ChatComposer } from './ChatComposer';
import type { ChatComposerProps } from './ChatComposer';

/** Stateful wrapper so keyboard-driven value changes are observable. */
function Controlled({
  initial = '',
  ...rest
}: Partial<ChatComposerProps> & { initial?: string }) {
  const [v, setV] = useState(initial);
  const onSend = rest.onSend ?? (async () => {});
  return (
    <ChatComposer
      availableCommands={rest.availableCommands}
      history={rest.history}
      onSent={rest.onSent}
      onCancel={rest.onCancel}
      promptCapabilities={rest.promptCapabilities}
      disabled={rest.disabled}
      placeholder={rest.placeholder}
      isStreaming={rest.isStreaming ?? false}
      value={v}
      onChange={(val) => {
        setV(val);
        rest.onChange?.(val);
      }}
      onSend={onSend}
    />
  );
}

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

describe('ChatComposer — prompt history', () => {
  it('recalls the latest entry on ArrowUp and walks back', () => {
    const { unmount } = render(<Controlled history={['first', 'second']} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'ArrowUp' });
    expect(textarea.value).toBe('second');
    fireEvent.keyDown(textarea, { key: 'ArrowUp' });
    expect(textarea.value).toBe('first');
    unmount();
  });

  it('walks forward on ArrowDown and restores the draft at the end', () => {
    const { unmount } = render(<Controlled history={['first', 'second']} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'wip' } });
    fireEvent.keyDown(textarea, { key: 'ArrowUp' });
    expect(textarea.value).toBe('second');
    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    expect(textarea.value).toBe('wip');
    unmount();
  });

  it('does NOT hijack ArrowUp when the cursor is not on the first line', () => {
    const { unmount } = render(<Controlled history={['entry']} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'line1\nline2' } });
    // jsdom places the caret at the end (second line) after change.
    fireEvent.keyDown(textarea, { key: 'ArrowUp' });
    expect(textarea.value).toBe('line1\nline2');
    unmount();
  });

  it('calls onSent with the text after a successful send', async () => {
    const onSent = vi.fn();
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<Controlled initial="hello" onSend={onSend} onSent={onSent} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await vi.waitFor(() => expect(onSent).toHaveBeenCalledWith('hello'));
    unmount();
  });
});

describe('ChatComposer — queue while streaming', () => {
  it('still calls onSend on Enter while streaming (host decides queueing)', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(
      <Controlled initial="queued" isStreaming onSend={onSend} onCancel={() => {}} />,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await vi.waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    unmount();
  });
});
