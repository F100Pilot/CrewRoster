import { describe, expect, it } from 'vitest';
import { easterSunday, nationalHolidays } from '../domain/holidaysPT';
import { DEFAULT_PAY_SETTINGS, autoHolidayPayMonth, instructorSimDates, netEstimate, overtimeValue, payEstimate, MONTH_PLAFONDS, type PaySettings } from '../domain/payEstimate';
import { irsRetention } from '../domain/irsWithholding';
import type { ParsedDuty } from '../domain/types';

const S: PaySettings = { ...DEFAULT_PAY_SETTINGS, enabled: true, vb: 5000, ve: 200, vs: 100, extras: 0 };

const duty = (date: string, dutyType: string, extra: Partial<ParsedDuty> = {}): ParsedDuty => ({
  date, dutyType, dutyCode: dutyType === 'Day Off' ? 'OFF' : dutyType === 'Vacation' ? 'PLIC' : 'FLT',
  reportingTime: null, departureTime: null, arrivalTime: null, flightNumber: null,
  departureAirport: null, arrivalAirport: null, aircraftType: null, observations: null, ...extra,
});
const leg = (date: string, from: string, to: string, off: string, on: string, report: string | null = null) =>
  duty(date, 'Flight Duty', { flightNumber: `TP${from}${to}`, departureAirport: from, arrivalAirport: to, departureTime: off, arrivalTime: on, reportingTime: report });

describe('holidaysPT', () => {
  it('finds Easter and the movable holidays', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2025)).toBe('2025-04-20');
    const h = nationalHolidays(2026);
    expect(h.has('2026-04-03')).toBe(true); // Sexta-feira Santa
    expect(h.has('2026-06-04')).toBe(true); // Corpo de Deus
    expect(h.has('2026-12-08')).toBe(true);
    expect(h.size).toBe(13);
  });
});

