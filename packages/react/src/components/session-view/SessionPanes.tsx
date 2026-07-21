import React, {
  memo,
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
import { useSessions } from '../../hooks/useSessions';
import { useI18n } from '../../i18n';
import { ChatView } from '../chat-view/ChatView';
import styles from './session-panes.module.scss';
import { SESSION_DRAG_MIME } from '../../constants';

// Maximum number of side-by-side panes. Beyond this the chat columns become
// too narrow to read; dragging or splitting at the cap swaps the active pane
// instead of adding a new column.
const MAX_PANES = 4;

// Drop target computed from the cursor position during a session drag:
// - kind 'gap'  -> insert a new pane at this index; paneIndex/side record
//   which pane and which half the cursor is over so the render layer can
//   tint that half as a directional cue.
// - kind 'pane' -> replace the session in this pane (only at the pane cap,
//   where there is no room to insert).
type DropTarget =
  | { kind: 'gap'; index: number; paneIndex: number; side: 'left' | 'right'; x: number }
  | { kind: 'pane'; index: number; x: number };

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

// True when two drop targets are visually identical (same kind, index, and
// for gaps the same pane half). Used to avoid setState churn on dragover; it
// must compare paneIndex/side too, because the same gap index can be reached
// from the right half of one pane or the left half of the next.
function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'pane' && b.kind === 'pane') return a.index === b.index;
  if (a.kind === 'gap' && b.kind === 'gap') {
    return a.index === b.index && a.paneIndex === b.paneIndex && a.side === b.side;
  }
  return false;
}

// Compute the drop target from the drag cursor X position. While the pane
// count is below the cap, dropping over a pane inserts a new pane beside it:
// the cursor's half (left/right of the pane center) decides whether the new
// pane is inserted before or after it, so the user never has to aim for an
// edge. At the pane cap there is no room to insert, so the drop instead
// targets the pane under the cursor for replacement. Returns the pixel
// position so the render layer can draw an insertion bar without recomputing.
function computeDropTarget(
  e: React.DragEvent,
  panes: SessionId[],
  widths: number[],
  container: HTMLDivElement | null,
): DropTarget | null {
  if (!container || panes.length === 0) return null;
  const rect = container.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const total = widths.reduce((a, b) => a + b, 0) || 100;
  // Pixel position of the right edge of each pane.
  const edges: number[] = [];
  let acc = 0;
  for (let i = 0; i < panes.length; i++) {
    acc += (widths[i] / total) * rect.width;
    edges.push(acc);
  }
  // At the pane cap a drop must replace a pane, never insert. Target the pane
  // the cursor is over (clamped to the last pane).
  if (panes.length >= MAX_PANES) {
    for (let i = 0; i < edges.length; i++) {
      if (x <= edges[i]) return { kind: 'pane', index: i, x: edges[i] };
    }
    return { kind: 'pane', index: panes.length - 1, x: rect.width };
  }
  // Below the cap, splitting is decided by which half of the pane the cursor
  // is in. Left half -> insert before (gap i, bar at the pane's left edge);
  // right half -> insert after (gap i+1, bar at the pane's right edge). At a
  // pane boundary the right half of one pane and the left half of the next
  // both resolve to the same gap, so there is no dead band between panes.
  for (let i = 0; i < edges.length; i++) {
    if (x <= edges[i]) {
      const leftEdge = i === 0 ? 0 : edges[i - 1];
      const center = (leftEdge + edges[i]) / 2;
      const side: 'left' | 'right' = x < center ? 'left' : 'right';
      return {
        kind: 'gap',
        index: side === 'left' ? i : i + 1,
        paneIndex: i,
        side,
        x: side === 'left' ? leftEdge : edges[i],
      };
    }
  }
  // Cursor is past the last pane's right edge (e.g. trailing padding): append.
  return {
    kind: 'gap',
    index: panes.length,
    paneIndex: panes.length - 1,
    side: 'right',
    x: rect.width,
  };
}

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
  index: number;
  isActive: boolean;
  widthPct: number;
  onSplit: (index: number) => void;
  canSplit: boolean;
  onClose: (index: number) => void;
  onFocus: (index: number) => void;
  onNavigateFile?: (path: string, line?: number | null) => void;
  extras?: React.ReactNode;
  canClose: boolean;
  isDropTarget: boolean;
  // 'left'/'right' when a gap drop tints this pane's corresponding half as a
  // directional cue; null otherwise (no gap target over this pane).
  dropSide?: 'left' | 'right' | null;
}

