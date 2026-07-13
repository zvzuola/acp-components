import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Markdown } from './Markdown';

describe('Markdown code-block copy', () => {
  let originalClipboard: Clipboard | undefined;
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalClipboard = navigator.clipboard;
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
  });

  it('renders a copy button for a fenced code block with a language', () => {
    render(<Markdown>{'```python\nprint("hi")\n```'}</Markdown>);
    const btn = screen.getByRole('button', { name: 'markdown.copyCode' });
    expect(btn).toBeDefined();
  });

  it('renders a copy button for a fenced code block without a language', () => {
    render(<Markdown>{'```\nplain code\n```'}</Markdown>);
    const btn = screen.getByRole('button', { name: 'markdown.copyCode' });
    expect(btn).toBeDefined();
  });

  it('copies the code text when the button is clicked', () => {
    render(<Markdown>{'```python\nprint("hi")\n```'}</Markdown>);
    const btn = screen.getByRole('button', { name: 'markdown.copyCode' });
    fireEvent.click(btn);
    expect(writeTextMock).toHaveBeenCalledWith('print("hi")\n');
  });
});
