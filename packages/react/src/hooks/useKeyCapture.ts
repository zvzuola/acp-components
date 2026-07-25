import { useCallback, useEffect, useRef, useState } from 'react';
import { parseShortcut, type PlatformOS } from '@acp-components/core';

// ---------------------------------------------------------------------------
// Keyboard shortcut capture: convert a live keydown into a cross-platform
// shortcut spec, and detect collisions against the currently bound set.
//
// Pure helpers (buildSpec / canonicalSpec) are exported so the settings panel
// can compare a recorded spec against a default and so tests can exercise the
// logic without a DOM. The hook wires one document-level keydown listener that
// is active only while `capturing` is true, stops after the first complete
// combo, and reports back via `onCapture`.
//
// Spec grammar matches core's `parseShortcut`: "Mod" is the OS primary
// modifier placeholder (Meta on macOS, Ctrl elsewhere), so a captured combo
// is stored cross-platform and re-resolves on every host.
// ---------------------------------------------------------------------------

/** Keys that never participate in a shortcut and should be swallowed silently. */
const IGNORE_KEYS = new Set([
  'tab',
  'capslock',
  'numlock',
  'contextmenu',
  'fn',
  'fnlock',
  'scrolllock',
]);

/** Pure modifier keys: pressing one alone is not a complete combo. */
const MODIFIER_KEYS = new Set([
  'control',
  'shift',
  'alt',
  'altgraph',
  'meta',
  'os',
  'command',
]);

/** Keys allowed without a modifier (function keys + navigation). */
function isFunctionKey(lower: string): boolean {
  if (/^f([1-9]|1[0-2])$/.test(lower)) return true;
  return [
    'enter',
    'backspace',
    'delete',
    'insert',
    'home',
    'end',
    'pageup',
    'pagedown',
    'arrowup',
    'arrowdown',
    'arrowleft',
    'arrowright',
  ].includes(lower);
}

/** Map a normalized key token to the readable form used in specs. */
function aliasKey(lower: string): string {
  const aliases: Record<string, string> = {
    ' ': 'Space',
    arrowup: 'Up',
    arrowdown: 'Down',
    arrowleft: 'Left',
    arrowright: 'Right',
    escape: 'Escape',
    enter: 'Enter',
    backspace: 'Backspace',
    delete: 'Delete',
    insert: 'Insert',
    home: 'Home',
    end: 'End',
    pageup: 'PageUp',
    pagedown: 'PageDown',
  };
  return aliases[lower] ?? lower;
}

/**
 * Build a shortcut spec from a keyboard event, or return `null` when the event
 * is incomplete (a bare modifier press, or a plain letter with no modifier).
 * Escape is handled by the caller (the hook), not here.
 *
 * "Mod" is emitted for the OS primary modifier so the stored spec is
 * cross-platform; literal Ctrl/Meta are emitted only when the *other* primary
 * is also held (rare, e.g. Mod+Ctrl+K on macOS).
 */
export function buildSpec(e: KeyboardEvent, os: PlatformOS): string | null {
  const key = e.key;
  if (!key) return null;
  const lower = key.toLowerCase();

  if (IGNORE_KEYS.has(lower)) return null;
  if (MODIFIER_KEYS.has(lower)) return null;

  const isSpecial = isFunctionKey(lower);
  const hasMod = e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;
  // Require a modifier for plain letters/digits; function keys are allowed bare.
  if (!isSpecial && !hasMod) return null;

  const usesMeta = os === 'macos';
  const primaryHeld = usesMeta ? e.metaKey : e.ctrlKey;

  const parts: string[] = [];
  if (primaryHeld) parts.push('Mod');
  // Emit the *other* primary modifier literally if it is also held (so
  // Mod+Ctrl on Windows or Mod+Meta on macOS round-trips correctly).
  if (usesMeta ? e.ctrlKey : e.metaKey) parts.push(usesMeta ? 'Ctrl' : 'Meta');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(aliasKey(lower));

  return parts.join('+');
}

/**
 * Canonical, OS-resolved form of a spec for collision detection. Resolves
 * "Mod" to the OS primary modifier literal, sorts modifiers, and lowercases
 * the key. Two specs collide (for this OS) iff their canonical forms are equal
 * - e.g. "Mod+K" and "Ctrl+K" collide on Windows, but "Mod+K" and
 * "Mod+Shift+K" do not (the latter is a distinct, more specific combo).
 */
export function canonicalSpec(spec: string, os: PlatformOS): string {
  const p = parseShortcut(spec);
  if (!p.key) return '';
  const isMeta = os === 'macos';
  const mods: string[] = [];
  if (p.ctrl || (p.mod && !isMeta)) mods.push('ctrl');
  if (p.meta || (p.mod && isMeta)) mods.push('meta');
  if (p.alt) mods.push('alt');
  if (p.shift) mods.push('shift');
  mods.sort();
  return [...mods, p.key].join('+');
}

export interface KeyCaptureResult {
  /** The recorded spec, or null when the user cancelled with Escape. */
  spec: string | null;
  /** Action id whose binding collides with the recorded spec, if any. */
  conflictWith: string | null;
}

export interface UseKeyCaptureOptions {
  /** OS, used to resolve "Mod" and detect collisions. */
  os: PlatformOS;
  /** id -> resolved spec of all other bindings, for conflict detection. */
  conflicts?: Record<string, string>;
  /** Exclude this id from conflict checks (the action being rebound). */
  excludeId?: string;
  /** Called once when a complete combo is captured or the user cancels. */
  onCapture?: (result: KeyCaptureResult) => void;
}

/**
 * Imperative key-capture controller. `start()` begins listening for the next
 * complete key combo; `cancel()` aborts. While capturing, all keydown events
 * are consumed (preventDefault + stopPropagation) so they never reach the app.
 */
export function useKeyCapture(opts: UseKeyCaptureOptions): {
  capturing: boolean;
  start: () => void;
  cancel: () => void;
} {
  const [capturing, setCapturing] = useState(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const start = useCallback(() => setCapturing(true), []);
  const cancel = useCallback(() => setCapturing(false), []);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      // Swallow everything while recording so the app never reacts to the
      // keys being pressed as part of a combo.
      e.preventDefault();
      e.stopPropagation();

      const o = optsRef.current;
      if (e.key === 'Escape') {
        setCapturing(false);
        o.onCapture?.({ spec: null, conflictWith: null });
        return;
      }

      const spec = buildSpec(e, o.os);
      if (spec === null) return; // incomplete (bare modifier / plain letter)

      let conflictWith: string | null = null;
      const canon = canonicalSpec(spec, o.os);
      for (const [id, otherSpec] of Object.entries(o.conflicts ?? {})) {
        if (id === o.excludeId) continue;
        if (otherSpec && canon === canonicalSpec(otherSpec, o.os)) {
          conflictWith = id;
          break;
        }
      }
      setCapturing(false);
      o.onCapture?.({ spec, conflictWith });
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [capturing]);

  return { capturing, start, cancel };
}
