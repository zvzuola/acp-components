import { describe, it, expect } from 'vitest';
import {
  parseShortcut,
  matchShortcut,
  matchesShortcut,
  formatShortcut,
  primaryModifier,
  usesMeta,
  type ShortcutKeyEvent,
} from './keyboard';

// Helper: build a minimal KeyboardEvent-like object for testing.
function keyEvent(key: string, mods: Partial<Pick<ShortcutKeyEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>> = {}): ShortcutKeyEvent {
  return {
    key,
    altKey: mods.altKey ?? false,
    ctrlKey: mods.ctrlKey ?? false,
    metaKey: mods.metaKey ?? false,
    shiftKey: mods.shiftKey ?? false,
  };
}

describe('primaryModifier', () => {
  it('returns Meta for macOS', () => {
    expect(primaryModifier('macos')).toBe('Meta');
  });

  it('returns Ctrl for Windows and Linux', () => {
    expect(primaryModifier('windows')).toBe('Ctrl');
    expect(primaryModifier('linux')).toBe('Ctrl');
  });

  it('returns Ctrl when OS is undetermined', () => {
    expect(primaryModifier(undefined)).toBe('Ctrl');
  });
});

describe('usesMeta', () => {
  it('is true only for macOS', () => {
    expect(usesMeta('macos')).toBe(true);
    expect(usesMeta('windows')).toBe(false);
    expect(usesMeta('linux')).toBe(false);
    expect(usesMeta(undefined)).toBe(false);
  });
});

describe('parseShortcut', () => {
  it('parses a simple key with no modifiers', () => {
    const p = parseShortcut('Enter');
    expect(p.key).toBe('enter');
    expect(p.mod).toBe(false);
    expect(p.shift).toBe(false);
  });

  it('parses Mod+N', () => {
    const p = parseShortcut('Mod+N');
    expect(p.key).toBe('n');
    expect(p.mod).toBe(true);
    expect(p.ctrl).toBe(false);
    expect(p.meta).toBe(false);
  });

  it('parses Mod+Shift+P', () => {
    const p = parseShortcut('Mod+Shift+P');
    expect(p.key).toBe('p');
    expect(p.mod).toBe(true);
    expect(p.shift).toBe(true);
  });

  it('parses literal Ctrl+K and Meta+K', () => {
    expect(parseShortcut('Ctrl+K').ctrl).toBe(true);
    expect(parseShortcut('Meta+K').meta).toBe(true);
  });

  it('accepts aliases (cmd, control, option, esc)', () => {
    expect(parseShortcut('Cmd+K').mod).toBe(true);
    expect(parseShortcut('Control+K').ctrl).toBe(true);
    expect(parseShortcut('Option+K').alt).toBe(true);
    expect(parseShortcut('Esc').key).toBe('escape');
  });

  it('normalizes key aliases', () => {
    expect(parseShortcut('Return').key).toBe('enter');
    expect(parseShortcut('Space').key).toBe(' ');
    expect(parseShortcut('Up').key).toBe('arrowup');
    expect(parseShortcut('Del').key).toBe('delete');
  });

  it('is case-insensitive', () => {
    const p = parseShortcut('mod+shift+p');
    expect(p.mod).toBe(true);
    expect(p.shift).toBe(true);
    expect(p.key).toBe('p');
  });

  it('returns empty key for empty or whitespace spec', () => {
    expect(parseShortcut('').key).toBe('');
    expect(parseShortcut('   ').key).toBe('');
  });

  it('returns empty key when only a modifier is given', () => {
    expect(parseShortcut('Mod+').key).toBe('');
  });
});

