import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { acpStore } from '@acp-components/core';
import type { SessionId, SessionMeta, AcpClient } from '@acp-components/core';
import { SESSION_DRAG_MIME } from '../../constants';
import { AcpContext } from '../../context/AcpContext';
import type { AcpContextValue } from '../../context/AcpContext';
import { SessionPanes } from './SessionPanes';

// Stub ChatView: expose which session each pane is showing via a data attribute.
vi.mock('../chat-view/ChatView', () => ({
  ChatView: ({ sessionId }: { sessionId: SessionId }) => (
    <div data-testid="acp-pane-chat" data-session={sessionId} />
  ),
}));

// Mock only selectSession: the drop path's contract is "call selectSession on
// drop" (mirroring the click path in SessionList). Mocking it here keeps the
// real async loadSession chain out of this component test (whether it actually
// loads is covered in core sessions tests), so the assertion stays focused on
// the wiring -- that the dropped session's client is passed through. The spy is
// synchronous so it leaves no floating promise behind.
const { selectSessionSpy } = vi.hoisted(() => ({
  selectSessionSpy: vi.fn(() => { }),
}));
vi.mock('@acp-components/core', async (importActual) => {
  const actual = await importActual();
  return { ...actual, selectSession: selectSessionSpy };
});

// Minimal AcpClient stub: selectSession is mocked above, so the drop path never
// touches the real client. Cast satisfies the AcpClient type at compile time.
const mockClient = { __mock: true } as unknown as AcpClient;

const mockAcpContext: AcpContextValue = {
  getClient: () => mockClient,
  agents: [],
  addAgent: vi.fn(async () => { }),
  removeAgent: vi.fn(async () => { }),
  builtinAgentIds: new Set<string>(),
  isReady: true,
};

// Build a mock DataTransfer carrying `sid` under the session drag MIME. jsdom's
// real DragEvent would wrap/drop the payload, so we attach this object directly
// to the dispatched event (see dropAt).
function makeDataTransfer(sid: SessionId) {
  return {
    types: [SESSION_DRAG_MIME],
    getData: (mime: string) => (mime === SESSION_DRAG_MIME ? sid : ''),
    setData: () => { },
    dropEffect: 'none' as const,
    effectAllowed: 'all' as const,
  };
}

// Dispatch dragenter + dragover (commit the computed drop target) then drop
// (read it back and route to insert/replace). Each phase runs in its own act so
// the dropTargetRef is committed before the drop handler reads it.
function dropAt(el: HTMLElement, sid: SessionId, clientX: number) {
  const dt = makeDataTransfer(sid);
  const fire = (type: string) => {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clientX', { value: clientX, configurable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt, configurable: true });
    el.dispatchEvent(ev);
  };
  act(() => {
    fire('dragenter');
    fire('dragover');
  });
  act(() => {
    fire('drop');
  });
}

// Like dropAt but stops after dragover, leaving the drop overlay visible so a
// test can assert which drop zone tint rendered before the drop is committed.
function hoverAt(el: HTMLElement, sid: SessionId, clientX: number) {
  const dt = makeDataTransfer(sid);
  const fire = (type: string) => {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clientX', { value: clientX, configurable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt, configurable: true });
    el.dispatchEvent(ev);
  };
  act(() => {
    fire('dragenter');
    fire('dragover');
  });
}

// Reset the drag state so the component is not left mid-drag when the test
// ends (a deferred re-render otherwise runs after jsdom tears down `window`).
function leaveDrag(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new Event('dragleave', { bubbles: true, cancelable: true }));
  });
}

function seedStore(ids: SessionId[]) {
  const sessions = new Map<SessionId, SessionMeta>();
  for (const id of ids) {
    sessions.set(id, { id, title: id, cwd: '/ws', agentId: 'a', loaded: true });
  }
  const workspaces = new Map([
    ['/ws', { cwd: '/ws', sessions, sessionListCursors: new Map() }],
  ]);
  acpStore.setState({
    workspaces,
    activeSessionId: ids[0] ?? null,
    pendingAuth: null,
    agents: new Map(),
  });
}

// Fixed 1000px-wide container so computeDropTarget's gap/pane thresholds are
// deterministic. Mocked on the root div that holds containerRef.
function mockRect(el: HTMLElement) {
  el.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 1000,
      height: 600,
      right: 1000,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => { },
    }) as DOMRect;
}

function paneSessions(): string[] {
  return screen
    .getAllByTestId('acp-pane-chat')
    .map((el) => el.getAttribute('data-session'));
}

