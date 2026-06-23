import { describe, it, expect } from 'vitest';
import { versionGreater, notesSince, RELEASE_NOTES, APP_VERSION } from '../version';

describe('versionGreater', () => {
  it('compares dotted numeric versions', () => {
    expect(versionGreater('0.8.3', '0.8.2')).toBe(true);   // feature bump (centesimal)
    expect(versionGreater('0.8.2.1', '0.8.2')).toBe(true); // fix bump (milésima, 4th part)
    expect(versionGreater('0.8.2', '0.8.2')).toBe(false);
    expect(versionGreater('0.8.1', '0.8.2')).toBe(false);
    expect(versionGreater('0.8.10', '0.8.9')).toBe(true);  // numeric, not lexical
  });
});

describe('notesSince', () => {
  it('returns nothing for a fresh install (null) or the current version', () => {
    expect(notesSince(null)).toEqual([]);
    expect(notesSince(APP_VERSION)).toEqual([]);
  });
  it('returns the notes newer than the last-seen version', () => {
    const since = notesSince('0.8.1');
    expect(since.map((n) => n.version)).toContain('0.8.2');
  });
  it('every release note version is present and well-formed', () => {
    for (const n of RELEASE_NOTES) {
      expect(n.version).toMatch(/^\d+\.\d+\.\d+(\.\d+)?$/);
      expect(n.highlights.length).toBeGreaterThan(0);
    }
  });
});
