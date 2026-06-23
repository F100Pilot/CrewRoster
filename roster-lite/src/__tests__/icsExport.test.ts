import { describe, expect, it } from 'vitest';
import { buildIcs, alarmLeadMinutes } from '../utils/icsExport';
import type { ParsedDuty, Roster } from '../domain/types';

const duty = (over: Partial<ParsedDuty>): ParsedDuty => ({
  date: '2026-06-20',
  dutyCode: 'FLT',
  dutyType: 'Flight Duty',
  reportingTime: null,
  departureTime: null,
  arrivalTime: null,
  flightNumber: null,
  departureAirport: null,
  arrivalAirport: null,
  aircraftType: null,
  observations: null,
  ...over,
});

const roster = (duties: ParsedDuty[]): Roster => ({
  id: 'current',
  fileName: 'escala.pdf',
  sourceType: 'pdf',
  importedAt: '2026-06-19T00:00:00.000Z',
  duties,
  rawText: '',
});

describe('alarmLeadMinutes', () => {
  const flt = duty({ departureTime: '07:00', arrivalTime: '08:30', reportingTime: '06:00' });
  it('is off with lead 0 or no timed start', () => {
    expect(alarmLeadMinutes(flt, 0)).toBeNull();
    expect(alarmLeadMinutes(duty({ dutyType: 'Day Off' }), 30)).toBeNull();
  });
  it('counts from report time plus the lead', () => {
    expect(alarmLeadMinutes(flt, 30)).toBe(90); // 60 (report→dep) + 30
  });
  it('falls back to lead before departure when there is no report time', () => {
    expect(alarmLeadMinutes(duty({ departureTime: '07:00', arrivalTime: '08:30' }), 30)).toBe(30);
  });
});

describe('buildIcs', () => {
  it('emits a timed UTC event for a flight', () => {
    const ics = buildIcs(
      roster([
        duty({
          flightNumber: 'TP868',
          departureAirport: 'LIS',
          arrivalAirport: 'BLQ',
          departureTime: '06:15',
          arrivalTime: '09:10',
          reportingTime: '05:15',
        }),
      ])
    );
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART:20260620T061500Z');
    expect(ics).toContain('DTEND:20260620T091000Z');
    expect(ics).toContain('SUMMARY:TP868 LIS-BLQ');
    expect(ics).toContain('LOCATION:LIS');
    expect(ics).toContain('DESCRIPTION:Check-in 05:15z');
    expect(ics.endsWith('END:VCALENDAR')).toBe(true);
  });

  it('rolls the end date forward when a flight crosses midnight', () => {
    const ics = buildIcs(
      roster([duty({ flightNumber: 'TP9', departureTime: '23:30', arrivalTime: '00:45' })])
    );
    expect(ics).toContain('DTSTART:20260620T233000Z');
    expect(ics).toContain('DTEND:20260621T004500Z');
  });

  it('emits an all-day event for a day off', () => {
    const ics = buildIcs(roster([duty({ dutyType: 'Day Off', dutyCode: 'OFF' })]));
    expect(ics).toContain('DTSTART;VALUE=DATE:20260620');
    expect(ics).toContain('DTEND;VALUE=DATE:20260621');
    expect(ics).toContain('SUMMARY:OFF (Day Off)');
  });
});
