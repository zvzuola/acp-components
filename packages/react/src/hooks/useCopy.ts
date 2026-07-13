import { useCallback, useEffect, useState, useContext } from 'react';
import { PlatformContext } from '../context/PlatformContext';

export interface UseCopyReturn {
  /** Whether text was just copied (auto-resets after `resetMs`). */
  copied: boolean;
  /** Copy text to the clipboard. Resolves the platform slice first, then
   *  falls back to the browser API, then to a legacy `execCommand` textarea. */
  copy: (text: string) => Promise<void>;
}

/**
 * Shared clipboard-copy hook. Uses the host `Platform.clipboard` slice when
 * available (so desktop hosts can back it with a native clipboard), otherwise
 * falls back to `navigator.clipboard` and finally a legacy `execCommand` path
 * for environments without the async clipboard API. Owns the 2s "copied" reset
 * so callers render a transient check affordance without re-implementing it.
 */
export function useCopy(resetMs = 2000): UseCopyReturn {
  const platform = useContext(PlatformContext);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), resetMs);
    return () => clearTimeout(timer);
  }, [copied, resetMs]);

  const copy = useCallback(
    async (text: string) => {
      try {
        if (platform?.clipboard) {
          await platform.clipboard.writeText(text);
        } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(text);
        } else {
          legacyExecCopy(text);
        }
        setCopied(true);
      } catch {
        // Clipboard write failed; leave `copied` false so the icon does not
        // flash a false-positive check. Silently ignored per platform contract.
      }
    },
    [platform],
  );

  return { copied, copy };
}

/** Last-resort copy for non-async environments (e.g. older webviews). */
function legacyExecCopy(text: string): void {
  if (typeof document === 'undefined') return;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } catch {
    // ignore - no clipboard available at all
  } finally {
    document.body.removeChild(ta);
  }
}
