import { describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import { defaultBeginDate, pdfMonth, SYNC_LOOKBACK_DAYS } from '../domain/rosterWindow';

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

// The PDF history files a PDF under the roster's month when a closed range was asked for.
describe('pdfMonth', () => {
  const pdf = (downloadedAt: string, beginDate: string | null, endDate: string | null) =>
    ({ id: 'x', fileName: 'x.pdf', blob: new Blob(), downloadedAt, beginDate, endDate });
  const ym = (d: Date) => format(d, 'yyyy-MM');

  it('files a past month asked for on its own under that month, not the download\'s', () => {
    expect(ym(pdfMonth(pdf('2026-11-15T00:30:00Z', '2025-12-01', '2025-12-31')))).toBe('2025-12');
  });

  it('keeps the usual download (a week back → server max) under the download month', () => {
    expect(ym(pdfMonth(pdf('2026-11-15T10:00:00Z', '2026-11-08', null)))).toBe('2026-11');
    expect(ym(pdfMonth(pdf('2026-11-15T10:00:00Z', null, null)))).toBe('2026-11');
  });

  it('takes the middle of a range across two months', () => {
    expect(ym(pdfMonth(pdf('2026-11-15T10:00:00Z', '2026-12-20', '2027-01-31')))).toBe('2027-01');
  });
});
