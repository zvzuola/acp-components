import type { ContentBlock } from '../types';

/**
 * Whether a content block should be rendered in the UI.
 *
 * ACP `annotations.audience` declares the intended recipients of a block:
 * - no annotations / no audience → visible to everyone
 * - audience containing 'user' → visible
 * - audience without 'user' (e.g. assistant-only) → hidden from the UI
 */
export function isUserVisibleContent(block: ContentBlock): boolean {
  const audience = block.annotations?.audience;
  if (!audience || audience.length === 0) return true;
  return audience.includes('user');
}