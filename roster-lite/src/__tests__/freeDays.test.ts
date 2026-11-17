import { describe, expect, it } from 'vitest';
import { freeDayCounts } from '../domain/dutyStats';
import type { ParsedDuty } from '../domain/types';

const d = (date: string, dutyCode: string, dutyType: string): ParsedDuty => ({
  date, dutyCode, dutyType, reportingTime: null, departureTime: null, arrivalTime: null, flightNumber: null,
  departureAirport: null, arrivalAirport: null, aircraftType: null, observations: null,
});

describe('freeDayCounts', () => {
  it('splits folgas, PLS and holidays by day', () => {
    const c = freeDayCounts([
      d('2026-12-01', 'W_OFF', 'Day Off'),
      d('2026-12-02', 'OFF_RQST', 'Day Off'),
      d('2026-12-03', 'X', 'Day Off'),
      d('2026-12-04', 'PLS_RECOV', 'Day Off'),
      d('2026-12-05', 'F', 'Vacation'),
      d('2026-12-06', 'PLIC', 'Vacation'),
      d('2026-12-07', 'H509', 'Standby Home'),
      // A day off with service on it (a flight after a folga in the same column) counts as none.
      d('2026-12-08', 'W_OFF', 'Day Off'), d('2026-12-08', 'TP9001', 'Flight Duty'),
      d('2026-12-09', 'FAL', 'Absence'),
    ]);
    expect(c).toEqual({ folga: 3, pls: 1, ferias: 2 });
  });
});
