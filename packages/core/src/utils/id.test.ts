import { describe, it, expect } from 'vitest';
import { generateId } from './id';

describe('generateId', () => {
  it('prefixes the id with the given prefix', () => {
    expect(generateId('msg')).toMatch(/^msg_/);
    expect(generateId('user')).toMatch(/^user_/);
  });

  it('returns unique ids across consecutive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId('tc')));
    expect(ids.size).toBe(100);
  });

  it('embeds an incrementing counter so later ids sort after earlier ones', () => {
    const a = generateId('x');
    const b = generateId('x');
    // The counter suffix is strictly increasing — same-millisecond calls still differ.
    expect(b > a).toBe(true);
  });

  it('contains the timestamp segment', () => {
    const id = generateId('plan');
    // `<prefix>_<timestamp>_<counter>` — three underscore-separated segments.
    const segments = id.split('_');
    expect(segments[0]).toBe('plan');
    expect(segments.length).toBeGreaterThanOrEqual(3);
    expect(Number.isFinite(Number(segments[1]))).toBe(true);
  });
});
