import { dutyDays, workWindow, PGA_PILOT_RULES } from './dutyTime';
import { diffMinutes } from '../utils/duration';
import { lisbonMidnightUtc } from './standbyWindows';
import { nationalHolidays } from './holidaysPT';
import { planVsFlown } from './planVsFlown';
import { HOME_BASE } from './dutyStats';
import { irsRetention, type IrsTable } from './irsWithholding';
import type { ParsedDuty } from './types';

// A gross monthly pay estimate for a Portugália pilot, from the RRRGS (the pay annex of the
// AE Portugália/SIPLA 2023). Everything personal — the VB, VE and VS in euros — comes from the
// pilot, typed into Settings and kept on the device; only the agreement's rules live here:
//   • RB = VB + VE + VS (cl. 2.1), plus fixed complements (cl. 3), paid in the month;
//   • hours above the monthly plafonds (cl. 2.2.a, table 2.1), duty-pay or block-pay, whichever
//     pays more: between Limite 1 and Limite 2 at 3% of the VB an hour, above Limite 2 at 6%
//     (table A2.3) — paid the month after (cl. 2.3);
//   • per diem A / B per calendar day (cl. 9, table A2.2 — "sujeito a confirmação" in the text)
//     and the complementary payment when fewer than 5 days earn one (cl. 10);
//   • commander's extensions (2h of duty-pay, cl. 2.6) and reduced rests (the time cut, cl. 2.8),
//     from the planned-vs-flown record;
//   • line training / familiarisation flown as instructor (LIFUS_INS / FAM_INS), per day;
//   • simulator sessions given as an instructor (OPC_INS / LPC_INS and the check's second day),
//     at a per-session fee the pilot sets — it is not in the AE, but payslips carry it the
//     month after.
// Not modelled: work on a planned day off (cl. 13 — the app can't tell a folga was planned),
// split duty (cl. 11), the annual plafond reconciliation paid in March (cl. 2.4), the holiday
// and Christmas subsidies, and anything below the gross line (IRS, Segurança Social).

export type PayCategory = 'CTE' | 'OP3' | 'OP2' | 'OP1' | 'OPJ';

export const PAY_CATEGORIES: { value: PayCategory; label: string }[] = [
  { value: 'CTE', label: 'Comandante (CTE)' },
  { value: 'OP3', label: 'OP3 (5 anos ou mais)' },
  { value: 'OP2', label: 'OP2 (3 a 5 anos)' },
  { value: 'OP1', label: 'OP1 (1 a 3 anos)' },
  { value: 'OPJ', label: 'OP Júnior' },
];

// Table A2.2, in euros. Marked "sujeito a confirmação" in the agreement; the CTE pair matches a
// real payslip (October 2026), the OP pair is unconfirmed. Starting values of editable fields.
export const AE_PER_DIEM: Record<'CTE' | 'OP', { a: number; b: number }> = {
  CTE: { a: 229.5, b: 153 },
  OP: { a: 172.13, b: 114.75 },
};
export const perDiemDefaults = (c: PayCategory) => AE_PER_DIEM[c === 'CTE' ? 'CTE' : 'OP'];

export interface PaySettings {
  enabled: boolean;
  category: PayCategory;
  vb: number; // vencimento de categoria, €/month
  ve: number; // vencimento de exercício
  vs: number; // vencimento de senioridade
  extras: number; // fixed monthly complements (cl. 3), €
  perDiemA: number;
  perDiemB: number;
  instructorSession: number; // € per session given as an instructor; 0 if not an instructor
  lineTrainingDay: number; // € per day of flights flown as instructor (LIFUS_INS / FAM_INS)
  // ── For the net estimate ──
  irsTable: IrsTable;
  dependents: number;
  nonTaxableFixed: number; // the part of `extras` not subject to IRS / SS (the PGA's pension contribution)
  fixedDeductions: number; // monthly deductions other than IRS and SS (insurance, union, pension fund…)
  perDiemExemptIrs: number; // € of per diem free of IRS per day away (travel), on average
  perDiemExemptSs: number; // the same for Segurança Social
  pensionAuto: boolean; // compute the pension-plan lines from the RB (RRRGS cl. 16)
  unionPct: number; // union fee, % of the base below; 0 = typed into fixedDeductions instead
  unionBase: number; // € the fee is a percentage of; 0 = VB + VE + VS
}