function mount(activeId: SessionId) {
  const { container } = render(
    <AcpContext.Provider value={mockAcpContext}>
      <SessionPanes sessionId={activeId} />
    </AcpContext.Provider>,
  );
  const root = container.firstElementChild as HTMLElement;
  mockRect(root);
  return root;
}

beforeEach(() => {
  seedStore(['s1', 's2', 's3', 's4', 's5']);
  selectSessionSpy.mockClear();
});

describe('SessionPanes drop targeting', () => {
  it('inserts a new pane after the active pane when dropped on its right half', () => {
    const root = mount('s1');
    // Single 1000px pane: x=995 is past the center (500), so the right half
    // inserts a new pane after it.
    dropAt(root, 's2', 995);
    expect(paneSessions()).toEqual(['s1', 's2']);
  });

  it('inserts a new pane before the active pane when dropped on its left half', () => {
    const root = mount('s1');
    // x=100 is left of the center (500), so the left half inserts before it.
    dropAt(root, 's2', 100);
    expect(paneSessions()).toEqual(['s2', 's1']);
  });

  it('focuses without rearranging when dropping an already-shown session', () => {
    const root = mount('s1');
    dropAt(root, 's2', 995); // append -> [s1, s2]
    // Dropping s2 again (left half of pane 0 -> insert before pane 0) would
    // duplicate it; instead it focuses s2's existing pane with no rearrange.
    dropAt(root, 's2', 100);
    expect(paneSessions()).toEqual(['s1', 's2']);
  });

  it('replaces the pane under the cursor when dropping at the pane cap', () => {
    const root = mount('s1');
    dropAt(root, 's2', 995); // -> [s1, s2]
    dropAt(root, 's3', 995); // -> [s1, s2, s3]
    dropAt(root, 's4', 995); // -> [s1, s2, s3, s4] (cap reached)
    // At the cap a drop replaces the pane under the cursor instead of
    // inserting. x=375 lands in the middle of pane 1 (s2): replace it with s5.
    dropAt(root, 's5', 375);
    expect(paneSessions()).toEqual(['s1', 's5', 's3', 's4']);
  });

  it('replaces the trailing pane when dropping past the last pane at the cap', () => {
    const root = mount('s1');
    dropAt(root, 's2', 995); // -> [s1, s2]
    dropAt(root, 's3', 995); // -> [s1, s2, s3]
    dropAt(root, 's4', 995); // -> [s1, s2, s3, s4] (cap reached)
    // At the cap the trailing right half can no longer insert; it replaces the
    // last pane instead.
    dropAt(root, 's5', 995);
    expect(paneSessions()).toEqual(['s1', 's2', 's3', 's5']);
  });

  it('tints only the hovered half of a pane while dragging below the cap', () => {
    const root = mount('s1');
    // Right half of the single pane -> an insert-after tint on the right half,
    // not a full-pane tint.
    hoverAt(root, 's2', 995);
    expect(root.querySelector('[data-acp-drop-zone="right"]')).not.toBeNull();
    expect(root.querySelector('[data-acp-drop-zone="full"]')).toBeNull();
    leaveDrag(root);
  });

  it('tints the whole pane when dragging at the pane cap', () => {
    const root = mount('s1');
    dropAt(root, 's2', 995); // -> [s1, s2]
    dropAt(root, 's3', 995); // -> [s1, s2, s3]
    dropAt(root, 's4', 995); // -> [s1, s2, s3, s4] (cap reached)
    // At the cap a drop replaces a pane, so the tint covers the whole pane
    // under the cursor instead of a half.
    hoverAt(root, 's5', 375);
    expect(root.querySelector('[data-acp-drop-zone="full"]')).not.toBeNull();
    expect(root.querySelector('[data-acp-drop-zone="left"]')).toBeNull();
    expect(root.querySelector('[data-acp-drop-zone="right"]')).toBeNull();
    leaveDrag(root);
  });

  it('loads the dropped session by calling selectSession with its client', () => {
    // The drop path must load a dropped session, mirroring the click path in
    // SessionList. selectSession sets the session active AND fetches its
    // history when meta.loaded is false; without it a listed-but-never-opened
    // session renders an empty chat (ChatView reads messages populated by
    // loadSession). Here we assert the drop calls selectSession(client, sid).
    const root = mount('s1');
    dropAt(root, 's2', 995);
    expect(selectSessionSpy).toHaveBeenCalledWith(mockClient, 's2');
  });
});
