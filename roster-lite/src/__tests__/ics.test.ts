import { describe, expect, it } from 'vitest';
import { parseIcs } from '../parsing/ics/parseIcs';

describe('parseIcs', () => {
  it('parses a VEVENT flight into a ParsedDuty', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART:20260618T063000Z',
      'DTEND:20260618T072500Z',
      'SUMMARY:FLT TP1920 LIS-OPO',
      'DESCRIPTION:Embraer E190',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');
    const duties = parseIcs(ics);
    expect(duties).toHaveLength(1);
    expect(duties[0]).toMatchObject({
      date: '2026-06-18',
      dutyType: 'Flight Duty',
      flightNumber: 'TP1920',
      departureAirport: 'LIS',
      arrivalAirport: 'OPO',
    });
  });

  it('handles all-day day-off events', () => {
    const ics = ['BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20260619', 'SUMMARY:Day Off', 'END:VEVENT'].join('\n');
    const duties = parseIcs(ics);
    expect(duties[0].date).toBe('2026-06-19');
    expect(duties[0].dutyType).toBe('Day Off');
  });
});