export const DEFAULT_PAY_SETTINGS: PaySettings = {
  enabled: false, category: 'OP3', vb: 0, ve: 0, vs: 0, extras: 0,
  perDiemA: AE_PER_DIEM.OP.a, perDiemB: AE_PER_DIEM.OP.b, instructorSession: 0, lineTrainingDay: 0,
  irsTable: 'I', dependents: 0, nonTaxableFixed: 0, fixedDeductions: 0,
  // Per diem paid for a day away is partly exempt (as ajudas de custo); per diem for days at base
  // (simulator, training, office — "Perdiem … T" on payslips) is taxed in full. The exempt share
  // varies with the trip (national / abroad, overnight or not); these defaults are the per-day
  // average of two real payslips (Sep and Oct 2026: ~86–90 € for IRS, ~135–145 € for SS). Editable.
  perDiemExemptIrs: 88, perDiemExemptSs: 140,
  pensionAuto: false,
  unionPct: 0, unionBase: 0,
};

// The union fee as a percentage of a base. Which payslip lines make up the SIPLA base isn't
// settled yet (1% of a 9 377,74 € base matched a real payslip, but no clean set of lines adds up
// to it), so the base can be typed; left empty it falls back to VB + VE + VS.
export function unionFee(s: PaySettings): number {
  if (!s.unionPct) return 0;
  const base = s.unionBase || s.vb + s.ve + s.vs;
  return Math.round(base * s.unionPct) / 100;
}

// RRRGS cl. 16: a defined-contribution pension plan of 7,5% of the RB (VB + VE + VS); the PGA bears
// 6,5% — paid on the payslip as "Fundo pensões contr. PGA", free of IRS and SS — and the whole
// 7,5% is deducted as "Depósito f. pensões-SIPLA", so the pilot's own share is 1%. Both lines
// matched a real payslip to the cent.
export const PENSION_TOTAL = 0.075;
export const PENSION_COMPANY = 0.065;
const cents = (v: number) => Math.round(v * 100) / 100;
export function pensionLines(s: PaySettings): { contribution: number; deposit: number } {
  if (!s.pensionAuto) return { contribution: 0, deposit: 0 };
  const rb = s.vb + s.ve + s.vs;
  return { contribution: cents(rb * PENSION_COMPANY), deposit: cents(rb * PENSION_TOTAL) };
}

export const SS_RATE = 0.11; // Segurança Social, the worker's share

// A flight flown as the instructor, from its roster mark: line training (LIFUS_INS) or
// familiarisation (FAM_INS). Payslips pay "Line Training" once per such day — a real September
// with one FAM_INS day (two legs) paid one.
export const isInstructorFlight = (d: ParsedDuty) =>
  (d.dutyType === 'Flight Duty' || d.dutyType === 'Positioning') && /\b(?:LIFUS|FAM)_INS\b/.test(d.observations ?? '');

