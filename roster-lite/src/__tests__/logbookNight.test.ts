import { describe, it, expect } from 'vitest';
import { rowNight, rowNightLanding, rowNightTakeoff, takeoffLandingCounts, logbookCsvRows } from '../domain/logbook';
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

describe('rowNightTakeoff', () => {
  it('is false for a midday take-off and true for a late-night one', () => {
    expect(rowNightTakeoff(row({ off: '12:00', on: '13:00' }))).toBe(false);
    expect(rowNightTakeoff(row({ off: '23:00', on: '23:45' }))).toBe(true);
  });
});

describe('takeoffLandingCounts', () => {
  it('counts my take-offs/landings day vs night, honouring the PF flags', () => {
    const rows = [
      row({ key: 'a', date: '2026-06-21', off: '12:00', on: '13:00' }), // day, both me (default)
      row({ key: 'b', date: '2026-06-22', off: '23:00', on: '23:45', flightNumber: 'TP200' }), // night, me
      row({ key: 'c', date: '2026-06-23', off: '12:00', on: '13:00', flightNumber: 'TP300', toSelf: false }), // colleague did T/O
    ];
    expect(takeoffLandingCounts(rows)).toEqual({ toDay: 1, toNight: 1, ldgDay: 2, ldgNight: 1 });
  });

  it('restricts to the trailing window when given one', () => {
    const rows = [row({ key: 'old', date: '2020-01-01' }), row({ key: 'new', date: '2026-06-21' })];
    expect(takeoffLandingCounts(rows, { refISO: '2026-06-30', days: 90 }).ldgDay).toBe(1);
  });
});

describe('logbookCsvRows', () => {
  it('includes IFR, night and day/night take-off & landing columns', () => {
    const csv = logbookCsvRows([row({ off: '12:00', on: '13:00' })]);
    const [header, line] = csv.split('\r\n');
    expect(header).toContain('IFR');
    expect(header).toContain('Noite');
    expect(header).toContain('Desc. dia');
    expect(header).toContain('Aterr. dia');
    // Daytime sector flown by me: IFR = block (1h00), and the last 4 columns are
    // Desc.dia=1, Desc.noite=0, Aterr.dia=1, Aterr.noite=0.
    expect(line).toContain('1h00');
    expect(line.endsWith('1,0,1,0')).toBe(true);
  });

  it('does not count a take-off a colleague flew', () => {
    const line = logbookCsvRows([row({ off: '12:00', on: '13:00', toSelf: false })]).split('\r\n')[1];
    // Desc.dia=0, Desc.noite=0, Aterr.dia=1, Aterr.noite=0.
    expect(line.endsWith('0,0,1,0')).toBe(true);
  });
});