describe('matchShortcut', () => {
  it('matches Mod+N with Cmd on macOS', () => {
    const parsed = parseShortcut('Mod+N');
    expect(matchShortcut(keyEvent('n', { metaKey: true }), parsed, 'macos')).toBe(true);
  });

  it('matches Mod+N with Ctrl on Windows', () => {
    const parsed = parseShortcut('Mod+N');
    expect(matchShortcut(keyEvent('n', { ctrlKey: true }), parsed, 'windows')).toBe(true);
  });

  it('does NOT match Mod+N with Cmd on Windows', () => {
    const parsed = parseShortcut('Mod+N');
    expect(matchShortcut(keyEvent('n', { metaKey: true }), parsed, 'windows')).toBe(false);
  });

  it('does NOT match Mod+N with Ctrl on macOS', () => {
    const parsed = parseShortcut('Mod+N');
    expect(matchShortcut(keyEvent('n', { ctrlKey: true }), parsed, 'macos')).toBe(false);
  });

  it('matches Mod+N with Ctrl when OS is undetermined', () => {
    const parsed = parseShortcut('Mod+N');
    expect(matchShortcut(keyEvent('n', { ctrlKey: true }), parsed, undefined)).toBe(true);
  });

  it('matches bare Enter only with no modifiers', () => {
    const parsed = parseShortcut('Enter');
    expect(matchShortcut(keyEvent('enter'), parsed, 'macos')).toBe(true);
    expect(matchShortcut(keyEvent('enter', { metaKey: true }), parsed, 'macos')).toBe(false);
    expect(matchShortcut(keyEvent('enter', { shiftKey: true }), parsed, 'macos')).toBe(false);
  });

  it('matches Mod+Shift+P requiring both modifiers', () => {
    const parsed = parseShortcut('Mod+Shift+P');
    // Cmd+Shift+P on macOS
    expect(matchShortcut(keyEvent('p', { metaKey: true, shiftKey: true }), parsed, 'macos')).toBe(true);
    // Only Cmd, no Shift -> no match
    expect(matchShortcut(keyEvent('p', { metaKey: true }), parsed, 'macos')).toBe(false);
    // Shift but wrong primary modifier on Windows
    expect(matchShortcut(keyEvent('p', { metaKey: true, shiftKey: true }), parsed, 'windows')).toBe(false);
  });

  it('does not match when key differs', () => {
    const parsed = parseShortcut('Mod+K');
    expect(matchShortcut(keyEvent('j', { metaKey: true }), parsed, 'macos')).toBe(false);
  });

  it('does not match empty-key parsed shortcut', () => {
    const parsed = parseShortcut('');
    expect(matchShortcut(keyEvent('k', { metaKey: true }), parsed, 'macos')).toBe(false);
  });
});

describe('matchesShortcut (convenience)', () => {
  it('parses and matches in one call', () => {
    expect(matchesShortcut(keyEvent('k', { ctrlKey: true }), 'Mod+K', 'windows')).toBe(true);
    expect(matchesShortcut(keyEvent('k', { metaKey: true }), 'Mod+K', 'macos')).toBe(true);
    expect(matchesShortcut(keyEvent('enter'), 'Enter', 'linux')).toBe(true);
  });
});

describe('formatShortcut', () => {
  it('formats Mod+K with Cmd symbol on macOS', () => {
    const s = formatShortcut('Mod+K', 'macos');
    expect(s).toContain('\u2318'); // Cmd symbol
    expect(s).toContain('K');
    expect(s).not.toContain('+');
  });

  it('formats Mod+K with Ctrl on Windows', () => {
    const s = formatShortcut('Mod+K', 'windows');
    expect(s).toBe('Ctrl+K');
  });

  it('formats Mod+Shift+P on macOS', () => {
    const s = formatShortcut('Mod+Shift+P', 'macos');
    // Cmd + Shift + P, no separators
    expect(s).toBe('\u2318\u21E7P');
  });

  it('formats Mod+Shift+P on Windows', () => {
    expect(formatShortcut('Mod+Shift+P', 'windows')).toBe('Ctrl+Shift+P');
  });

  it('formats bare Enter', () => {
    expect(formatShortcut('Enter', 'macos')).toBe('\u21A9');
    expect(formatShortcut('Enter', 'windows')).toBe('Enter');
  });

  it('returns empty string for empty spec', () => {
    expect(formatShortcut('', 'macos')).toBe('');
  });

  it('uses Ctrl when OS is undetermined', () => {
    expect(formatShortcut('Mod+K', undefined)).toBe('Ctrl+K');
  });
});
