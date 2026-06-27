import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { Dropdown } from './Dropdown';

const { Trigger, Content, Item, Submenu, SubmenuItem } = Dropdown;

/** A standard dropdown mounted for most tests. */
function renderDropdown(overrides?: { onItem?: () => void; onSub?: () => void }) {
  return render(
    <Dropdown>
      <Trigger>Open</Trigger>
      <Content>
        <Item label="First" onClick={overrides?.onItem} />
        <Item label="Second" />
        <Submenu label="More">
          <SubmenuItem label="Deep" onClick={overrides?.onSub} />
        </Submenu>
      </Content>
    </Dropdown>,
  );
}

describe('Dropdown — open/close', () => {
  it('does not render content when closed', () => {
    renderDropdown();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByText('First')).toBeNull();
  });

  it('toggles content on trigger click', () => {
    renderDropdown();
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByRole('menu')).toBeDefined();
    expect(screen.getByText('First')).toBeDefined();

    fireEvent.click(screen.getByText('Open'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape', () => {
    renderDropdown();
    fireEvent.click(screen.getByText('Open'));
    expect(screen.queryByRole('menu')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on outside click', () => {
    renderDropdown();
    fireEvent.click(screen.getByText('Open'));
    expect(screen.queryByRole('menu')).not.toBeNull();

    // Click somewhere outside both trigger and content.
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not close on a click inside the content', () => {
    renderDropdown();
    fireEvent.click(screen.getByText('Open'));
    fireEvent.mouseDown(screen.getByRole('menu'));
    expect(screen.queryByRole('menu')).not.toBeNull();
  });
});

describe('Dropdown — Item', () => {
  it('invokes onClick and does NOT auto-close (Item is a plain button)', () => {
    const onItem = vi.fn();
    renderDropdown({ onItem });
    fireEvent.click(screen.getByText('Open'));
    fireEvent.click(screen.getByText('First'));
    expect(onItem).toHaveBeenCalledTimes(1);
    // A plain Item does not close the menu (only SubmenuItem does).
    expect(screen.queryByRole('menu')).not.toBeNull();
  });

  it('disabled Item does not fire onClick', () => {
    render(
      <Dropdown>
        <Trigger>Open</Trigger>
        <Content>
          <Item label="Nope" disabled onClick={() => { throw new Error('should not fire'); }} />
        </Content>
      </Dropdown>,
    );
    fireEvent.click(screen.getByText('Open'));
    const item = screen.getByText('Nope').closest('button')!;
    expect(item.disabled).toBe(true);
    fireEvent.click(item);
    // No error thrown → onClick skipped.
    expect(true).toBe(true);
  });
});

describe('Dropdown — Submenu', () => {
  it('expands on hover and SubmenuItem closes the menu after click', () => {
    const onSub = vi.fn();
    renderDropdown({ onSub });
    fireEvent.click(screen.getByText('Open'));

    // Hover the submenu label to expand it.
    fireEvent.mouseEnter(screen.getByText('More'));
    expect(screen.getByText('Deep')).toBeDefined();

    fireEvent.click(screen.getByText('Deep'));
    expect(onSub).toHaveBeenCalledTimes(1);
    // SubmenuItem auto-closes the dropdown.
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('Dropdown — compound guard', () => {
  it('throws when a compound child is used outside <Dropdown>', () => {
    // Silence the expected error output for this test.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger>Loose</Trigger>)).toThrow(/must be used within <Dropdown>/);
    spy.mockRestore();
  });
});