const Pane = memo(function Pane({
  sessionId,
  index,
  isActive,
  widthPct,
  onSplit,
  canSplit,
  onClose,
  onFocus,
  onNavigateFile,
  extras,
  canClose,
  isDropTarget,
  dropSide,
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
    isDropTarget ? styles.acpSplitPaneDropTarget : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Pick the drop-zone modifier: a half tint (left/right) when a gap drop
  // inserts beside this pane, or a full-pane tint when a replace drop (at the
  // cap) targets this pane. The two are mutually exclusive.
  const dropZoneClass = isDropTarget
    ? styles.acpSplitPaneDropZoneFull
    : dropSide === 'left'
      ? styles.acpSplitPaneDropZoneLeft
      : dropSide === 'right'
        ? styles.acpSplitPaneDropZoneRight
        : null;

  return (
    <div
      className={cls}
      style={{ flexGrow: widthPct, flexBasis: 0 }}
      onMouseDown={() => onFocus(index)}
    >
      <div className={styles.acpSplitPaneHeader}>
        <span className={styles.acpSplitPaneTitle}>
          {sessionTitle || t('chat.title')}
        </span>
        <div className={styles.acpSplitPaneActions}>
          <button
            type="button"
            className={styles.acpSplitPaneBtn}
            disabled={!canSplit}
            onClick={(e) => { e.stopPropagation(); onSplit(index); }}
            aria-label={t('splitView.split')}
            title={canSplit ? t('splitView.split') : t('splitView.maxPanes')}
          >
            <SplitCellsOutlined />
          </button>
          {extras}
          {canClose && (
            <button
              type="button"
              className={styles.acpSplitPaneBtn}
              onClick={(e) => { e.stopPropagation(); onClose(index); }}
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
      {dropZoneClass && (
        <div
          className={`${styles.acpSplitPaneDropZone} ${dropZoneClass}`}
          data-acp-drop-zone={isDropTarget ? 'full' : dropSide ?? undefined}
          aria-hidden="true"
        />
      )}
    </div>
  );
});

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
  const { selectSession } = useSessions();

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
    // Respect the pane cap: the split button is disabled at the cap, but
    // guard here too in case split is triggered another way.
    if (panesRef.current.length >= MAX_PANES) return;
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

  // --- Drag-and-drop: drop a session dragged from the sidebar (SessionList)
  // onto the split view to add it as a new pane. A depth counter distinguishes
  // leaving the container from moving between its children (dragenter/leave
  // fire in pairs as the cursor crosses element boundaries). ---
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  dropTargetRef.current = dropTarget;

  // Replace the session in pane `index` with `sid`. If `sid` is already shown
  // in a different pane, the two sessions swap places (no duplicates).
  const replacePane = useCallback(
    (index: number, sid: SessionId) => {
      const current = panesRef.current;
      if (current[index] === sid) {
        setActivePane(index);
        return;
      }
      const existing = current.indexOf(sid);
      if (existing >= 0) {
        const swapped = [...current];
        swapped[index] = sid;
        swapped[existing] = current[index];
        setPanes(swapped);
        setActivePane(index);
        return;
      }
      const next = [...current];
      next[index] = sid;
      setPanes(next);
      setActivePane(index);
    },
    [],
  );

  // Insert a new pane at `index` holding `sid`. If the session is already
  // visible, focus its pane instead of duplicating. At the pane cap, degrade
  // to replacing the pane at `index` (clamped) so a drop always does something.
  // Declared after replacePane so it can depend on it without a temporal dead
  // zone reference.
  const insertAt = useCallback(
    (index: number, sid: SessionId) => {
      const current = panesRef.current;
      const existing = current.indexOf(sid);
      if (existing >= 0) {
        setActivePane(existing);
        return;
      }
      const at = Math.max(0, Math.min(index, current.length));
      if (current.length >= MAX_PANES) {
        replacePane(Math.min(at, current.length - 1), sid);
        return;
      }
      const next = [...current.slice(0, at), sid, ...current.slice(at)];
      setPanes(next);
      // Redistribute widths proportionally; the new pane gets an equal share
      // so existing panes keep their relative proportions.
      setWidths((prev) => {
        if (next.length === 1) return [100];
        const total = prev.reduce((a, b) => a + b, 0) || 100;
        const newSlice = 100 / (prev.length + 1);
        const remaining = 100 - newSlice;
        const scaled = prev.map((w) => (w / total) * remaining);
        scaled.splice(at, 0, newSlice);
        return scaled;
      });
      setActivePane(at);
    },
    [replacePane],
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(SESSION_DRAG_MIME)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(SESSION_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const next = computeDropTarget(e, panesRef.current, widthsRef.current, containerRef.current);
    setDropTarget((prev) =>
      sameTarget(prev, next) ? prev : next,
    );
  }, []);

  const handleDragLeave = useCallback(() => {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragOver(false);
      setDropTarget(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDragOver(false);
      const sid = e.dataTransfer.getData(SESSION_DRAG_MIME) as SessionId;
      if (!sid || !sessionIdSet.has(sid)) return;
      const target = dropTargetRef.current;
      setDropTarget(null);
      if (!target) {
        insertAt(panesRef.current.length, sid);
      } else if (target.kind === 'gap') {
        insertAt(target.index, sid);
      } else {
        replacePane(target.index, sid);
      }
      // Reuse the sidebar's selectSession path: it sets the session active
      // and fetches its history when not yet loaded.
      void selectSession(sid);
    },
    [sessionIdSet, insertAt, replacePane, selectSession],
  );

  // --- Render ---

  // No session selected: show the empty state.
  if (panes.length === 0) {
    return (
      <div
        className={styles.acpSplitView}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className={styles.acpSplitEmpty}>{t('chat.emptyState')}</div>
        {isDragOver && (
          <div className={styles.acpSplitDropOverlay} aria-hidden="true">
            <span className={styles.acpSplitDropOverlayText}>{t('splitView.dropToAdd')}</span>
          </div>
        )}
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
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {panes.map((sid, i) => (
        <Fragment key={sid}>
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
            index={i}
            isActive={i === activePane}
            widthPct={widths[i] ?? 100 / panes.length}
            onSplit={handleSplit}
            canSplit={panes.length < MAX_PANES}
            onClose={handleClosePane}
            onFocus={focusPane}
            onNavigateFile={onNavigateFile}
            extras={headerExtras}
            canClose={panes.length > 1}
            isDropTarget={isDragOver && dropTarget?.kind === 'pane' && dropTarget.index === i}
            dropSide={
              isDragOver && dropTarget?.kind === 'gap' && dropTarget.paneIndex === i
                ? dropTarget.side
                : null
            }
          />
        </Fragment>
      ))}
      {isDragOver && dropTarget?.kind === 'gap' && (
        <div
          className={styles.acpSplitDropInsert}
          style={{ left: dropTarget?.x ?? 0 }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
