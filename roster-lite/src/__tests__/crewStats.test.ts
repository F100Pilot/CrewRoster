import { describe, expect, it } from 'vitest';
import { cumulativeFlightTime, flightMinutes } from '../domain/flightTime';
import { restPeriods } from '../domain/restPeriods';
import { logbookEntries, logbookCsv, landingsInWindow } from '../domain/logbook';
import type { ParsedDuty } from '../domain/types';

function flight(p: Partial<ParsedDuty> & { date: string }): ParsedDuty {
  return {
    dutyCode: 'TP100',
    dutyType: 'Flight Duty',
    reportingTime: null,
    departureTime: '08:00',
    arrivalTime: '10:00',
    flightNumber: 'TP100',
    departureAirport: 'LIS',
    arrivalAirport: 'OPO',
    aircraftType: 'A320',
    observations: null,
    ...p,
  };
}

describe('flightMinutes', () => {
  it('sums operated sectors and ignores positioning', () => {
    const duties = [
      flight({ date: '2026-06-01', departureTime: '08:00', arrivalTime: '10:00' }), // 120
      flight({ date: '2026-06-01', dutyType: 'Positioning', departureTime: '11:00', arrivalTime: '12:00' }),
    ];
    expect(flightMinutes(duties)).toBe(120);
  });
});

describe('cumulativeFlightTime', () => {
  it('buckets flight time into the trailing windows', () => {
    const duties = [
      flight({ date: '2026-01-10', departureTime: '08:00', arrivalTime: '10:00' }), // this year, >28d ago
      flight({ date: '2026-06-15', departureTime: '08:00', arrivalTime: '09:00' }), // within 28d of the 19th
    ];
    const t = cumulativeFlightTime(duties, '2026-06-19');
    expect(t.days28).toBe(60); // only the 15th
    expect(t.calendarYear).toBe(180); // both, same year
    expect(t.months12).toBe(180); // both within 12 months
  });
});

describe('restPeriods', () => {
  it('computes the gap between a day ending and the next day reporting', () => {
    const duties = [
      flight({ date: '2026-06-01', departureTime: '08:00', arrivalTime: '18:00' }),
      flight({ date: '2026-06-02', reportingTime: '07:00', departureTime: '08:00', arrivalTime: '10:00' }),
    ];
    const rest = restPeriods(duties);
    expect(rest[0].restMinutes).toBeNull(); // first period
    // 18:00 day 1 → 07:00 day 2 = 13h = 780 min
    expect(rest[1].restMinutes).toBe(780);
    expect(rest[1].short).toBe(false);
  });

  it('flags rest below the indicative minimum', () => {
    const duties = [
      flight({ date: '2026-06-01', departureTime: '08:00', arrivalTime: '22:00' }),
      flight({ date: '2026-06-02', reportingTime: '06:00', departureTime: '07:00', arrivalTime: '09:00' }),
    ];
    const rest = restPeriods(duties);
    // 22:00 → 06:00 next day = 8h = 480 min, below 12h
    expect(rest[1].restMinutes).toBe(480);
    expect(rest[1].short).toBe(true);
  });
});

describe('logbook', () => {
  it('builds one entry per operated sector with block time', () => {
    const duties = [
      flight({ date: '2026-06-01', flightNumber: 'TP1', departureTime: '08:00', arrivalTime: '09:30' }),
      flight({ date: '2026-06-01', dutyType: 'Day Off', departureTime: null, arrivalTime: null }),
    ];
    const entries = logbookEntries(duties);
    expect(entries).toHaveLength(1);
    expect(entries[0].blockMinutes).toBe(90);
    expect(entries[0].flightNumber).toBe('TP1');
  });

  it('exports CSV with a header row', () => {
    const csv = logbookCsv(logbookEntries([flight({ date: '2026-06-01', flightNumber: 'TP1' })]));
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Data,Voo,De,Para,Off (UTC),On (UTC),Bloco,Aeronave');
    expect(lines[1]).toContain('TP1');
  });

  it('counts landings within the recency window', () => {
    const duties = [
      flight({ date: '2026-06-18' }),
      flight({ date: '2026-06-19' }),
      flight({ date: '2026-01-01' }), // outside 90 days
    ];
    expect(landingsInWindow(duties, '2026-06-19', 90)).toBe(2);
  });
});
