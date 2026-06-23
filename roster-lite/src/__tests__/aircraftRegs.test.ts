import { describe, it, expect } from 'vitest';
import { matchLeg } from '../domain/aircraftRegs';
import { logbookEntries } from '../domain/logbook';
import type { AircraftReg, ParsedDuty } from '../domain/types';
import type { FlightInfo } from '../services/crewlinkApi';

const leg = (dep: string, arr: string, reg: string): FlightInfo => ({
  number: 'TP574', status: 'Arrived', reg, model: 'Embraer 190',
  departure: { iata: dep, icao: null, terminal: null, gate: null, scheduledUtc: null },
  arrival: { iata: arr, icao: null, terminal: null, gate: null, scheduledUtc: null },
});

// A route-matching record that carries no tail (AeroDataBox sometimes returns one).
const regless = (dep: string, arr: string): FlightInfo => ({
  ...leg(dep, arr, ''), reg: null,
});

describe('matchLeg', () => {
  it('prefers the leg matching both endpoints', () => {
    const flights = [leg('LIS', 'OPO', 'CS-AAA'), leg('LIS', 'FRA', 'CS-BBB')];
    expect(matchLeg(flights, 'LIS', 'FRA')?.reg).toBe('CS-BBB');
  });
  it('falls back to the departure match, then the first leg', () => {
    const flights = [leg('LIS', 'OPO', 'CS-AAA'), leg('LIS', 'FRA', 'CS-BBB')];
    expect(matchLeg(flights, 'LIS', 'NCE')?.reg).toBe('CS-AAA'); // departure match
    expect(matchLeg(flights, 'XXX', 'YYY')?.reg).toBe('CS-AAA'); // first leg
    expect(matchLeg([], 'LIS', 'FRA')).toBeNull();
  });
  it('prefers a route-matching leg that has a tail over a regless duplicate', () => {
    // Real case: TP940 LIS-GVA returned twice, the first without a registration.
    const flights = [regless('LIS', 'GVA'), leg('LIS', 'GVA', 'CS-TPU')];
    expect(matchLeg(flights, 'LIS', 'GVA')?.reg).toBe('CS-TPU');
  });
});

describe('logbookEntries with registrations', () => {
  const flight = (over: Partial<ParsedDuty>): ParsedDuty => ({
    date: '2026-06-01', dutyCode: 'FLT', dutyType: 'Flight Duty',
    reportingTime: null, departureTime: '08:00', arrivalTime: '09:30',
    flightNumber: 'TP574', departureAirport: 'LIS', arrivalAirport: 'FRA',
    aircraftType: 'E90', observations: null, ...over,
  });
  it('fills the tail from the regs map keyed by date|flightNumber', () => {
    const regs = new Map<string, AircraftReg>([
      ['2026-06-01|TP574|LIS-FRA', { key: 'u|2026-06-01|TP574|LIS-FRA', userId: 'u', date: '2026-06-01', flightNumber: 'TP574', dep: 'LIS', arr: 'FRA', reg: 'CS-TPU', model: 'E90', recordedAt: '' }],
    ]);
    const entries = logbookEntries([flight({})], regs);
    expect(entries[0].reg).toBe('CS-TPU');
  });
  it('leaves the tail empty when nothing is recorded', () => {
    expect(logbookEntries([flight({})])[0].reg).toBe('');
  });

  it('infers the tail of the return leg from the captured outbound (same-day rotation)', () => {
    // Only the outbound LIS→GVA was captured; the return GVA→LIS shares the airframe.
    const regs = new Map<string, AircraftReg>([
      ['2026-06-01|TP940|LIS-GVA', { key: 'u|2026-06-01|TP940|LIS-GVA', userId: 'u', date: '2026-06-01', flightNumber: 'TP940', dep: 'LIS', arr: 'GVA', reg: 'CS-TPU', model: null, recordedAt: '' }],
    ]);
    const entries = logbookEntries([
      flight({ flightNumber: 'TP940', departureAirport: 'LIS', arrivalAirport: 'GVA', departureTime: '08:00', arrivalTime: '10:10' }),
      flight({ flightNumber: 'TP941', departureAirport: 'GVA', arrivalAirport: 'LIS', departureTime: '11:00', arrivalTime: '13:00' }),
    ], regs);
    expect(entries.map((e) => e.reg)).toEqual(['CS-TPU', 'CS-TPU']);
    expect(entries.map((e) => e.regInferred)).toEqual([false, true]);
  });

  it('does not infer across a break (separate same-day rotations)', () => {
    // LIS→OPO→LIS is one rotation; a later LIS→FRA is a new one (no connecting leg).
    const regs = new Map<string, AircraftReg>([
      ['2026-06-01|TP100|LIS-OPO', { key: 'u|2026-06-01|TP100|LIS-OPO', userId: 'u', date: '2026-06-01', flightNumber: 'TP100', dep: 'LIS', arr: 'OPO', reg: 'CS-AAA', model: null, recordedAt: '' }],
    ]);
    const entries = logbookEntries([
      flight({ flightNumber: 'TP100', departureAirport: 'LIS', arrivalAirport: 'OPO', departureTime: '06:00', arrivalTime: '07:00' }),
      flight({ flightNumber: 'TP101', departureAirport: 'OPO', arrivalAirport: 'LIS', departureTime: '08:00', arrivalTime: '09:00' }),
      flight({ flightNumber: 'TP200', departureAirport: 'LIS', arrivalAirport: 'FRA', departureTime: '15:00', arrivalTime: '18:00' }),
    ], regs);
    // OPO→LIS continues the first rotation → inferred; LIS→FRA is a fresh leg → no tail.
    expect(entries.map((e) => e.reg)).toEqual(['CS-AAA', 'CS-AAA', '']);
    expect(entries.map((e) => e.regInferred)).toEqual([false, true, false]);
  });

  it('keeps two sectors of the same flight number on a day distinct', () => {
    const mk = (route: string, dep: string, arr: string, reg: string): [string, AircraftReg] => [
      `2026-06-01|TP574|${route}`,
      { key: `u|2026-06-01|TP574|${route}`, userId: 'u', date: '2026-06-01', flightNumber: 'TP574', dep, arr, reg, model: null, recordedAt: '' },
    ];
    const regs = new Map<string, AircraftReg>([
      mk('LIS-OPO', 'LIS', 'OPO', 'CS-AAA'),
      mk('OPO-LIS', 'OPO', 'LIS', 'CS-BBB'),
    ]);
    const entries = logbookEntries([
      flight({ departureAirport: 'LIS', arrivalAirport: 'OPO', departureTime: '08:00', arrivalTime: '09:00' }),
      flight({ departureAirport: 'OPO', arrivalAirport: 'LIS', departureTime: '10:00', arrivalTime: '11:00' }),
    ], regs);
    expect(entries.map((e) => e.reg)).toEqual(['CS-AAA', 'CS-BBB']);
  });
});
