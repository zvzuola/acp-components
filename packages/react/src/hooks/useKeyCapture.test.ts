import { describe, it, expect } from 'vitest';
import { buildSpec, canonicalSpec } from './useKeyCapture';

// Minimal KeyboardEvent-like: only the fields buildSpec/canonicalSpec read.
function key(
  key: string,
  mods: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {},
): KeyboardEvent {
  return {
    key,
    ctrlKey: !!mods.ctrlKey,
    metaKey: !!mods.metaKey,
    shiftKey: !!mods.shiftKey,
    altKey: !!mods.altKey,
    preventDefault() {},
    stopPropagation() {},
  } as unknown as KeyboardEvent;
}

describe('buildSpec', () => {
  it('emits Mod for the OS primary modifier (Windows = Ctrl)', () => {
    expect(buildSpec(key('k', { ctrlKey: true }), 'windows')).toBe('Mod+k');
  });

  it('emits Mod for the OS primary modifier (macOS = Meta)', () => {
    expect(buildSpec(key('k', { metaKey: true }), 'macos')).toBe('Mod+k');
  });

  it('preserves Shift and Alt', () => {
    expect(buildSpec(key('k', { ctrlKey: true, shiftKey: true }), 'windows')).toBe(
      'Mod+Shift+k',
    );
    expect(buildSpec(key('k', { ctrlKey: true, altKey: true }), 'windows')).toBe('Mod+Alt+k');
  });

  it('emits the other primary modifier literally when both are held (macOS)', () => {
    expect(buildSpec(key('k', { metaKey: true, ctrlKey: true }), 'macos')).toBe('Mod+Ctrl+k');
  });

  it('rejects a bare letter with no modifier', () => {
    expect(buildSpec(key('a'), 'windows')).toBeNull();
  });

  it('ignores pure modifier presses', () => {
    expect(buildSpec(key('Control'), 'windows')).toBeNull();
    expect(buildSpec(key('Meta'), 'macos')).toBeNull();
    expect(buildSpec(key('Shift'), 'windows')).toBeNull();
  });

  it('ignores Tab / CapsLock even with modifiers', () => {
    expect(buildSpec(key('Tab', { ctrlKey: true }), 'windows')).toBeNull();
    expect(buildSpec(key('CapsLock', { ctrlKey: true }), 'windows')).toBeNull();
  });

  it('allows function keys bare (Enter, F5, arrows, space)', () => {
    expect(buildSpec(key('Enter'), 'windows')).toBe('Enter');
    expect(buildSpec(key('F5'), 'windows')).toBe('f5');
    expect(buildSpec(key('ArrowUp'), 'windows')).toBe('Up');
    // Space requires a modifier (it is a bare letter-class key in practice).
    expect(buildSpec(key(' '), 'windows')).toBeNull();
    expect(buildSpec(key(' ', { ctrlKey: true }), 'windows')).toBe('Mod+Space');
  });
});

describe('canonicalSpec (collision detection)', () => {
  it('resolves Mod to the OS primary modifier literal', () => {
    expect(canonicalSpec('Mod+K', 'windows')).toBe('ctrl+k');
    expect(canonicalSpec('Mod+K', 'macos')).toBe('meta+k');
  });

  it('treats Mod+K and Ctrl+K as colliding on Windows', () => {
    expect(canonicalSpec('Mod+K', 'windows')).toBe(canonicalSpec('Ctrl+K', 'windows'));
  });

  it('treats Mod+K and Meta+K as colliding on macOS', () => {
    expect(canonicalSpec('Mod+K', 'macos')).toBe(canonicalSpec('Meta+K', 'macos'));
  });

  it('does NOT treat Mod+K and Mod+Shift+K as colliding (distinct combos)', () => {
    expect(canonicalSpec('Mod+K', 'windows')).not.toBe(
      canonicalSpec('Mod+Shift+K', 'windows'),
    );
  });

  it('does NOT treat a bare key and its modified variant as colliding', () => {
    expect(canonicalSpec('Enter', 'windows')).not.toBe(
      canonicalSpec('Mod+Enter', 'windows'),
    );
  });

  it('returns empty string for an empty / invalid spec', () => {
    expect(canonicalSpec('', 'windows')).toBe('');
    expect(canonicalSpec('Mod+', 'windows')).toBe('');
  });
});
