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

  it('captures the commander (CP crew) as the sector PIC, and keeps it if a later refresh lacks crew', () => {
    const withCrew = flight({ crew: [
      { login: 'CMDR', surname: 'SILVA', role: 'CP', firstName: 'JOAO' },
      { login: 'ME', surname: 'COSTA', role: 'FO' },
    ] });
    const rows = apply([], mergeLogbook([], [withCrew], U));
    expect(rows[0].pic).toBe('JOAO SILVA');
    // A later merge whose roster has no crew for this sector must not wipe the captured name.
    expect(mergeLogbook(rows, [flight({})], U)).toHaveLength(0);
  });

  it('preserves the who-flew (PF) annotations across a roster refresh', () => {
    const key = logbookRowKey(U, '2026-06-10', 'TP100', 'LIS', 'OPO');
    // A non-edited row the user annotated (colleague landed), then the roster refreshes its tail.
    const annotated: LogbookRow = {
      key, userId: U, date: '2026-06-10', flightNumber: 'TP100', from: 'LIS', to: 'OPO',
      off: '08:00', on: '09:30', aircraft: 'E90', reg: '', ldgSelf: false,
    };
    const regs = new Map<string, AircraftReg>([
      ['2026-06-10|TP100|LIS-OPO', { key: 'x', userId: U, date: '2026-06-10', flightNumber: 'TP100', dep: 'LIS', arr: 'OPO', reg: 'CS-TPU', model: null, recordedAt: '' }],
    ]);
    const ups = mergeLogbook([annotated], [flight({})], U, regs);
    expect(ups).toHaveLength(1); // reg changed → upsert
    expect(ups[0].reg).toBe('CS-TPU');
    expect(ups[0].ldgSelf).toBe(false); // annotation survives
  });

  it('fills the tail from the resolved regs map', () => {
    const regs = new Map<string, AircraftReg>([
      ['2026-06-10|TP100|LIS-OPO', { key: 'u1|2026-06-10|TP100|LIS-OPO', userId: U, date: '2026-06-10', flightNumber: 'TP100', dep: 'LIS', arr: 'OPO', reg: 'CS-TPU', model: null, recordedAt: '' }],
    ]);
    const ups = mergeLogbook([], [flight({})], U, regs);
    expect(ups[0].reg).toBe('CS-TPU');
  });
});

// A re-downloaded roster carries the final times once a sector has been operated, so the
// logbook must take them — that is the whole point of syncing after flying.
describe('mergeLogbook — re-sync updates an operated sector', () => {
  const key = logbookRowKey(U, '2026-06-10', 'TP100', 'LIS', 'OPO');
  const stored = (over: Partial<LogbookRow> = {}): LogbookRow => ({
    key, userId: U, date: '2026-06-10', flightNumber: 'TP100', from: 'LIS', to: 'OPO',
    off: '08:00', on: '09:30', aircraft: 'E90', reg: 'CS-TPU', ...over,
  });
  const reflown = flight({ departureTime: '08:14', arrivalTime: '09:41' });

  it('takes the new times for a row the roster owns', () => {
    const ups = mergeLogbook([stored()], [reflown], U);
    expect(ups).toHaveLength(1);
    expect([ups[0].off, ups[0].on]).toEqual(['08:14', '09:41']);
  });

  it('still updates a row that only carries a who-flew annotation', () => {
    // Marking PF must not freeze the sector — those flags are preserved, the times refresh.
    const ups = mergeLogbook([stored({ ldgSelf: false })], [reflown], U);
    expect([ups[0].off, ups[0].on]).toEqual(['08:14', '09:41']);
    expect(ups[0].ldgSelf).toBe(false);
  });

  it('leaves a hand-corrected row alone', () => {
    expect(mergeLogbook([stored({ edited: true })], [reflown], U)).toHaveLength(0);
  });
});