// Simulator sessions given as an instructor. The roster marks the first day of a check with
// "OPC" / "LPC" when the pilot is the one checked, or with "OPC_INS" / "LPC_INS" when he gives it;
// the next session, the check's second day, carries no mark and follows the first. Unmarked
// sessions with no marked one before them stay unpaid — better to under-count than invent pay.
// Checked against a real September: 6 simulator days, 4 paid as instructor, 2 his own OPC.
export function instructorSimDates(duties: ParsedDuty[]): Set<string> {
  const out = new Set<string>();
  let prev: { date: string; instructor: boolean } | null = null;
  const sims = duties.filter((d) => d.dutyType === 'Simulator').sort((a, b) => a.date.localeCompare(b.date));
  for (const d of sims) {
    const mark = (d.observations ?? '').match(/\b(?:OPC|LPC)(?:_INS)?\b/g);
    let instructor: boolean;
    if (mark) instructor = mark.some((m) => m.endsWith('_INS'));
    else instructor = !!prev && prev.instructor && daysBetween(prev.date, d.date) <= 3;
    if (instructor) out.add(d.date);
    prev = { date: d.date, instructor: mark ? instructor : false };
  }
  return out;
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

const h = (hh: number, mm = 0) => hh * 60 + mm;

// Table 2.1 (frota ENB), minutes, by the number of days in the month.
export const MONTH_PLAFONDS: Record<number, { dutyL1: number; dutyL2: number; blockL1: number; blockL2: number }> = {
  31: { dutyL1: h(113, 37), dutyL2: h(124), blockL1: h(62), blockL2: h(77, 30) },
  30: { dutyL1: h(110), dutyL2: h(120), blockL1: h(60), blockL2: h(75) },
  29: { dutyL1: h(106, 22), dutyL2: h(116), blockL1: h(58), blockL2: h(72, 30) },
  28: { dutyL1: h(102, 44), dutyL2: h(112), blockL1: h(56), blockL2: h(70) },
};
// Table 2.1's "redução por dia", applied per day of holidays taken in the month (cl. 2.2.c.iv).
export const PLAFOND_CUT_PER_DAY = { dutyL1: h(3, 37), dutyL2: h(4), blockL1: h(2), blockL2: h(2, 30) };

export const RATE_L1 = 0.03; // of the VB, per hour between Limite 1 and Limite 2
export const RATE_L2 = 0.06; // above Limite 2
export const NIGHT_SHARE = 0.25; // cl. 12.2.c: duty between 23:00 and 06:00
export const HOLIDAY_SHARE = 1; // cl. 12.2.d: flight and duty time on a holiday
export const EXTENSION_HOURS = 2; // cl. 2.6, per commander's extension
// Cl. 10: the complementary payment tops the per-diem days up to this many.
export const COMPLEMENT_DAYS = 5;

export interface Credit {
  credited: number; // minutes counted for pay (with the cl. 12 percentages)
  l1: number;
  l2: number;
  value: number; // € for the hours above the plafonds
}

export interface PayEstimate {
  month: string; // the month worked, "YYYY-MM"
  covered: boolean; // the roster has days in this month
  rb: number; // base pay with the fixed complements and, if computed, the PGA pension contribution
  pensionContribution: number;
  duty: Credit;
  block: Credit;
  overtime: 'duty' | 'block' | null; // the more favourable one, null when neither pays
  overtimeValue: number;
  perDiemA: number; // days
  perDiemB: number;
  perDiemValue: number;
  perDiemTravelDays: number; // per-diem days spent away (flying or on a layover)
  perDiemTravelValue: number;
  complementDays: number;
  complementValue: number;
  extensions: number;
  extensionValue: number;
  reducedMinutes: number;
  reductionValue: number;
  instructorSessions: number;
  instructorValue: number;
  lineTrainingDays: number;
  lineTrainingValue: number;
  holidayDays: number; // days of holidays taken, which cut the plafonds
  variable: number; // everything above the RB, paid the month after
  includesPlanned: boolean; // the month isn't over yet
}

const MIN = 60000;
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const nextDate = (iso: string, by = 1) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
};
const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const FLYING = new Set(['Flight Duty', 'Positioning', 'Simulator']);
// Ground duties that earn per diem B (cl. 9.1.b).
const GROUND_B = new Set(['Training', 'Office Duty', 'Medical']);
const isHoliday = (d: ParsedDuty) => d.dutyType === 'Vacation';

