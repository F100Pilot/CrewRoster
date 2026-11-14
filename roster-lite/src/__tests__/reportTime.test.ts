import { describe, expect, it } from 'vitest';
import { reportFromDt } from '../parsing/pdf/reportTime';
import type { ParsedDuty } from '../domain/types';

const leg = (dep: string, arr: string, type = 'Flight Duty'): ParsedDuty => ({
  date: '2026-10-02', dutyCode: 'FLT', dutyType: type, flightNumber: 'TP9000', departureAirport: 'LIS', arrivalAirport: 'OPO',
  departureTime: dep, arrivalTime: arr, reportingTime: null, aircraftType: 'E90', observations: null,
} as ParsedDuty);

// User's audio (Nov 2026): a 13:55 report for a 15:10 take-off — the app assumed 14:10, and the 13:55 is what gives the
// lunch. The report comes back from the printed [DT]: last arrival + 30 min − DT.
describe('report time from the printed [DT]', () => {
  it('reads a 1h15 report', () => {
    // 15:10–17:00, release 17:30, DT 3h35 → report 13:55.
    expect(reportFromDt([leg('15:10', '17:00')], 215)).toBe('13:55');
  });

  it('gives the hour before on an ordinary day (a real October one: DT 7h30)', () => {
    expect(reportFromDt([leg('07:15', '09:45'), leg('10:30', '13:15')], 450)).toBe('06:15');
  });

  it('follows a duty past midnight', () => {
    // 22:00–23:30, 00:20–01:40: release 02:10, DT 5h10 → report 21:00.
    expect(reportFromDt([leg('22:00', '23:30'), leg('00:20', '01:40')], 310)).toBe('21:00');
  });

  it('leaves it alone when the [DT] can’t be trusted for it', () => {
    expect(reportFromDt([leg('15:10', '17:00')], undefined)).toBeNull();
    expect(reportFromDt([leg('15:10', '17:00')], 600)).toBeNull(); // a 6h40 lead
    const sim = { ...leg('08:00', '12:00'), dutyType: 'Simulator' } as ParsedDuty;
    expect(reportFromDt([sim, leg('15:10', '17:00')], 600)).toBeNull();
  });
});
