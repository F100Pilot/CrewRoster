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

  it('converts a TZID local time to UTC (Europe/Lisbon summer = +1h)', () => {
    const ics = [
      'BEGIN:VEVENT',
      'DTSTART;TZID=Europe/Lisbon:20260618T063000', // 06:30 local → 05:30 UTC
      'DTEND;TZID=Europe/Lisbon:20260618T072500',   // 07:25 local → 06:25 UTC
      'SUMMARY:FLT TP1920 LIS-OPO',
      'END:VEVENT',
    ].join('\n');
    const d = parseIcs(ics)[0];
    expect(d.departureTime).toBe('05:30');
    expect(d.arrivalTime).toBe('06:25');
  });

  it('keeps a trailing-Z time as UTC', () => {
    const ics = ['BEGIN:VEVENT', 'DTSTART:20260618T063000Z', 'DTEND:20260618T072500Z', 'SUMMARY:FLT TP1 LIS-OPO', 'END:VEVENT'].join('\n');
    const d = parseIcs(ics)[0];
    expect(d.departureTime).toBe('06:30');
  });

  it('does not misclassify TRAINING as a flight (substring "NI")', () => {
    const ics = ['BEGIN:VEVENT', 'DTSTART:20260620T080000Z', 'SUMMARY:RECURRENT TRAINING', 'END:VEVENT'].join('\n');
    expect(parseIcs(ics)[0].dutyType).toBe('Training');
  });

  it('classifies "DAY OFF REQUEST" as a day off, not a flight', () => {
    const ics = ['BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20260621', 'SUMMARY:DAY OFF REQUEST', 'END:VEVENT'].join('\n');
    expect(parseIcs(ics)[0].dutyType).toBe('Day Off');
  });
});