function byDate(duties: ParsedDuty[]): Map<string, ParsedDuty[]> {
  const m = new Map<string, ParsedDuty[]>();
  for (const d of duties) {
    if (!m.has(d.date)) m.set(d.date, []);
    m.get(d.date)!.push(d);
  }
  return m;
}

// The hours above the plafonds, in euros, at the two hourly rates.
export function overtimeValue(credited: number, l1: number, l2: number, vb: number): number {
  const band1 = Math.max(0, Math.min(credited, l2) - l1);
  const band2 = Math.max(0, credited - l2);
  return (band1 / 60) * RATE_L1 * vb + (band2 / 60) * RATE_L2 * vb;
}

export function payEstimate(
  duties: ParsedDuty[], month: string, s: PaySettings, todayISO: string, base: string = HOME_BASE,
): PayEstimate {
  const days = byDate(duties);
  const inMonth = (iso: string) => iso.startsWith(month);
  const holidays = new Set([
    ...nationalHolidays(Number(month.slice(0, 4))),
    ...nationalHolidays(Number(month.slice(0, 4)) - 1), // a 31 Dec duty can run into 1 Jan
  ]);

  // ── Duty-pay credit (cl. 12.2) ──
  // The day's counted duty as the limits count it — standby already at 25% at home / 50% at
  // the airport — a positioning-only day at 50% (cl. 12.2.a.iv), plus 25% of the work between
  // 23:00 and 06:00 Lisbon and 100% of the work on a holiday. Night and holiday are separate
  // alíneas, so both apply where they meet (cl. 12.3 only stops cumulating within one alínea).
  let dutyCredited = 0;
  for (const d of dutyDays(duties, PGA_PILOT_RULES)) {
    if (!inMonth(d.date)) continue;
    const day = days.get(d.date) ?? [];
    const positioningOnly = day.some((x) => x.dutyType === 'Positioning')
      && !day.some((x) => x.dutyType === 'Flight Duty' || x.dutyType === 'Simulator');
    let credit = d.minutes * (positioningOnly ? 0.5 : 1);
    const w = workWindow(d.date, day, PGA_PILOT_RULES);
    if (w) {
      const a = w.start.getTime();
      const b = w.end.getTime();
      let night = 0;
      let holiday = 0;
      for (const iso of [nextDate(d.date, -1), d.date, nextDate(d.date)]) {
        const midnight = lisbonMidnightUtc(iso);
        const nextMidnight = lisbonMidnightUtc(nextDate(iso));
        // The night that starts at 23:00 on `iso` and ends at 06:00 the next day.
        night += overlap(a, b, nextMidnight - 60 * MIN, nextMidnight + 6 * 60 * MIN);
        if (holidays.has(iso)) holiday += overlap(a, b, midnight, nextMidnight);
      }
      const share = positioningOnly ? 0.5 : 1;
      credit += (night / MIN) * NIGHT_SHARE * share + (holiday / MIN) * HOLIDAY_SHARE * share;
    }
    dutyCredited += credit;
  }

  // ── Block-pay credit ──
  // Operated sectors and simulator in full; a positioning sector in full when the same day has
  // an operated one (extra-crew next to a working sector, cl. 12.2.a.iii), else at 50%; a sector
  // on a holiday counts twice.
  let blockCredited = 0;
  for (const [date, day] of days) {
    if (!inMonth(date)) continue;
    const operatedDay = day.some((x) => x.dutyType === 'Flight Duty');
    for (const x of day) {
      if (!FLYING.has(x.dutyType) || !x.departureTime || !x.arrivalTime) continue;
      let min = diffMinutes(x.departureTime, x.arrivalTime);
      if (x.dutyType === 'Positioning' && !operatedDay) min *= 0.5;
      if (holidays.has(date)) min *= 1 + HOLIDAY_SHARE;
      blockCredited += min;
    }
  }

  // ── Plafonds, cut by the holidays taken in the month ──
  const holidayDays = [...days].filter(([date, day]) => inMonth(date) && day.some(isHoliday)).length;
  const p = MONTH_PLAFONDS[daysInMonth(month)];
  const cut = (v: number, perDay: number) => Math.max(0, v - perDay * holidayDays);
  const dutyL1 = cut(p.dutyL1, PLAFOND_CUT_PER_DAY.dutyL1);
  const dutyL2 = cut(p.dutyL2, PLAFOND_CUT_PER_DAY.dutyL2);
  const blockL1 = cut(p.blockL1, PLAFOND_CUT_PER_DAY.blockL1);
  const blockL2 = cut(p.blockL2, PLAFOND_CUT_PER_DAY.blockL2);
  const duty: Credit = { credited: Math.round(dutyCredited), l1: dutyL1, l2: dutyL2, value: overtimeValue(dutyCredited, dutyL1, dutyL2, s.vb) };
  const block: Credit = { credited: Math.round(blockCredited), l1: blockL1, l2: blockL2, value: overtimeValue(blockCredited, blockL1, blockL2, s.vb) };
  const overtime = duty.value <= 0 && block.value <= 0 ? null : duty.value >= block.value ? 'duty' : 'block';
  const overtimeVal = Math.max(duty.value, block.value);

  // ── Per diem (cl. 9), per calendar day in Lisbon ──
  // A: a flight, positioning or simulator duty on the day, a duty still running from the day
  // before (an arrival after midnight), or airport standby. B: otherwise a day away from base
  // (layover), ground training (the FP sessions — "formação presencial" — given or attended),
  // office duty (GAB, S.EXT.) or a medical. A wins where both apply (cl. 9.2). Checked against a
  // real September roster and the payslip that paid it: 9 A + 7 B, day for day.
  let perDiemA = 0;
  let perDiemB = 0;
  let available = 0; // days not on holidays or absence, for the complementary payment
  let perDiemTravelDays = 0; // days away — the part of the per diem partly exempt from tax
  let perDiemTravelValue = 0;
  let where = base; // the airport the pilot is at, carried through the roster
  const dates = [...days.keys()].sort();
  const carryOver = new Set<string>();
  for (const date of dates) {
    const day = days.get(date)!;
    const w = workWindow(date, day, PGA_PILOT_RULES);
    if (w && w.end.getTime() > lisbonMidnightUtc(nextDate(date))) carryOver.add(nextDate(date));
    const awayAtStart = where !== base;
    for (const x of [...day].sort((a, b) => (a.departureTime ?? '').localeCompare(b.departureTime ?? ''))) {
      if ((x.dutyType === 'Flight Duty' || x.dutyType === 'Positioning') && x.arrivalAirport) where = x.arrivalAirport.toUpperCase();
    }
    if (!inMonth(date)) continue;
    const flying = day.some((x) => FLYING.has(x.dutyType) || x.dutyType === 'Standby Airport');
    const travelling = carryOver.has(date) || day.some((x) => x.dutyType === 'Flight Duty' || x.dutyType === 'Positioning');
    if (flying || carryOver.has(date)) {
      perDiemA++;
      if (travelling) { perDiemTravelDays++; perDiemTravelValue += s.perDiemA; }
    } else if (awayAtStart || day.some((x) => GROUND_B.has(x.dutyType))) {
      perDiemB++;
      if (awayAtStart) { perDiemTravelDays++; perDiemTravelValue += s.perDiemB; }
    }
    if (!day.every((x) => x.dutyType === 'Vacation' || x.dutyType === 'Absence')) available++;
  }
  const perDiemValue = perDiemA * s.perDiemA + perDiemB * s.perDiemB;
  // Cl. 10: fewer than 5 per-diem days → per diem A for each missing day, up to 5, for a pilot
  // who was available for them.
  const complementDays = Math.min(available, Math.max(0, COMPLEMENT_DAYS - perDiemA - perDiemB));
  const complementValue = complementDays * s.perDiemA;

  // ── Extensions and reduced rests (cl. 2.6 / 2.8), at the Limite 1 hourly rate ──
  const pvf = planVsFlown(duties, month, todayISO, base);
  const hourly = RATE_L1 * s.vb;
  const extensionValue = pvf.extensions.length * EXTENSION_HOURS * hourly;
  const reducedMinutes = pvf.reductions.reduce((sum, r) => sum + r.cut, 0);
  const reductionValue = (reducedMinutes / 60) * hourly;

  // ── Simulator sessions as instructor (not in the AE; the pilot's own fee) ──
  const instructorSessions = [...instructorSimDates(duties)].filter(inMonth).length;
  const instructorValue = instructorSessions * (s.instructorSession || 0);

  // ── Line training / familiarisation flown as instructor, per day ──
  const lineTrainingDays = new Set(duties.filter((d) => inMonth(d.date) && isInstructorFlight(d)).map((d) => d.date)).size;
  const lineTrainingValue = lineTrainingDays * (s.lineTrainingDay || 0);

  const pension = pensionLines(s);
  const rb = s.vb + s.ve + s.vs + s.extras + pension.contribution;
  const variable = overtimeVal + perDiemValue + complementValue + extensionValue + reductionValue + instructorValue + lineTrainingValue;
  const lastDay = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
  return {
    month,
    covered: dates.some(inMonth),
    rb,
    pensionContribution: pension.contribution,
    duty,
    block,
    overtime,
    overtimeValue: overtimeVal,
    perDiemA,
    perDiemB,
    perDiemValue,
    perDiemTravelDays,
    perDiemTravelValue,
    complementDays,
    complementValue,
    extensions: pvf.extensions.length,
    extensionValue,
    reducedMinutes,
    reductionValue,
    instructorSessions,
    instructorValue,
    lineTrainingDays,
    lineTrainingValue,
    holidayDays,
    variable,
    includesPlanned: todayISO < lastDay,
  };
}

