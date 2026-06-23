import { describe, it, expect } from 'vitest';
import { parseNotificationReport, summarizeNotifLine } from '../parsing/pdf/notificationReport';
import type { PositionedToken } from '../parsing/pdf/extractText';

const tok = (text: string, x: number, y: number): PositionedToken => ({ text, x, y, width: 0, height: 0, page: 1 });

// Real tokens extracted from a PGA Crew Notification PDF (PVIEIRA, 09Jul change).
const REAL: PositionedToken[] = [
  tok('Notification date:', 62.4, 773.1), tok('09Jul26', 187.1, 773.1),
  tok('Notification id:', 62.4, 764), tok('23Jun26-11:23:19', 187.1, 764),
  tok('date', 62.4, 711.6), tok('known state', 99.2, 711.6),
  tok('current state', 314.6, 711.6), tok('user', 530, 711.6),
  // 09Jul: known A1 LIS 0400-1000
  tok('09Jul', 62.4, 696.7), tok('A1', 118.3, 696.7), tok('LIS', 166.2, 696.7),
  tok('0400', 190.1, 696.7), tok('1000', 218.8, 696.7), tok('*', 99.2, 695.3),
  // current TP860 LIS-VCE 0545-0845
  tok('TP', 329, 688.2), tok('860', 348.1, 688.2), tok('LIS', 376.8, 688.2),
  tok('0545', 400.7, 688.2), tok('0845', 429.4, 688.2), tok('VCE', 462.8, 688.2),
  tok('E95', 486.8, 688.2), tok('*', 99.2, 686.7),
  // current TP861 VCE-LIS 0940-1255
  tok('TP', 329, 679.8), tok('861', 348.1, 679.8), tok('VCE', 376.8, 679.8),
  tok('0940', 400.7, 679.8), tok('1255', 429.4, 679.8), tok('LIS', 462.8, 679.8),
  tok('E95', 486.8, 679.8), tok('*', 99.2, 678.3), tok('*', 99.2, 669.8),
];

describe('summarizeNotifLine', () => {
  it('formats a flight with route and block times', () => {
    expect(summarizeNotifLine(['TP', '860', 'LIS', '0545', '0845', 'VCE', 'E95']))
      .toBe('TP860 LIS-VCE 05:45-08:45');
  });
  it('formats an activity with location and times', () => {
    expect(summarizeNotifLine(['A1', 'LIS', '0400', '1000'])).toBe('A1 LIS 04:00-10:00');
  });
});

describe('parseNotificationReport', () => {
  const report = parseNotificationReport(REAL)!;
  it('reads the notification metadata', () => {
    expect(report.notificationDate).toBe('09Jul26');
    expect(report.notificationId).toBe('23Jun26-11:23:19');
  });
  it('extracts the known → current change for the day', () => {
    expect(report.changes).toHaveLength(1);
    const c = report.changes[0];
    expect(c.date).toBe('2026-07-09');
    expect(c.known).toEqual(['A1 LIS 04:00-10:00']);
    expect(c.current).toEqual(['TP860 LIS-VCE 05:45-08:45', 'TP861 VCE-LIS 09:40-12:55']);
  });
});
