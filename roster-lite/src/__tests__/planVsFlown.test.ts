import { describe, expect, it } from 'vitest';
import { asPlanned, planVsFlown } from '../domain/planVsFlown';
import type { ParsedDuty, PlannedTimes } from '../domain/types';

const leg = (
  date: string, from: string, to: string, off: string, on: string,
  opts: { report?: string; planned?: Partial<PlannedTimes> } = {},
): ParsedDuty => ({
  date, dutyCode: 'FLT', dutyType: 'Flight Duty', flightNumber: `TP${from}${to}`,
  departureAirport: from, arrivalAirport: to, departureTime: off, arrivalTime: on,
  reportingTime: opts.report ?? null, aircraftType: 'E90', observations: null,
  ...(opts.planned ? { planned: { reportingTime: opts.report ?? null, departureTime: off, arrivalTime: on, ...opts.planned }, settled: true } : {}),
});

// 5 Oct 2026 (summer time, LT = UTC+1): report 05:00z = 06:00 LT, four sectors → 12:00 max.
const longDay = (lastOn: string, planned = true) => [
  leg('2026-10-05', 'LIS', 'OPO', '05:45', '06:45', { report: '05:00' }),
  leg('2026-10-05', 'OPO', 'LIS', '07:30', '08:30'),
  leg('2026-10-05', 'LIS', 'FAO', '10:00', '11:00'),
  leg('2026-10-05', 'FAO', 'LIS', '15:30', lastOn, planned ? { planned: { arrivalTime: '16:30' } } : {}),
];

describe('planVsFlown', () => {
  it('measures each sector against its plan', () => {
    const duties = [leg('2026-10-02', 'LIS', 'OPO', '07:30', '08:40', { report: '06:15', planned: { departureTime: '07:00', arrivalTime: '08:00' } })];
    const r = planVsFlown(duties, '2026-10', '2026-10-29');
    expect(r.hasPlan).toBe(true);
    expect(r.sectors[0]).toMatchObject({ depDelay: 30, arrDelay: 40, plannedOff: '07:00', off: '07:30' });
    expect(r.late).toBe(1);
    expect(asPlanned(duties)[0].departureTime).toBe('07:00');
  });

  it('reads a delay across midnight as a delay', () => {
    const duties = [leg('2026-10-02', 'LIS', 'OPO', '23:50', '00:20', { report: '23:00', planned: { departureTime: '23:30', arrivalTime: '23:59' } })];
    expect(planVsFlown(duties, '2026-10', '2026-10-29').sectors[0]).toMatchObject({ depDelay: 20, arrDelay: 21 });
  });

  it("flags a commander's extension and the longer rest it owes (cl. 27)", () => {
    // Planned FDP 11:30, flown 12:40 → 40 min over the 12:00 maximum.
    const duties = [...longDay('17:40'), leg('2026-10-06', 'LIS', 'OPO', '06:45', '07:45', { report: '06:00' })];
    const r = planVsFlown(duties, '2026-10', '2026-10-29');
    expect(r.extensions).toEqual([{ date: '2026-10-05', fdp: 760, max: 720, over: 40 }]);
    expect(r.extraDuty).toBe(70);
    // Planned rest 17:00z → 06:00z = 13h against a 12h minimum; flown 18:10z → 06:00z = 11:50,
    // and the minimum grew by twice the 40 min exceeded → 13:20, so 90 min cut.
    expect(r.reductions).toEqual([{ date: '2026-10-06', rest: 710, required: 800, cut: 90, away: false }]);
  });

  it('counts nothing without a plan on record, nor a rest the plan already left short', () => {
    const noPlan = [...longDay('17:40', false), leg('2026-10-06', 'LIS', 'OPO', '06:45', '07:45', { report: '06:00' })];
    const r = planVsFlown(noPlan, '2026-10', '2026-10-29');
    expect(r).toMatchObject({ hasPlan: false, extensions: [], reductions: [], extraDuty: 0 });
    // Planned to end 17:00z with a 04:30z report next day — short in the plan itself.
    const shortPlan = [...longDay('17:10'), leg('2026-10-06', 'LIS', 'OPO', '05:15', '06:15', { report: '04:30' })];
    expect(planVsFlown(shortPlan, '2026-10', '2026-10-29').reductions).toEqual([]);
  });

  it('keeps to the month and to days already flown', () => {
    const duties = [leg('2026-10-28', 'LIS', 'OPO', '07:30', '08:40', { planned: { departureTime: '07:00', arrivalTime: '08:00' } })];
    expect(planVsFlown(duties, '2026-09', '2026-10-29').hasPlan).toBe(false);
    expect(planVsFlown(duties, '2026-10', '2026-10-27').sectors).toEqual([]);
  });
});
