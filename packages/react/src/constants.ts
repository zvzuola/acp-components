// ---------------------------------------------------------------------------
// Shared cross-component constants.
// ---------------------------------------------------------------------------

/**
 * MIME type carrying a session id during native HTML5 drag-and-drop from the
 * sidebar's SessionList onto the SessionPanes split view. Lives in a shared
 * module so the drag source (SessionItem) and the drop target (SessionPanes)
 * always agree on the payload type.
 */
export const SESSION_DRAG_MIME = 'application/x-acp-session';
