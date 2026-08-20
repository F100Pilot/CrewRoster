import { describe, expect, it } from 'vitest';
import { defaultBeginDate, SYNC_LOOKBACK_DAYS } from '../domain/rosterWindow';

// A download that begins "today" can never correct a sector already flown: CrewLink only
// rewrites a flight's times once it has been operated, and those days aren't in the PDF.
// The default window therefore reaches back so each sync settles the days just flown.
describe('defaultBeginDate', () => {
  it('starts the lookback window before today', () => {
    expect(defaultBeginDate(new Date('2026-08-17T10:00:00Z'))).toBe('2026-08-10');
    expect(SYNC_LOOKBACK_DAYS).toBeGreaterThan(0);
  });

  it('crosses month boundaries correctly', () => {
    expect(defaultBeginDate(new Date('2026-03-03T10:00:00Z'))).toBe('2026-02-24');
  });
});
