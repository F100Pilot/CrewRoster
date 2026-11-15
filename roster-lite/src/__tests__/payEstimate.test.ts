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

  it('gives no meal ticket on a medical day, though it pays per diem B', () => {
    const r = payEstimate([
      duty('2026-09-09', 'Medical', { dutyCode: 'IM', departureAirport: 'LIS', departureTime: '07:00', arrivalTime: '11:00' }),
      duty('2026-09-21', 'Office Duty', { dutyCode: 'GAB1', departureAirport: 'LIS', departureTime: '08:30', arrivalTime: '12:00' }),
    ], '2026-09', S, '2026-10-31');
    expect(r.perDiemDates.b).toEqual(['2026-09-09', '2026-09-21']);
    expect(r.mealTicketDays).toBe(1);
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
    expect(hol.block.credited).toBe(60); // block-pay: no holiday 100% (July 2026 payslip, user 0.9.3.63)
  });

  // RRRGS cl. 12.2 counts "o somatório das percentagens previstas nas seguintes alíneas" and cl. 12.3 only keeps the
  // highest WITHIN an alínea (a colleague, Nov 2026: "as alíneas devem ser somadas, o que está dentro delas não"). So a
  // positioning on a holiday is 50% (a.iv) + 100% (d) = 150% — not 50% of 200%.
  it('adds the holiday 100% to a positioning\'s 50% (alíneas are summed)', () => {
    const dh = { ...leg('2026-12-01', 'LIS', 'OPO', '07:00', '08:00', '06:15'), dutyType: 'Positioning' } as ParsedDuty;
    const r = payEstimate([dh], '2026-12', S, '2026-12-31');
    expect(Math.abs(r.duty.credited - (105 * 0.5 + 105))).toBeLessThanOrEqual(0.5); // credits are whole minutes
    expect(r.block.credited).toBeCloseTo(60 * 0.5, 5); // the holiday only on duty-pay
  });

  // Colleagues, Nov 2026: the base's municipal holiday counts — 13 June from Lisbon, 24 June from Porto ("se for porto e
  // apanhar o dia 24 paga, se não for não; em Lisboa igual") — and a standby on a holiday too ("se for de 10 horas, são
  // 2.5 (25%), como é a dobrar são 5 horas").
  it('adds the base\'s municipal holiday: 13 June from Lisbon, 24 June from Porto', () => {
    // Duty 06:00–08:30z = 150 min; on the holiday twice (the holiday counts on duty-pay only).
    const lis13 = payEstimate([leg('2026-06-13', 'LIS', 'OPO', '07:00', '08:00', '06:00')], '2026-06', S, '2026-06-30', 'LIS');
    expect(lis13.duty.credited).toBe(300);
    expect(lis13.block.credited).toBe(60);
    const opo13 = payEstimate([leg('2026-06-13', 'OPO', 'LIS', '07:00', '08:00', '06:00')], '2026-06', S, '2026-06-30', 'OPO');
    expect(opo13.duty.credited).toBe(150);
    const opo24 = payEstimate([leg('2026-06-24', 'OPO', 'LIS', '07:00', '08:00', '06:00')], '2026-06', S, '2026-06-30', 'OPO');
    expect(opo24.duty.credited).toBe(300);
  });

  it('adds Carnival (Shrove Tuesday, Easter − 47 days) as a holiday — user, Nov 2026', () => {
    // Easter 2027 = 28 Mar → Carnival = 9 Feb 2027 (winter: Lisbon = UTC).
    const r = payEstimate([leg('2027-02-09', 'LIS', 'OPO', '07:00', '08:00', '06:00')], '2027-02', S, '2027-02-28');
    expect(r.duty.credited).toBe(300);
  });

  it('doubles a home standby on a holiday: 10 h at 25% = 2h30, on a holiday 5 h', () => {
    // 1 Dec (winter: Lisbon = UTC), standby at home 08:00–18:00.
    const sby = duty('2026-12-01', 'Standby Home', { dutyCode: 'H7+', departureAirport: 'LIS', departureTime: '08:00', arrivalTime: '18:00' });
    expect(payEstimate([sby], '2026-12', S, '2026-12-31').duty.credited).toBe(300);
    const plain = duty('2026-12-02', 'Standby Home', { dutyCode: 'H7+', departureAirport: 'LIS', departureTime: '08:00', arrivalTime: '18:00' });
    expect(payEstimate([plain], '2026-12', S, '2026-12-31').duty.credited).toBe(150);
  });

  it('adds the holiday 100% only to the time between 00:00 and 23:59 of the holiday (Lisbon), on duty-pay only', () => {
    // 14 Aug, duty 21:30–00:20z = 22:30–01:20 in Lisbon (summer): its last 80 min fall on 15 Aug (holiday).
    const r = payEstimate([leg('2026-08-14', 'FNC', 'LIS', '22:30', '23:50', '21:30')], '2026-08', S, '2026-08-31');
    const plain = payEstimate([leg('2026-08-10', 'FNC', 'LIS', '22:30', '23:50', '21:30')], '2026-08', S, '2026-08-31');
    expect(r.duty.credited - plain.duty.credited).toBe(80);
    expect(r.block.credited).toBe(80);
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

  it('leaves out of the duty-pay the gap between a flight duty (on-blocks + 30 min) and the e-learning after it', () => {
    // An expert, from the company's monthly map of hours: "a diferença entre os 30 minutos depois de calços e o início da
    // formação não conta". Report 03:05, on-blocks 06:44 → flight duty ends 07:14; e-learning 07:30–08:00.
    const flight = leg('2026-06-28', 'NCE', 'LIS', '04:05', '06:44', '03:05');
    const learn = duty('2026-06-28', 'Training', { dutyCode: 'FPE-LEARN', departureAirport: 'LIS', departureTime: '07:30', arrivalTime: '08:00' });
    // The flight duty (03:05–07:14) carries its night premium either way; the e-learning adds its 30 min only, not 07:14–08:00.
    const alone = payEstimate([flight], '2026-06', S, '2026-06-30').duty.credited;
    const both = payEstimate([flight, learn], '2026-06', S, '2026-06-30').duty.credited;
    expect(both - alone).toBe(30); // was 46: the 16 min between 07:14 and 07:30 counted
  });

  it('cuts the plafonds by each office (GAB) day like a day of holidays — user, 0.9.3.63', () => {
    const gab = (date: string) => duty(date, 'Office Duty', { dutyCode: 'GAB1', departureAirport: 'LIS', departureTime: '08:30', arrivalTime: '12:00' });
    // June 2026: 6 GAB days + 1 day of holidays → block Limite 1 = 60h − 7 × 2h = 46h (the July payslip paid 13 min over).
    const duties = [gab('2026-06-02'), gab('2026-06-03'), gab('2026-06-12'), gab('2026-06-19'), gab('2026-06-25'), gab('2026-06-29'),
      duty('2026-06-20', 'Vacation')];
    const r = payEstimate(duties, '2026-06', S, '2026-11-30');
    expect(r).toMatchObject({ holidayDays: 1, officeCutDays: 6 });
    expect(r.block.l1).toBe(46 * 60);
    expect(r.duty.l1).toBe(MONTH_PLAFONDS[30].dutyL1 - 7 * 217);
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

  it('counts one line check per day of flights marked W_INS (the examiner), apart from line training', () => {
    const mk = (date: string, from: string, to: string, off: string, on: string, mark: string | null) =>
      ({ ...leg(date, from, to, off, on), observations: mark });
    // A W_PNT day: W_INS on both legs → one line check; another day → a second one.
    const duties = [
      mk('2026-09-21', 'LIS', 'RAK', '08:00', '09:35', 'W_INS'), mk('2026-09-21', 'RAK', 'LIS', '10:45', '12:25', 'W_INS'),
      mk('2026-09-22', 'LIS', 'BIO', '14:20', '16:00', 'W_INS'),
      mk('2026-09-27', 'LIS', 'TFS', '11:22', '14:05', 'LIFUS_INS'),
    ];
    const s = { ...S, lineCheck: 200, lineTrainingDay: 130 };
    expect(payEstimate(duties, '2026-09', s, '2026-11-30')).toMatchObject({
      lineChecks: 2, lineChecksAuto: 2, lineCheckValue: 400, lineTrainingDays: 1, lineTrainingValue: 130,
    });
    // The pilot's correction for the month wins over the roster's count.
    expect(payEstimate(duties, '2026-09', { ...s, lineChecks: { '2026-09': 3 } }, '2026-11-30'))
      .toMatchObject({ lineChecks: 3, lineChecksAuto: 2, lineCheckValue: 600 });
  });

  it('counts FAM_INS + LIFUS_INS on the same legs as a line check, not line training (June 2026 payslip)', () => {
    const mk = (date: string, from: string, to: string, off: string, on: string, mark: string | null) =>
      ({ ...leg(date, from, to, off, on), observations: mark });
    // May 2026: two LIFUS_INS days paid "Line Training" (2 × 130), the FAM_INS + LIFUS_INS day "LCC Line Check" (1 × 200).
    const duties = [
      mk('2026-05-02', 'LIS', 'BRU', '07:00', '09:20', 'LIFUS_INS, FO_SAFETY'),
      mk('2026-05-16', 'LIS', 'RAK', '08:26', '10:01', 'FO_SAFETY, FAM_INS, LIFUS_INS'), mk('2026-05-16', 'RAK', 'LIS', '10:53', '12:30', 'FAM_INS, LIFUS_INS'),
      mk('2026-05-23', 'LIS', 'OPO', '06:30', '07:25', 'LIFUS_INS'),
    ];
    expect(payEstimate(duties, '2026-05', { ...S, lineCheck: 200, lineTrainingDay: 130 }, '2026-11-30')).toMatchObject({
      lineChecks: 1, lineCheckValue: 200, lineTrainingDays: 2, lineTrainingValue: 260,
    });
    // FAM_INS alone stays line training (June and September 2026 payslips).
    const fam = [mk('2026-06-01', 'LIS', 'GVA', '07:52', '10:10', 'FAM_INS'), mk('2026-06-01', 'GVA', 'LIS', '11:09', '13:45', 'FAM_INS')];
    expect(payEstimate(fam, '2026-06', { ...S, lineCheck: 200, lineTrainingDay: 130 }, '2026-11-30')).toMatchObject({ lineChecks: 0, lineTrainingDays: 1 });
  });

  it('pays the line checks the pilot counted for the month', () => {
    const s = { ...S, lineCheck: 200, lineChecks: { '2026-09': 2 } };
    const sep = payEstimate([duty('2026-09-02', 'Day Off')], '2026-09', s, '2026-11-30');
    expect(sep).toMatchObject({ lineChecks: 2, lineCheckValue: 400 });
    expect(netEstimate(sep, s).gross - netEstimate(payEstimate([duty('2026-09-02', 'Day Off')], '2026-09', S, '2026-11-30'), S).gross).toBe(400);
    expect(payEstimate([duty('2026-10-02', 'Day Off')], '2026-10', s, '2026-11-30')).toMatchObject({ lineChecks: 0, lineCheckValue: 0 });
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

// A January 2026 payslip (work of December 2025): the ground training given (FP…_INST) was paid apart as
// "Instrução em terra" (hours × an hourly fee) and there was no duty-pay — those days stay out of the plafonds.
describe('instrução em terra (FP…_INST)', () => {
  const inst = (date: string, code: string, from: string, to: string) =>
    duty(date, 'Training', { dutyCode: code, departureAirport: 'LIS', reportingTime: from, departureTime: from, arrivalTime: to });

  it('pays the sessions by the hour and leaves the day out of the duty-pay credit', () => {
    const duties = [
      inst('2025-12-18', 'FP1_INST', '09:00', '13:10'),
      inst('2025-12-18', 'FP2_INST', '14:10', '16:10'),
      leg('2025-12-21', 'LIS', 'OPO', '16:00', '17:00', '15:00'),
    ];
    const r = payEstimate(duties, '2025-12', { ...S, groundInstructionHour: 60 }, '2025-12-31');
    expect(r.groundInstructionMinutes).toBe(370); // 4h10 + 2h00, the lunch between them left out
    expect(r.groundInstructionHours).toBe(6.17);
    expect(r.groundInstructionValue).toBeCloseTo(370.2, 2);
    expect(r.duty.credited).toBe(120 + 30); // only the flying day: report → on-blocks + 30 min
  });

  it('shows the hours with no fee typed, at 0 €', () => {
    const r = payEstimate([inst('2025-12-03', 'FP1_INST', '09:00', '13:10')], '2025-12', S, '2025-12-31');
    expect(r.groundInstructionHours).toBe(4.17);
    expect(r.groundInstructionValue).toBe(0);
  });

  it('pays per diem B for an e-learning only when it is the refresher (RGTC) — colleague + user, Nov 2026', () => {
    const learn = (date: string, obs: string | null, code = 'FPE-LEARN') =>
      duty(date, 'Training', { dutyCode: code, departureAirport: 'LIS', departureTime: '09:00', arrivalTime: '11:00', observations: obs });
    const s = { ...S, mealTicket: 10.46 };
    // "Se for só FPE-LEARN, não paga": no per diem, no meal ticket; still duty.
    const plain = payEstimate([learn('2026-10-06', null)], '2026-10', s, '2026-11-30');
    expect(plain).toMatchObject({ perDiemB: 0, mealTicketDays: 0 });
    expect(plain.duty.credited).toBe(120);
    // RGTC beside it (the refresher's e-learning), or in its code: per diem B and the meal ticket.
    expect(payEstimate([learn('2026-10-06', 'RGTC')], '2026-10', s, '2026-11-30')).toMatchObject({ perDiemB: 1, mealTicketDays: 1 });
    expect(payEstimate([learn('2026-10-06', null, 'RGTC-LEARN')], '2026-10', s, '2026-11-30')).toMatchObject({ perDiemB: 1 });
    // Presential refresher sessions (RGTC1 / RGTC2) pay as before.
    expect(payEstimate([inst('2026-10-07', 'RGTC1', '08:30', '12:55')], '2026-10', s, '2026-11-30').perDiemB).toBe(1);
  });

  it('keeps ground training as a trainee (no _INST) in the duty-pay', () => {
    const r = payEstimate([inst('2026-03-03', 'RGTC1', '08:30', '12:55')], '2026-03', S, '2026-03-31');
    expect(r.groundInstructionMinutes).toBe(0);
    expect(r.duty.credited).toBe(265);
  });
});

// "Subs. gabinete": which GAB days of the month are paid, by their order (user: with one chief bonus the 1st and 2nd
// aren't paid, the 3rd to the 7th are, from the 8th none). Synthetic fee.
describe('subsídio de gabinete por ordem do dia', () => {
  const gab = (day: number) => duty(`2026-05-${String(day).padStart(2, '0')}`, 'Office Duty', { dutyCode: 'GAB1', departureAirport: 'LIS', reportingTime: '09:30', departureTime: '09:30', arrivalTime: '13:00' });
  const seven = [11, 12, 15, 18, 21, 22, 29].map(gab);

  it('pays only the 3rd to the 7th GAB day', () => {
    const r = payEstimate(seven, '2026-05', { ...S, officeDay: 100, officeDayFrom: 3, officeDayTo: 7 }, '2026-05-31');
    expect(r.officeDays).toBe(7);
    expect(r.officePaidDays).toBe(5);
    expect(r.officeValue).toBe(500);
  });

  it('pays nothing for two GAB days from the 3rd on', () => {
    const r = payEstimate(seven.slice(0, 2), '2026-05', { ...S, officeDay: 100, officeDayFrom: 3, officeDayTo: 7 }, '2026-05-31');
    expect(r.officePaidDays).toBe(0);
    expect(r.officeValue).toBe(0);
  });

  it('pays every GAB day by default', () => {
    const r = payEstimate(seven, '2026-05', { ...S, officeDay: 100 }, '2026-05-31');
    expect(r.officePaidDays).toBe(7);
  });
});

// A January 2026 payslip: December's variable is income of the year before, withheld apart at its own rate
// ("Ded. fisc. per. ant."); the fixed pay alone takes the month's table rate.
describe('IRS de janeiro: variável de dezembro à parte', () => {
  const days = [
    leg('2025-12-02', 'LIS', 'OPO', '07:00', '08:00', '06:00'),
    leg('2025-12-02', 'OPO', 'LIS', '09:00', '10:00'),
  ];
  const settings: PaySettings = { ...S, vb: 7000, ve: 1200, vs: 1300, instructorSession: 550 };

  it('withholds the fixed pay and the variable separately in the December work month', () => {
    const r = payEstimate(days, '2025-12', settings, '2025-12-31');
    const n = netEstimate(r, settings);
    expect(n.priorYearIrsBase).toBeGreaterThan(0);
    expect(n.irs).toBe(irsRetention(n.irsBase, 'I', 0));
    expect(n.priorYearIrs).toBe(irsRetention(n.priorYearIrsBase, 'I', 0));
    // Apart, each at its own (lower) rate: less than one sum at one rate.
    expect(n.irs + n.priorYearIrs).toBeLessThan(irsRetention(n.irsBase + n.priorYearIrsBase, 'I', 0));
    expect(n.net).toBeCloseTo(n.gross - n.irs - n.priorYearIrs - n.ss - n.pensionDeposit - n.union - n.fixedDeductions - n.mealCard, 2);
  });

  it('keeps one sum in any other month', () => {
    const nov = days.map((d) => ({ ...d, date: '2025-11-04' }));
    const n = netEstimate(payEstimate(nov, '2025-11', settings, '2025-11-30'), settings);
    expect(n.priorYearIrs).toBe(0);
    expect(n.priorYearIrsBase).toBe(0);
  });
});

// January 2026 (task force): seven simulator days, five given and two received — all seven paid.
describe('todas as sessões de simulador pagas (taskforce)', () => {
  const sim = (date: string, obs: string | null = null) => duty(date, 'Simulator', { dutyCode: 'E90-VIE-1', departureAirport: 'VIE', reportingTime: '09:45', departureTime: '09:45', arrivalTime: '13:45', observations: obs });
  const jan = [sim('2026-01-04'), sim('2026-01-05'), sim('2026-01-11', 'LPC_INS'), sim('2026-01-12'), sim('2026-01-25'), sim('2026-01-26', 'OPC_INS'), sim('2026-01-27')];

  it('counts only the marked sessions and their 2nd day by default', () => {
    expect(payEstimate(jan, '2026-01', { ...S, instructorSession: 100 }, '2026-01-31').instructorSessions).toBe(4);
  });

  it('counts every simulator day when all are paid', () => {
    const r = payEstimate(jan, '2026-01', { ...S, instructorSession: 100, allSimsPaid: true }, '2026-01-31');
    expect(r.instructorSessions).toBe(7);
    expect(r.instructorValue).toBe(700);
  });
});

// The January and February 2026 payslips (work of December 2025 / January 2026) pay the per diem of the simulator trips
// (a DHC out, the sessions, a DHC home) as "Perdiem A … T", taxed in full even abroad; the flying days keep the exempt
// part. The June–September 2026 ones pay a FRA simulator trip as per diem A away (the May test above).
describe('per diem "T" das deslocações de simulador (até janeiro de 2026)', () => {
  const dh = (date: string, from: string, to: string) => ({ ...leg(date, from, to, '14:27', '17:43', '13:27'), dutyType: 'Positioning' });
  const sim = (date: string) => duty(date, 'Simulator', { dutyCode: 'E90-VIE-1', departureAirport: 'VIE', departureTime: '09:45', arrivalTime: '13:45' });

  it('taxes a simulator trip in full and leaves the flying days partly exempt', () => {
    const duties = [
      dh('2026-01-03', 'LIS', 'VIE'), sim('2026-01-04'), sim('2026-01-05'), dh('2026-01-06', 'VIE', 'LIS'),
      leg('2026-01-15', 'LIS', 'CMN', '14:13', '15:27', '13:13'), leg('2026-01-15', 'CMN', 'LIS', '16:10', '17:37'),
    ];
    const r = payEstimate(duties, '2026-01', S, '2026-01-31');
    expect(r.perDiemA).toBe(5);
    expect(r.perDiemTravel.map((d) => d.date)).toEqual(['2026-01-15']);
  });

  it('keeps a simulator trip after March 2026 partly exempt', () => {
    const duties = [dh('2026-05-03', 'LIS', 'FRA'), sim('2026-05-04'), dh('2026-05-05', 'FRA', 'LIS')];
    expect(payEstimate(duties, '2026-05', S, '2026-05-31').perDiemTravel).toHaveLength(3);
  });
});

// April 2026 payslip (work of March): with the task-force option, the pilot's own LPC (10/03, marked LPC without _INS)
// and the day after aren't paid — 6 of 8 sessions.
describe('taskforce: o próprio check não é pago', () => {
  const sim = (date: string, obs: string | null = null) => duty(date, 'Simulator', { dutyCode: 'E90-FRA-1', departureAirport: 'FRA', departureTime: '09:40', arrivalTime: '13:40', observations: obs });
  it('leaves the own LPC and its 2nd day out', () => {
    const mar = [sim('2026-03-10', 'LPC'), sim('2026-03-11'), sim('2026-03-12', 'LPC, LPC_INS'), sim('2026-03-13'), sim('2026-03-17', 'LPC_INS'), sim('2026-03-18'), sim('2026-03-26', 'LPC_INS'), sim('2026-03-27')];
    expect(payEstimate(mar, '2026-03', { ...S, instructorSession: 100, allSimsPaid: true }, '2026-03-31').instructorSessions).toBe(6);
  });
});

// The abonos of a simulator trip aren't taxed (Dec 2025–Mar 2026 payslips, to the cent): only the flying days'.
describe('abonos das viagens de simulador não tributados (até março de 2026)', () => {
  it('drops the trip\'s abonos from the taxable ones', () => {
    const duties = [
      { ...leg('2026-03-09', 'LIS', 'FRA', '12:38', '15:39', '11:38'), dutyType: 'Positioning' },
      duty('2026-03-10', 'Simulator', { dutyCode: 'E90-FRA-1', departureAirport: 'FRA', departureTime: '09:40', arrivalTime: '13:40' }),
      { ...leg('2026-03-11', 'FRA', 'LIS', '12:37', '15:54', '11:37'), dutyType: 'Positioning' },
    ];
    const r = payEstimate(duties, '2026-03', S, '2026-03-31');
    expect(r.perDiemTravel).toHaveLength(0);
    expect(Object.keys(r.abonosByDate)).toHaveLength(0);
  });
});

// The hours of ground instruction paid don't follow the roster (Dec 2025–Apr 2026 payslips): the pilot types the
// payslip's figure for the month on the pay card.
describe('horas de instrução em terra corrigidas pelo piloto', () => {
  const inst = duty('2026-04-14', 'Training', { dutyCode: 'FP1_INST', departureAirport: 'LIS', departureTime: '07:30', arrivalTime: '11:30' });
  it('uses the typed hours for that month only', () => {
    const s = { ...S, groundInstructionHour: 60, instructionHours: { '2026-04': 2 } };
    const r = payEstimate([inst], '2026-04', s, '2026-04-30');
    expect(r.groundInstructionHoursAuto).toBe(4);
    expect(r.groundInstructionHours).toBe(2);
    expect(r.groundInstructionValue).toBe(120);
    const other = payEstimate([{ ...inst, date: '2026-03-14' }], '2026-03', s, '2026-03-31');
    expect(other.groundInstructionHours).toBe(4);
  });
});

// The March and June 2026 payslips: no duty-pay where the office days alone took the month over limit 1 — GAB days are
// paid apart ("Subs. gabinete") and stay out of the plafonds.
describe('gabinete fora do duty-pay', () => {
  const gab = (date: string, code: string, from: string, to: string) =>
    duty(date, 'Office Duty', { dutyCode: code, departureAirport: 'LIS', reportingTime: from, departureTime: from, arrivalTime: to });
  it('credits nothing for a GAB day and only the flying on a mixed day', () => {
    const duties = [
      gab('2026-05-11', 'GAB1', '08:30', '12:00'), gab('2026-05-11', 'GAB2', '13:00', '16:30'),
      leg('2026-05-12', 'LIS', 'OPO', '10:00', '11:00', '09:00'),
    ];
    const r = payEstimate(duties, '2026-05', S, '2026-05-31');
    expect(r.duty.credited).toBe(120 + 30);
  });
});
