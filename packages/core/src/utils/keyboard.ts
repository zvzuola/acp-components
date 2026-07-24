import type { PlatformOS } from '../types';

// ---------------------------------------------------------------------------
// Cross-platform keyboard shortcut parsing, matching, and formatting.
//
// Framework-agnostic pure utilities. The React layer (useHotkey / useActions)
// consumes these via usePlatform() to resolve the OS-specific primary modifier
// ("Mod" -> Meta on macOS, Ctrl on Windows/Linux), so shortcut specs are written
// once and work on every host.
//
// Spec grammar (case-insensitive, "+"-separated):
//   "Mod+N"        primary modifier + N
//   "Mod+Shift+P"  primary modifier + Shift + P
//   "Ctrl+K"       literal Ctrl (use "Mod" for cross-platform)
//   "Meta+K"       literal Cmd/Meta
//   "Alt+K"        literal Alt/Option
//   "Enter"        bare key, no modifiers
//   "Shift+/"      shift + slash
//
// "Mod" is a *placeholder* token, not a literal key. It resolves per-OS:
//   macOS      -> Meta  (Cmd / cmd-key)
//   windows    -> Ctrl
//   linux      -> Ctrl
//   undefined  -> Ctrl  (safest default; web without OS detection)
// ---------------------------------------------------------------------------

/** Structural event shape - matches DOM KeyboardEvent and React.KeyboardEvent. */
export interface ShortcutKeyEvent {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  key: string;
}

export interface ParsedShortcut {
  /** Literal Alt/Option modifier required. */
  alt: boolean;
  /** Literal Ctrl modifier required. */
  ctrl: boolean;
  /** Literal Meta/Cmd modifier required. */
  meta: boolean;
  /** Literal Shift modifier required. */
  shift: boolean;
  /**
   * Whether the spec contains the "Mod" placeholder. When true, matchShortcut
   * accepts the event's primary modifier (Meta on macOS, Ctrl elsewhere) in
   * addition to any literal ctrl/meta flags set above.
   */
  mod: boolean;
  /** Normalized key, lowercase (e.g. "k", "enter", "f1", " "). */
  key: string;
}

/** The OS-specific primary modifier: Meta on macOS, Ctrl elsewhere. */
export function primaryModifier(os: PlatformOS): 'Meta' | 'Ctrl' {
  return os === 'macos' ? 'Meta' : 'Ctrl';
}

/** Whether the OS uses Meta (Cmd) as its primary modifier. */
export function usesMeta(os: PlatformOS): boolean {
  return os === 'macos';
}

/**
 * Parse a shortcut spec string into a structured form. Tokens are split on
 * "+", each token is matched case-insensitively against the known modifiers
 * and a key. The final token is always the key; modifier order is free.
 *
 * Returns a ParsedShortcut with empty key if the spec is empty or has no key
 * token (e.g. "Mod+"). Callers should avoid matching such results.
 */
export function parseShortcut(spec: string): ParsedShortcut {
  const result: ParsedShortcut = {
    alt: false,
    ctrl: false,
    meta: false,
    shift: false,
    mod: false,
    key: '',
  };

  const trimmed = spec.trim();
  if (!trimmed) return result;

 const parts = trimmed.split('+').map((s) => s.trim()).filter((s) => s.length > 0);
 if (parts.length === 0) return result;

  // Classify each token: modifier tokens set their flags; the last
  // non-modifier token becomes the key. If every token is a modifier
  // (e.g. "Mod+Shift+"), key stays empty and the shortcut matches nothing.
  const MODIFIER_NAMES = new Set([
    'mod', 'cmdorctrl', 'cmd',
    'ctrl', 'control',
    'meta', 'command', 'super', 'win',
    'alt', 'option', 'opt',
    'shift',
  ]);

 for (let i = 0; i < parts.length; i++) {
   const mod = parts[i].toLowerCase();
    if (!MODIFIER_NAMES.has(mod)) {
      // Non-modifier token: use as the key (last one wins).
      result.key = normalizeKey(parts[i]);
      continue;
    }
    switch (mod) {
      case 'mod':
      case 'cmdorctrl': // Tauri-compatible alias
      case 'cmd':
        result.mod = true;
        break;
      case 'ctrl':
      case 'control':
        result.ctrl = true;
        break;
      case 'meta':
      case 'command':
      case 'super':
      case 'win':
        result.meta = true;
        break;
      case 'alt':
      case 'option':
      case 'opt':
        result.alt = true;
        break;
      case 'shift':
        result.shift = true;
        break;
    }
  }

  return result;
}

/**
 * Does a keyboard event match a parsed shortcut on the given OS?
 *
 * For specs containing "Mod", the primary modifier (Meta on macOS, Ctrl
 * elsewhere) is accepted. Literal Ctrl/Meta flags in the parsed shortcut
 * are checked against the event's corresponding properties. Bare keys
 * (no modifiers) match on key alone, rejecting if a primary modifier is held.
 */