export interface NetEstimate {
  gross: number;
  irsBase: number; // pay subject to IRS in the payslip
  irs: number;
  irsRate: number; // effective, of irsBase
  ssBase: number;
  ss: number;
  pensionDeposit: number;
  union: number;
  fixedDeductions: number;
  net: number;
}

// The payslip below the gross line, for the month the estimate is paid in: base pay plus the
// previous month's variable part. IRS is withheld by the 2026 tables on the whole month's taxable
// pay; SS takes 11%. Both leave out the non-taxable fixed part, and the exempt share of the per
// diem for days away; per diem for days at base is taxed in full. Checked against a real October
// 2026 payslip: IRS and both SS lines to the cent.
export function netEstimate(r: PayEstimate, s: PaySettings): NetEstimate {
  const gross = r.rb + r.variable;
  const pension = pensionLines(s);
  const fixedTaxable = r.rb - (s.nonTaxableFixed || 0) - pension.contribution;
  const variableTaxed = r.variable - r.perDiemTravelValue; // everything but the per diem for days away
  const travelTaxable = (exempt: number) => Math.max(0, r.perDiemTravelValue - (exempt || 0) * r.perDiemTravelDays);
  const irsBase = fixedTaxable + variableTaxed + travelTaxable(s.perDiemExemptIrs);
  const ssBase = fixedTaxable + variableTaxed + travelTaxable(s.perDiemExemptSs);
  const irs = irsRetention(irsBase, s.irsTable || 'I', s.dependents || 0);
  const ss = Math.round(ssBase * SS_RATE * 100) / 100;
  const fixedDeductions = s.fixedDeductions || 0;
  const union = unionFee(s);
  return {
    gross, irsBase, irs, irsRate: irsBase > 0 ? irs / irsBase : 0, ssBase, ss, pensionDeposit: pension.deposit, union, fixedDeductions,
    net: gross - irs - ss - pension.deposit - union - fixedDeductions,
  };
}
