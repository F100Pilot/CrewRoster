import { describe, expect, it } from 'vitest';
import { parseSubColumn } from '../parsing/pdf/pgaGrid';
import type { PositionedToken } from '../parsing/pdf/extractText';

// Regression for the "flight number vs time" collision (audit 2.5). Modelled on a real
// Portugália PDF column (period Jan–Jul 2026): TP1452 LIS-RAK departs 08:26, arrives
// 10:01. The number 1452 is itself a valid clock time (14:52), so a value-based parse
// could swallow it as a departure/arrival time. The grid identifies the number by its
// POSITION (the row directly below the carrier), which must keep working.
//
// Tokens are stacked top→bottom in a single day column (descending y), text only — no
// crew names or other personal data.
function column(texts: string[], x = 463): PositionedToken[] {
  return texts.map((text, i) => ({ text, x, y: 520 - i * 11, width: 14, height: 6, page: 1 }));
}

describe('parseSubColumn — flight number that is a valid clock time (audit 2.5)', () => {
  it('keeps TP1452 as the flight number, not a 14:52 time', () => {
    const duties = parseSubColumn(
      column(['FO_SAFETY', 'TP', '1452', 'LIS', '0826', '1001', 'RAK', 'E90', 'CREWNAME']),
      '2026-05-16',
    );
    const flight = duties.find((d) => d.dutyType === 'Flight Duty');
    expect(flight).toMatchObject({
      flightNumber: 'TP1452',
      departureAirport: 'LIS',
      arrivalAirport: 'RAK',
      departureTime: '08:26',
      arrivalTime: '10:01',
      aircraftType: 'E90',
    });
  });

  it('handles an extreme time-like number (TP2359) without consuming it as 23:59', () => {
    const duties = parseSubColumn(
      column(['TP', '2359', 'LIS', '0705', '0830', 'OPO', 'E95']),
      '2026-06-01',
    );
    const flight = duties.find((d) => d.dutyType === 'Flight Duty');
    expect(flight).toMatchObject({
      flightNumber: 'TP2359',
      departureTime: '07:05',
      arrivalTime: '08:30',
    });
  });

  it('still parses the return leg TP1453 RAK-LIS (number 14:53-like)', () => {
    const duties = parseSubColumn(
      column(['TP', '1453', 'RAK', '1053', '1230', 'LIS', 'E90']),
      '2026-05-16',
    );
    expect(duties.find((d) => d.dutyType === 'Flight Duty')).toMatchObject({
      flightNumber: 'TP1453',
      departureTime: '10:53',
      arrivalTime: '12:30',
    });
  });
});