describe('payEstimate', () => {
  it('pays the hours between the limits at 3% of the VB and above Limite 2 at 6%', () => {
    const p = MONTH_PLAFONDS[30];
    expect(overtimeValue(p.dutyL1, p.dutyL1, p.dutyL2, 5000)).toBe(0);
    // 5h into band 1 → 5 × 150 €; then 2h above Limite 2 → 10h × 150 + 2h × 300.
    expect(overtimeValue(p.dutyL1 + 300, p.dutyL1, p.dutyL2, 5000)).toBeCloseTo(750);
    expect(overtimeValue(p.dutyL2 + 120, p.dutyL1, p.dutyL2, 5000)).toBeCloseTo(1500 + 600);
  });

  it('counts per diem A on flying days, B on layover days, and tops up to 5 with the complement', () => {
    const duties = [
      leg('2026-11-02', 'LIS', 'OPO', '07:00', '08:00', '06:15'), // A, ends away
      duty('2026-11-03', 'Day Off'), // still in OPO → B
      leg('2026-11-04', 'OPO', 'LIS', '07:00', '08:00', '06:15'), // A, back at base
      duty('2026-11-05', 'Day Off'), // at base → nothing
    ];
    const r = payEstimate(duties, '2026-11', S, '2026-11-30');
    expect(r).toMatchObject({ perDiemA: 2, perDiemB: 1, complementDays: 2 });
    expect(r.perDiemValue).toBeCloseTo(2 * S.perDiemA + S.perDiemB);
    expect(r.complementValue).toBeCloseTo(2 * S.perDiemA);
    expect(r.rb).toBe(5300);
  });

  it('pays office days and a tax-free meal ticket per ground day at base', () => {
    const gab = (date: string) => [
      duty(date, 'Office Duty', { dutyCode: 'GAB1', departureAirport: 'LIS', departureTime: '07:30', arrivalTime: '11:00' }),
      duty(date, 'Office Duty', { dutyCode: 'GAB2', departureAirport: 'LIS', departureTime: '12:00', arrivalTime: '15:30' }),
    ];
    const s = { ...S, officeDay: 160 };
    const r = payEstimate([...gab('2026-05-11'), ...gab('2026-05-12'), ...gab('2026-05-15')], '2026-05', s, '2026-05-31');
    expect(r).toMatchObject({ officeDays: 3, officeValue: 480, mealTicketDays: 3, mealTicketValue: 31.38 });
    // The tickets go onto the meal card: no IRS, no SS, and they leave the transfer.
    const withTickets = netEstimate(r, s);
    const without = netEstimate({ ...r, variable: r.variable - r.mealTicketValue, mealTicketValue: 0 }, s);
    expect(withTickets.irsBase).toBeCloseTo(without.irsBase);
    expect(withTickets.ssBase).toBeCloseTo(without.ssBase);
    expect(withTickets.mealCard).toBeCloseTo(31.38);
    expect(withTickets.net).toBeCloseTo(without.net);
  });

  it('counts a simulator away from base as per diem A away (partly tax-free)', () => {
    const duties = [
      { ...leg('2026-05-03', 'LIS', 'FRA', '07:25', '10:21', '06:25'), dutyType: 'Positioning' },
      duty('2026-05-04', 'Simulator', { dutyCode: 'SIM', departureAirport: 'FRA', departureTime: '04:35', arrivalTime: '08:35' }),
      { ...leg('2026-05-05', 'FRA', 'LIS', '11:43', '15:06', '10:43'), dutyType: 'Positioning' },
    ];
    const r = payEstimate(duties, '2026-05', S, '2026-05-31');
    expect(r.perDiemA).toBe(3);
    expect(r.perDiemTravel.map((d) => [d.date, d.abroad])).toEqual([['2026-05-03', true], ['2026-05-04', true], ['2026-05-05', true]]);
  });

  it('gives per diem A to the day a night duty runs into', () => {
    const duties = [leg('2026-11-10', 'LIS', 'FNC', '22:30', '00:30', '21:30'), duty('2026-11-11', 'Day Off')];
    const r = payEstimate(duties, '2026-11', S, '2026-11-30');
    // 10th flying; 11th: the duty ran past Lisbon midnight (and the pilot is away, too).
    expect(r.perDiemA).toBe(2);
  });

  it('adds 25% of the duty between 23:00 and 06:00, and 100% on a holiday', () => {
    // 2 Nov 2026 (winter time: Lisbon = UTC). Report 21:30z, on blocks 00:30z + 30 min debrief:
    // 3h30 of duty, of which 23:00–01:00 (2h) at night → +30 min.
    const night = payEstimate([leg('2026-11-02', 'LIS', 'FNC', '22:30', '00:30', '21:30')], '2026-11', S, '2026-11-30');
    expect(night.duty.credited).toBe(210 + 30);
    // 1 Dec is a holiday: a 06:15–08:30 duty counts twice.
    const hol = payEstimate([leg('2026-12-01', 'LIS', 'OPO', '07:00', '08:00', '06:15')], '2026-12', S, '2026-12-31');
    expect(hol.duty.credited).toBe(2 * (105 + 30));
    expect(hol.block.credited).toBe(120);
  });

  it('cuts the plafonds by the holidays taken and picks the more favourable credit', () => {
    const duties = [duty('2026-11-20', 'Vacation'), duty('2026-11-21', 'Vacation')];
    const r = payEstimate(duties, '2026-11', S, '2026-11-30');
    expect(r.holidayDays).toBe(2);
    expect(r.duty.l1).toBe(MONTH_PLAFONDS[30].dutyL1 - 2 * 217);
    expect(r.block.l2).toBe(MONTH_PLAFONDS[30].blockL2 - 2 * 150);
    expect(r.overtime).toBeNull();
    expect(r.covered).toBe(true);
    expect(payEstimate(duties, '2026-10', S, '2026-11-30').covered).toBe(false);
  });

  it('pays per diem B on FP sessions and office duty, A on the simulator', () => {
    const duties = [
      duty('2026-11-12', 'Training', { dutyCode: 'FP1_INST', departureTime: '08:00', arrivalTime: '11:20', reportingTime: '08:00' }),
      duty('2026-11-12', 'Training', { dutyCode: 'FP2_INST', departureTime: '12:20', arrivalTime: '17:00', reportingTime: '12:20' }),
      duty('2026-11-13', 'Training', { dutyCode: 'FP1', departureTime: '09:00', arrivalTime: '12:20', reportingTime: '09:00' }),
      duty('2026-11-14', 'Office Duty', { dutyCode: 'GAB1', departureTime: '08:30', arrivalTime: '12:00', reportingTime: '08:30' }),
      duty('2026-11-16', 'Simulator', { dutyCode: 'LIS-EBT-1', departureTime: '08:00', arrivalTime: '12:00', reportingTime: '08:00' }),
    ];
    const r = payEstimate(duties, '2026-11', { ...S, instructorSession: 550 }, '2026-11-30');
    // FP…_INST is ground training given, not a simulator session: no instructor fee.
    expect(r).toMatchObject({ perDiemA: 1, perDiemB: 3, instructorSessions: 0, instructorValue: 0 });
  });

  it('counts simulator sessions as instructor from the check mark and the check\'s second day', () => {
    const sim = (date: string, observations: string | null) =>
      duty(date, 'Simulator', { dutyCode: 'LIS-EBT-1', departureTime: '08:00', arrivalTime: '12:00', reportingTime: '08:00', observations });
    const duties = [
      sim('2026-09-01', 'OPC, OPC_INS'), sim('2026-09-02', null), // gives an OPC: both days paid
      sim('2026-09-03', 'OPC_INS'), sim('2026-09-04', null),
      sim('2026-09-07', 'OPC'), sim('2026-09-08', null), // his own OPC: neither paid
      sim('2026-09-20', null), // unmarked, nothing before it: not counted
    ];
    expect([...instructorSimDates(duties)]).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
    expect(payEstimate(duties, '2026-09', { ...S, instructorSession: 550 }, '2026-11-30').instructorValue).toBe(2200);
  });

  it('pays line training once per day of flights flown as instructor', () => {
    const ins = (date: string, from: string, to: string, off: string, on: string, mark: string | null) =>
      ({ ...leg(date, from, to, off, on), observations: mark });
    const duties = [
      ins('2026-09-16', 'LIS', 'LGW', '12:22', '15:18', 'FAM_INS'), ins('2026-09-16', 'LGW', 'LIS', '16:06', '18:28', 'FAM_INS'),
      ins('2026-09-26', 'LIS', 'NCE', '07:14', '09:40', null),
      ins('2026-09-27', 'LIS', 'TFS', '11:22', '14:05', 'LIFUS_INS'),
    ];
    const r = payEstimate(duties, '2026-09', { ...S, lineTrainingDay: 130 }, '2026-11-30');
    expect(r).toMatchObject({ lineTrainingDays: 2, lineTrainingValue: 260 });
  });

  it('pays the Christmas subsidy (one RB) on the November payslip, taxed apart (cl. 8)', () => {
    const nov = payEstimate([duty('2026-10-02', 'Day Off')], '2026-10', S, '2026-10-31'); // work of Oct → Nov payslip
    expect(nov).toMatchObject({ christmasSubsidy: 5300, holidaySubsidy: 0 });
    expect(payEstimate([duty('2026-11-02', 'Day Off')], '2026-11', S, '2026-11-30').christmasSubsidy).toBe(0);
    const n = netEstimate(nov, S);
    const plain = netEstimate({ ...nov, christmasSubsidy: 0 }, S);
    expect(n.gross).toBeCloseTo(plain.gross + 5300);
    expect(n.irs).toBe(plain.irs); // the month's own withholding doesn't change…
    expect(n.subsidyIrs).toBe(irsRetention(5300, 'I', 0)); // …the subsidy has its own
    expect(n.ss).toBeCloseTo(plain.ss + 583);
  });

  it('takes the subsidies on all the fixed lines, the chief bonus included', () => {
    const s = { ...S, extras: 700 };
    expect(payEstimate([duty('2026-10-02', 'Day Off')], '2026-10', s, '2026-10-31').christmasSubsidy).toBe(6000);
  });

  it('applies the pension plan to the subsidies too — 14 times a year (cl. 16.2)', () => {
    const s = { ...S, pensionAuto: true };
    const nov = payEstimate([duty('2026-10-02', 'Day Off')], '2026-10', s, '2026-10-31');
    const n = netEstimate(nov, s);
    const plain = netEstimate({ ...nov, christmasSubsidy: 0 }, s);
    expect(n.pensionDeposit).toBeCloseTo(plain.pensionDeposit * 2);
    expect(n.gross).toBeCloseTo(plain.gross + 5300 + 344.5); // + the PGA's 6,5% on the subsidy
  });

  it('pays the holiday subsidy the month before the first holidays of 10 working days (cl. 7)', () => {
    // 6–19 July 2026: 14 calendar days, 10 working days → paid on the June payslip (work of May),
    // for the 42 holiday days: 5300 ÷ 30 × 42.
    const july = Array.from({ length: 14 }, (_, i) => duty(`2026-07-${String(6 + i).padStart(2, '0')}`, 'Vacation'));
    expect(autoHolidayPayMonth(july, 2026)).toBe(6);
    expect(autoHolidayPayMonth(july.slice(0, 10), 2026)).toBe(0); // 8 working days only
    // A weekend left as a day off doesn't break the run.
    const split = july.filter((d) => d.date !== '2026-07-11' && d.date !== '2026-07-12');
    expect(autoHolidayPayMonth(split, 2026)).toBe(6);
    expect(payEstimate(july, '2026-05', S, '2026-05-31').holidaySubsidy).toBe(7420);
    expect(payEstimate(july, '2026-06', S, '2026-06-30').holidaySubsidy).toBe(0);
    // Ticked by hand on the card, it wins over the roster — and an untick (month 0) cancels it.
    expect(payEstimate(july, '2026-07', { ...S, holidayPay: { year: 2026, month: 8 } }, '2026-07-31').holidaySubsidy).toBe(7420);
    // Only one payslip a year carries it: ticking August takes it off the roster's June.
    expect(payEstimate(july, '2026-05', { ...S, holidayPay: { year: 2026, month: 8 } }, '2026-05-31')).toMatchObject({ holidaySubsidy: 0, holidayPayMonth: 8 });
    expect(payEstimate(july, '2026-05', { ...S, holidayPay: { year: 2026, month: 0 } }, '2026-05-31').holidaySubsidy).toBe(0);
    // A tick from another year doesn't count.
    expect(payEstimate(july, '2026-05', { ...S, holidayPay: { year: 2025, month: 8 } }, '2026-05-31')).toMatchObject({ holidaySubsidy: 7420, holidayPayAuto: true });
  });
});
