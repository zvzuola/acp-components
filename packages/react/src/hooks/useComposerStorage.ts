import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlatformStorage, SessionId } from '@acp-components/core';
import { usePlatform } from '../context/PlatformContext';

const DRAFTS_KEY = 'composer-drafts';
const HISTORY_KEY = 'composer-history';
const HISTORY_LIMIT = 50;
const SAVE_DEBOUNCE_MS = 500;

// Module-level caches shared across hook instances (drafts survive view
// switches, history survives session switches).
let draftsCache: Record<string, string> | null = null;
let historyCache: string[] | null = null;
let hydratePromise: Promise<void> | null = null;

function hydrate(storage: PlatformStorage): Promise<void> {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const [rawDrafts, rawHistory] = await Promise.all([
          storage.getItem(DRAFTS_KEY),
          storage.getItem(HISTORY_KEY),
        ]);
        // Merge: keep any cache entries already written by an early keystroke
        // that landed before hydration finished.
        const parsedDrafts: Record<string, string> = rawDrafts ? JSON.parse(rawDrafts) : {};
        const parsedHistory: string[] = rawHistory ? JSON.parse(rawHistory) : [];
        draftsCache = draftsCache ? { ...parsedDrafts, ...draftsCache } : parsedDrafts;
        historyCache = historyCache && historyCache.length > 0 ? historyCache : parsedHistory;
      } catch {
        draftsCache = {};
        historyCache = [];
      }
    })();
  }
  return hydratePromise;
}

/**
 * Per-session composer persistence: draft text + prompt history.
 *
 * - Drafts are keyed by sessionId and auto-saved to `platform.storage('composer')`.
 * - History keeps the last 50 sent prompts (oldest → newest) for ↑/↓ recall.
 */
export function useComposerStorage(sessionId: SessionId | null): {
  draft: string;
  setDraft: (value: string) => void;
  history: string[];
  pushHistory: (text: string) => void;
} {
  const { storage } = usePlatform();
  const composerStorage = useMemo(() => storage('composer'), [storage]);

  const [draft, setDraftState] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate once on mount.
  useEffect(() => {
    let cancelled = false;
    hydrate(composerStorage)
      .then(() => {
        if (cancelled) return;
        setHistory(historyCache ?? []);
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [composerStorage]);

  // When sessionId changes, load the cached draft (if any).
  useEffect(() => {
    if (!hydrated) return;
    const cached = sessionId ? (draftsCache?.[sessionId] ?? '') : '';
    setDraftState(cached);
  }, [sessionId, hydrated]);

  // Debounced persist for drafts.
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistDrafts = useCallback(
    (map: Record<string, string>) => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => {
        composerStorage.setItem(DRAFTS_KEY, JSON.stringify(map)).catch(() => {});
      }, SAVE_DEBOUNCE_MS);
    },
    [composerStorage],
  );

  const setDraft = useCallback(
    (value: string) => {
      setDraftState(value);
      if (!sessionId) return;
      const next = { ...(draftsCache ?? {}), [sessionId]: value };
      draftsCache = next;
      persistDrafts(next);
    },
    [sessionId, persistDrafts],
  );

  const pushHistory = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      setHistory((prev) => {
        const next = [...prev];
        // Skip duplicates at the tail.
        if (next.length > 0 && next[next.length - 1] === text) {
          // still return same ref if unchanged
          return prev;
        }
        next.push(text);
        if (next.length > HISTORY_LIMIT) next.shift();
        historyCache = next;
        composerStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [composerStorage],
  );

  return { draft, setDraft, history, pushHistory };
}