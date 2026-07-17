import { describe, it, expect } from 'vitest';
import { isUserVisibleContent } from './content';
import type { ContentBlock } from '../types';

function textBlock(annotations: ContentBlock['annotations']): ContentBlock {
  return { type: 'text', text: 'hello', _meta: null, annotations };
}

describe('isUserVisibleContent', () => {
  it('returns true when annotations are absent', () => {
    expect(isUserVisibleContent(textBlock(undefined))).toBe(true);
  });

  it('returns true when annotations is null', () => {
    expect(isUserVisibleContent(textBlock(null))).toBe(true);
  });

  it('returns true when audience is null', () => {
    expect(isUserVisibleContent(textBlock({ audience: null }))).toBe(true);
  });

  it('returns true when audience is an empty array', () => {
    expect(isUserVisibleContent(textBlock({ audience: [] }))).toBe(true);
  });

  it('returns true when audience includes user', () => {
    expect(isUserVisibleContent(textBlock({ audience: ['user'] }))).toBe(true);
  });

  it('returns true when audience includes both user and assistant', () => {
    expect(isUserVisibleContent(textBlock({ audience: ['user', 'assistant'] }))).toBe(true);
  });

  it('returns false when audience is assistant-only', () => {
    expect(isUserVisibleContent(textBlock({ audience: ['assistant'] }))).toBe(false);
  });
});