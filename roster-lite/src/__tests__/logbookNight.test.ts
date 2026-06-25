import { describe, it, expect } from 'vitest';
import { rowNight, rowNightLanding, logbookCsvRows } from '../domain/logbook';
import type { LogbookRow } from '../domain/types';

const row = (over: Partial<LogbookRow>): LogbookRow => ({
  key: 'k', userId: 'u', date: '2026-06-21', flightNumber: 'TP100', from: 'LIS', to: 'OPO',
  off: '12:00', on: '13:00', aircraft: 'E90', reg: 'CS-TPA', ...over,
});

describe('rowNight', () => {
  it('is zero for a midday sector and positive for a late-night one', () => {
    expect(rowNight(row({ off: '12:00', on: '13:00' }))).toBe(0);
    expect(rowNight(row({ off: '23:00', on: '23:45' }))).toBeGreaterThan(0);
  });

  it('flags a night landing', () => {
    expect(rowNightLanding(row({ off: '12:00', on: '13:00' }))).toBe(false);
    expect(rowNightLanding(row({ off: '23:00', on: '23:45' }))).toBe(true);
  });

  it('is zero for airports outside the curated network', () => {
    expect(rowNight(row({ from: 'LIS', to: 'ZZZ' }))).toBe(0);
  });
});

describe('logbookCsvRows', () => {
  it('includes IFR, night and day/night landing columns', () => {
    const csv = logbookCsvRows([row({ off: '12:00', on: '13:00' })]);
    const [header, line] = csv.split('\r\n');
    expect(header).toContain('IFR');
    expect(header).toContain('Noite');
    expect(header).toContain('Aterr. dia');
    // Daytime sector: IFR = block (1h00), night 0m, day landing = 1.
    expect(line).toContain('1h00'); // IFR/block
    expect(line.endsWith('1,0')).toBe(true); // Aterr. dia=1, Aterr. noite=0
  });
});
