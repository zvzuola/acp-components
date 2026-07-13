import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
} from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SplitCellsOutlined, CloseOutlined } from '@ant-design/icons';
import type { SessionId } from '@acp-components/core';
import { useAcpStore } from '../../hooks/useAcpStore';
import { useI18n } from '../../i18n';
import { ChatView } from '../chat-view/ChatView';
import styles from './session-panes.module.scss';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionPanesProps {
  /** Active session id from the store (driven by sidebar selection). */
  sessionId: SessionId | null;
  /** Override the file-open handler passed down to ChatView. */
  onNavigateFile?: (path: string, line?: number | null) => void;
  /** Extra ReactNode rendered in every pane header actions area. */
  headerExtras?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Split resize handle — multi-pane percentage-based drag.
//
// Unlike the 2-pane useResizable hook (pixel widths, left/right direction),
// this operates on an array of percentage widths and transfers width between
// the two adjacent panes on either side of the handle.
// ---------------------------------------------------------------------------

interface SplitHandleProps {
  index: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  widthsRef: React.RefObject<number[]>;
  onResize: (next: number[]) => void;
  ariaLabel: string;
}

function computeWidths(
  startWidths: number[],
  index: number,
  deltaPct: number,
  minPct: number,
): number[] {
  const next = [...startWidths];
  let left = startWidths[index] + deltaPct;
  let right = startWidths[index + 1] - deltaPct;
  if (left < minPct) {
    right -= minPct - left;
    left = minPct;
  }
  if (right < minPct) {
    left -= minPct - right;
    right = minPct;
  }
  next[index] = left;
  next[index + 1] = right;
  return next;
}

function SplitResizeHandle({
  index,
  containerRef,
  widthsRef,
  onResize,
  ariaLabel,
}: SplitHandleProps) {
  const [isResizing, setIsResizing] = useState(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();

      const startX = e.clientX;
      const containerEl = containerRef.current;
      const containerWidth = containerEl?.getBoundingClientRect().width ?? 1;
      const startWidths = [...widthsRef.current];
      const minPct = 15;

      setIsResizing(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.body.classList.add('acp-resizing');

      const handleMove = (ev: PointerEvent) => {
        const deltaPct = ((ev.clientX - startX) / containerWidth) * 100;
        onResize(computeWidths(startWidths, index, deltaPct, minPct));
      };

      const handleUp = () => {
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.body.classList.remove('acp-resizing');
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
      };

      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
    },
    [index, containerRef, widthsRef, onResize],
  );

  return (
    <div
      className={`${styles.acpSplitHandle}${isResizing ? ` ${styles.acpSplitHandleActive}` : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerDown={onPointerDown}
    >
      <span className={styles.acpSplitHandleLine} aria-hidden="true" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pane — a single chat column (unified for single-pane and multi-pane).
// ---------------------------------------------------------------------------

interface PaneProps {
  sessionId: SessionId;
  isActive: boolean;
  widthPct: number;
  onSplit: () => void;
  onClose: () => void;
  onFocus: () => void;
  onNavigateFile?: (path: string, line?: number | null) => void;
  extras?: React.ReactNode;
  canClose: boolean;
}

function Pane({
  sessionId,
  isActive,
  widthPct,
  onSplit,
  onClose,
  onFocus,
  onNavigateFile,
  extras,
  canClose,
}: PaneProps) {
  const { t } = useI18n();
  const sessionTitle = useAcpStore((s) => {
    for (const ws of s.workspaces.values()) {
      const meta = ws.sessions.get(sessionId);
      if (meta) return meta.title;
    }
    return null;
  });

  const cls = [
    styles.acpSplitPane,
    isActive ? styles.acpSplitPaneActive : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      style={{ flexGrow: widthPct, flexBasis: 0 }}
      onMouseDown={onFocus}
    >
      <div className={styles.acpSplitPaneHeader}>
        <span className={styles.acpSplitPaneTitle}>
          {sessionTitle || t('chat.title')}
        </span>
        <div className={styles.acpSplitPaneActions}>
          <button
            type="button"
            className={styles.acpSplitPaneBtn}
            onClick={(e) => { e.stopPropagation(); onSplit(); }}
            aria-label={t('splitView.split')}
            title={t('splitView.split')}
          >
            <SplitCellsOutlined />
          </button>
          {extras}
          {canClose && (
            <button
              type="button"
              className={styles.acpSplitPaneBtn}
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              aria-label={t('splitView.closePane')}
              title={t('splitView.closePane')}
            >
              <CloseOutlined />
            </button>
          )}
        </div>
      </div>
      <div className={styles.acpSplitPaneBody}>
        <ChatView
          sessionId={sessionId}
          onNavigateFile={onNavigateFile}
          showHeader={false}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionPanes
// ---------------------------------------------------------------------------

export function SessionPanes({
  sessionId,
  onNavigateFile,
  headerExtras,
}: SessionPanesProps) {
  const { t } = useI18n();
  const setActiveSession = useAcpStore((s) => s.setActiveSession);

  // Pane state — each entry is a SessionId. widths[i] is the flex-grow
  // percentage for panes[i]. They are kept in sync (same length).
  const [panes, setPanes] = useState<SessionId[]>(() =>
    sessionId ? [sessionId] : [],
  );
  const [activePane, setActivePane] = useState(0);
  const [widths, setWidths] = useState<number[]>([100]);

  // Refs for use inside event handlers / effects that must read latest state
  // without re-subscribing.
  const panesRef = useRef(panes);
  panesRef.current = panes;
  const activePaneRef = useRef(activePane);
  activePaneRef.current = activePane;
  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  const prevSessionIdRef = useRef<SessionId | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Route the store's activeSessionId to the active pane.
  useEffect(() => {
    if (sessionId === prevSessionIdRef.current) return;
    prevSessionIdRef.current = sessionId;
    if (!sessionId) return;

    setPanes((prev) => {
      if (prev.length === 0) return [sessionId];
      if (prev[activePaneRef.current] === sessionId) return prev;
      const idx = prev.indexOf(sessionId);
      if (idx >= 0) {
        setActivePane(idx);
        return prev;
      }
      const next = [...prev];
      next[activePaneRef.current] = sessionId;
      return next;
    });
  }, [sessionId]);

  // Prune panes whose sessions have been deleted from the store.
  const validSessionIds = useAcpStore(
    useShallow((s) => {
      const ids: SessionId[] = [];
      for (const ws of s.workspaces.values()) {
        for (const sid of ws.sessions.keys()) ids.push(sid);
      }
      return ids;
    }),
  );
  const sessionIdSet = useMemo(() => new Set(validSessionIds), [validSessionIds]);

  useEffect(() => {
    setPanes((prev) => {
      if (prev.length === 0) return prev;
      const survivor = prev.filter((sid) => sessionIdSet.has(sid));
      if (survivor.length === prev.length) return prev;

      setWidths((w) => {
        const next: number[] = [];
        let freed = 0;
        for (let i = 0; i < prev.length; i++) {
          if (sessionIdSet.has(prev[i])) {
            next.push(w[i] ?? 0);
          } else {
            freed += w[i] ?? 0;
          }
        }
        if (next.length === 0) return [100];
        next[0] += freed;
        return next;
      });

      let removedBefore = 0;
      for (let i = 0; i < activePaneRef.current && i < prev.length; i++) {
        if (!sessionIdSet.has(prev[i])) removedBefore++;
      }
      let nextActive = activePaneRef.current - removedBefore;
      if (nextActive >= survivor.length) {
        nextActive = Math.max(0, survivor.length - 1);
      }
      setActivePane(nextActive);

      return survivor;
    });
  }, [sessionIdSet]);

  // --- Actions ---

  const handleSplit = useCallback((idx?: number) => {
    const i = idx ?? activePaneRef.current;
    setPanes((prev) => {
      if (prev.length === 0) return prev;
      const sid = prev[i];
      const next = [...prev];
      next.splice(i + 1, 0, sid);
      return next;
    });
    setWidths((prev) => {
      const w = prev[i] ?? 50;
      const half = w / 2;
      const next = [...prev];
      next[i] = half;
      next.splice(i + 1, 0, half);
      return next;
    });
    setActivePane(i + 1);
  }, []);

  const handleClosePane = useCallback((idx: number) => {
    setPanes((prev) => {
      if (prev.length <= 1) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
    setWidths((prev) => {
      if (prev.length <= 1) return prev;
      const next = [...prev];
      const freed = next.splice(idx, 1)[0] ?? 0;
      const neighbor = Math.min(idx, next.length - 1);
      if (neighbor >= 0) next[neighbor] += freed;
      return next;
    });
    setActivePane((prev) => {
      const len = panesRef.current.length;
      if (len <= 1) return 0;
      if (prev >= len - 1) return Math.max(0, len - 2);
      return prev;
    });
  }, []);

  const focusPane = useCallback(
    (idx: number) => {
      setActivePane(idx);
      const sid = panesRef.current[idx];
      if (sid) setActiveSession(sid);
    },
    [setActiveSession],
  );

  // --- Render ---

  // No session selected: show the empty state.
  if (panes.length === 0) {
    return (
      <div className={styles.acpSplitView}>
        <div className={styles.acpSplitEmpty}>{t('chat.emptyState')}</div>
      </div>
    );
  }

  // Unified pane rendering — same path for 1 or N panes.
  return (
    <div
      className={styles.acpSplitView}
      ref={containerRef}
      role="application"
      aria-label={panes.length > 1 ? t('splitView.ariaLabel') : t('sessionView.ariaLabel')}
    >
      {panes.map((sid, i) => (
        <Fragment key={`${sid}-${i}`}>
          {i > 0 && (
            <SplitResizeHandle
              index={i - 1}
              containerRef={containerRef}
              widthsRef={widthsRef}
              onResize={setWidths}
              ariaLabel={t('splitView.resize')}
            />
          )}
          <Pane
            sessionId={sid}
            isActive={i === activePane}
            widthPct={widths[i] ?? 100 / panes.length}
            onSplit={() => handleSplit(i)}
            onClose={() => handleClosePane(i)}
            onFocus={() => focusPane(i)}
            onNavigateFile={onNavigateFile}
            extras={headerExtras}
            canClose={panes.length > 1}
          />
        </Fragment>
      ))}
    </div>
  );
}
