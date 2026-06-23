import { describe, it, expect } from 'vitest';
import { mergeLogbook, sortLogbook } from '../domain/logbook';
import { logbookRowKey } from '../storage/rosterStore';
import type { AircraftReg, LogbookRow, ParsedDuty } from '../domain/types';

const U = 'u1';
const flight = (over: Partial<ParsedDuty>): ParsedDuty => ({
  date: '2026-06-10', dutyCode: 'FLT', dutyType: 'Flight Duty',
  reportingTime: null, departureTime: '08:00', arrivalTime: '09:30',
  flightNumber: 'TP100', departureAirport: 'LIS', arrivalAirport: 'OPO',
  aircraftType: 'E90', observations: null, ...over,
});

// Apply a merge result onto an existing array, the way the store would.
function apply(existing: LogbookRow[], upserts: LogbookRow[]): LogbookRow[] {
  const byKey = new Map(existing.map((r) => [r.key, r]));
  for (const u of upserts) byKey.set(u.key, u);
  return [...byKey.values()];
}

describe('mergeLogbook', () => {
  it('adds new sectors and keeps them after the roster is gone', () => {
    const duties = [flight({}), flight({ flightNumber: 'TP101', departureAirport: 'OPO', arrivalAirport: 'LIS', departureTime: '10:00', arrivalTime: '11:00' })];
    const rows = apply([], mergeLogbook([], duties, U));
    expect(rows).toHaveLength(2);
    // A later merge with NO roster (cleared) leaves the logbook intact.
    expect(mergeLogbook(rows, [], U)).toHaveLength(0);
  });

  it('merges an earlier-dated sector and re-sorts it to the front', () => {
    const first = apply([], mergeLogbook([], [flight({ date: '2026-06-10' })], U));
    const withEarlier = apply(first, mergeLogbook(first, [flight({ date: '2026-06-01', flightNumber: 'TP9' })], U));
    expect(sortLogbook(withEarlier).map((r) => r.date)).toEqual(['2026-06-01', '2026-06-10']);
  });

  it('never overwrites a hand-edited row', () => {
    const key = logbookRowKey(U, '2026-06-10', 'TP100', 'LIS', 'OPO');
    const edited: LogbookRow = {
      key, userId: U, date: '2026-06-10', flightNumber: 'TP100', from: 'LIS', to: 'OPO',
      off: '07:00', on: '08:15', aircraft: 'E95', reg: 'CS-XXX', edited: true,
    };
    // Same sector in the roster, different times — must NOT produce an upsert.
    expect(mergeLogbook([edited], [flight({})], U)).toHaveLength(0);
  });

  it('does not wipe a known tail when the roster has none', () => {
    const key = logbookRowKey(U, '2026-06-10', 'TP100', 'LIS', 'OPO');
    const known: LogbookRow = {
      key, userId: U, date: '2026-06-10', flightNumber: 'TP100', from: 'LIS', to: 'OPO',
      off: '08:00', on: '09:30', aircraft: 'E90', reg: 'CS-TPU',
    };
    // Roster present, no regs map → reg stays, so nothing changes.
    expect(mergeLogbook([known], [flight({})], U)).toHaveLength(0);
  });

  it('fills the tail from the resolved regs map', () => {
    const regs = new Map<string, AircraftReg>([
      ['2026-06-10|TP100|LIS-OPO', { key: 'u1|2026-06-10|TP100|LIS-OPO', userId: U, date: '2026-06-10', flightNumber: 'TP100', dep: 'LIS', arr: 'OPO', reg: 'CS-TPU', model: null, recordedAt: '' }],
    ]);
    const ups = mergeLogbook([], [flight({})], U, regs);
    expect(ups[0].reg).toBe('CS-TPU');
  });
});
