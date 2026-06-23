import { describe, it, expect } from 'vitest';
import { buildFlightNetwork } from '../domain/flightMap';
import { logbookStats, recencyStatus } from '../domain/logbook';
import type { LogbookRow } from '../domain/types';

const row = (over: Partial<LogbookRow>): LogbookRow => ({
  key: Math.random().toString(36), userId: 'u', date: '2026-06-10', flightNumber: 'TP1',
  from: 'LIS', to: 'OPO', off: '08:00', on: '09:00', aircraft: 'E90', reg: '', ...over,
});

describe('buildFlightNetwork', () => {
  it('counts visits and folds reciprocal routes into one edge', () => {
    const net = buildFlightNetwork([
      { from: 'LIS', to: 'GVA' }, { from: 'GVA', to: 'LIS' }, { from: 'LIS', to: 'OPO' },
    ]);
    expect(net.routes.find((r) => r.from === 'GVA' && r.to === 'LIS')?.count).toBe(2);
    expect(net.airports.find((a) => a.code === 'LIS')?.visits).toBe(3);
    expect(net.routes).toHaveLength(2);
  });
  it('reports airports without coordinates instead of plotting them', () => {
    const net = buildFlightNetwork([{ from: 'LIS', to: 'ZZZ' }]);
    expect(net.unknown).toContain('ZZZ');
    expect(net.airports.map((a) => a.code)).toEqual(['LIS']);
  });
});

describe('logbookStats', () => {
  it('aggregates block, airports, tails and per-year totals', () => {
    const stats = logbookStats([
      row({ date: '2025-12-31', reg: 'CS-AAA' }),
      row({ date: '2026-01-02', from: 'OPO', to: 'LIS', reg: 'CS-AAA' }),
      row({ date: '2026-01-03', from: 'LIS', to: 'FNC', reg: 'CS-BBB' }),
    ]);
    expect(stats.sectors).toBe(3);
    expect(stats.tails).toBe(2);
    expect(stats.byYear.map((y) => y.year)).toEqual(['2026', '2025']);
    expect(stats.topAirports.find((a) => a.code === 'LIS')?.visits).toBe(3);
  });
});

describe('recencyStatus', () => {
  it('is current with 3 landings in 90 days and projects the expiry', () => {
    const r = recencyStatus([
      row({ date: '2026-06-01' }), row({ date: '2026-06-05' }), row({ date: '2026-06-09' }),
    ], '2026-06-10');
    expect(r.current).toBe(true);
    expect(r.landings90).toBe(3);
    expect(r.validUntil).toBe('2026-08-30'); // 3rd-most-recent (Jun 1) + 90d
  });
  it('is not current below 3 landings', () => {
    const r = recencyStatus([row({ date: '2026-06-01' })], '2026-06-10');
    expect(r.current).toBe(false);
    expect(r.validUntil).toBeNull();
  });

  it('does not count duplicate/re-imported rows as separate landings', () => {
    const dup = { date: '2026-06-05', flightNumber: 'TP7', from: 'LIS', to: 'OPO', off: '08:00', on: '09:00' };
    const r = recencyStatus([
      row({ ...dup }), row({ ...dup }), row({ ...dup }), // same sector three times
    ], '2026-06-10');
    expect(r.landings90).toBe(1);
    expect(r.current).toBe(false);
  });

  it('ignores rows with identical or missing endpoints', () => {
    const r = recencyStatus([
      row({ date: '2026-06-01', flightNumber: 'A', from: 'LIS', to: 'LIS' }), // ground/return-to-stand
      row({ date: '2026-06-05', flightNumber: 'B', from: '', to: 'OPO' }),     // missing endpoint
      row({ date: '2026-06-09', flightNumber: 'C', from: 'LIS', to: 'FNC' }),
    ], '2026-06-10');
    expect(r.landings90).toBe(1);
  });

  it('reports no validUntil when not current even with 3 landings spread beyond 90 days', () => {
    const r = recencyStatus([
      row({ date: '2026-01-01', flightNumber: 'A', to: 'OPO' }),
      row({ date: '2026-02-01', flightNumber: 'B', to: 'FNC' }),
      row({ date: '2026-03-01', flightNumber: 'C', to: 'FAO' }),
    ], '2026-06-10'); // all >90 days before ref
    expect(r.landings90).toBe(0);
    expect(r.current).toBe(false);
    expect(r.validUntil).toBeNull();
  });
});
