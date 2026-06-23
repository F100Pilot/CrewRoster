import { describe, it, expect } from 'vitest';
import { versionGreater, notesSince, RELEASE_NOTES, APP_VERSION } from '../version';

describe('versionGreater', () => {
  it('compares dotted numeric versions', () => {
    expect(versionGreater('0.9.0', '0.8.0')).toBe(true); // feature bump (decimal)
    expect(versionGreater('0.9.1', '0.9.0')).toBe(true); // fix bump (centesimal)
    expect(versionGreater('0.9.0', '0.9.0')).toBe(false);
    expect(versionGreater('0.8.0', '0.9.0')).toBe(false);
    expect(versionGreater('0.10.0', '0.9.0')).toBe(true); // numeric, not lexical
  });
});

describe('notesSince', () => {
  it('returns nothing for a fresh install (null) or the current version', () => {
    expect(notesSince(null)).toEqual([]);
    expect(notesSince(APP_VERSION)).toEqual([]);
  });
  it('returns the notes newer than the last-seen version', () => {
    const since = notesSince('0.8.0');
    expect(since.map((n) => n.version)).toContain('0.9.0');
  });
  it('every release note version is present and well-formed', () => {
    for (const n of RELEASE_NOTES) {
      expect(n.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(n.highlights.length).toBeGreaterThan(0);
    }
  });
});