export function matchShortcut(
  e: ShortcutKeyEvent,
  parsed: ParsedShortcut,
  os: PlatformOS,
): boolean {
  if (!parsed.key) return false;

  if (e.key.toLowerCase() !== parsed.key) return false;

  const isMeta = usesMeta(os);

  // --- Modifier checks ---
  // "Mod" placeholder: accept the OS primary modifier.
  if (parsed.mod) {
    if (isMeta ? !e.metaKey : !e.ctrlKey) return false;
  }

  // Literal ctrl/meta/alt/shift: event must have the corresponding key.
  // On macOS, "Mod" already covers Ctrl-as-primary, so a spec like
  // "Mod+Ctrl+K" requires BOTH Meta and Ctrl - unusual but valid.
  if (parsed.ctrl && !e.ctrlKey) return false;
  if (parsed.meta && !e.metaKey) return false;
  if (parsed.alt && !e.altKey) return false;
  if (parsed.shift && !e.shiftKey) return false;

  // When no modifiers are in the spec (bare key), reject if any modifier
  // is actively held - otherwise bare "Enter" would fire on Cmd+Enter.
  const hasNoModifiers = !parsed.mod && !parsed.ctrl && !parsed.meta && !parsed.alt && !parsed.shift;
  if (hasNoModifiers) {
    if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return false;
  }

  return true;
}

/** Convenience: parse + match in one call. */
export function matchesShortcut(
  e: ShortcutKeyEvent,
  spec: string,
  os: PlatformOS,
): boolean {
  return matchShortcut(e, parseShortcut(spec), os);
}

// ---------------------------------------------------------------------------
// Display formatting - produces OS-appropriate human-readable strings.
// ---------------------------------------------------------------------------

const MOD_SYMBOLS = {
  macos: { meta: '\u2318', ctrl: '\u2303', alt: '\u2325', shift: '\u21E7' },
  default: { meta: 'Meta', ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift' },
} as const;

/** Format a shortcut spec for display, using OS-appropriate symbols. */
export function formatShortcut(spec: string, os: PlatformOS): string {
  const parsed = parseShortcut(spec);
  if (!parsed.key) return '';

 const syms = os === 'macos' ? MOD_SYMBOLS.macos : MOD_SYMBOLS.default;
 const sep = os === 'macos' ? '' : '+';
 const parts: string[] = [];

  // "Mod" resolves to the OS primary modifier: Meta symbol on macOS,
  // Ctrl symbol on Windows/Linux/undefined. This is the *display* symbol,
  // distinct from literal meta/ctrl flags in the parsed shortcut.
  if (parsed.mod) {
    parts.push(usesMeta(os) ? syms.meta : syms.ctrl);
  }
  if (parsed.ctrl) parts.push(syms.ctrl);
  if (parsed.alt) parts.push(syms.alt);
  if (parsed.shift) parts.push(syms.shift);
  parts.push(displayKey(parsed.key, os));

  return parts.join(sep);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Normalize a key token to the canonical lowercase form used for matching. */
function normalizeKey(token: string): string {
  const lower = token.toLowerCase();

  // Map common aliases to canonical KeyboardEvent.key values.
  const aliases: Record<string, string> = {
    esc: 'escape',
    return: 'enter',
    ret: 'enter',
    cr: 'enter',
    del: 'delete',
    backspace: 'backspace',
    bs: 'backspace',
    tab: 'tab',
    space: ' ',
    sp: ' ',
    ins: 'insert',
    pgup: 'pageup',
    pgdn: 'pagedown',
    up: 'arrowup',
    down: 'arrowdown',
    left: 'arrowleft',
    right: 'arrowright',
    plus: '+',
    minus: '-',
    comma: ',',
    period: '.',
  };

  return aliases[lower] ?? lower;
}

/** Convert a normalized key to its display form for formatShortcut. */
function displayKey(key: string, os: PlatformOS): string {
  const lower = key.toLowerCase();

  // Special keys get readable labels on all platforms.
  const labels: Record<string, string> = {
    enter: os === 'macos' ? '\u21A9' : 'Enter',
    escape: 'Esc',
    backspace: os === 'macos' ? '\u232B' : 'Backspace',
    tab: os === 'macos' ? '\u21E5' : 'Tab',
    ' ': 'Space',
    arrowup: '\u2191',
    arrowdown: '\u2193',
    arrowleft: '\u2190',
    arrowright: '\u2192',
  };

  if (labels[lower]) return labels[lower];

  // Single letters/numbers: uppercase the first char for readability.
  if (lower.length === 1) {
    return lower.toUpperCase();
  }

  // F-keys and other named keys: uppercase.
  return lower.toUpperCase();
}
