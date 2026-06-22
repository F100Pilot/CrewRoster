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
