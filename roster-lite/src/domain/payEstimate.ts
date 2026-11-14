import { dutyDays, workWindow, PGA_PILOT_RULES } from './dutyTime';
import { isPrevenirIO } from './irregularity';
import { diffMinutes } from '../utils/duration';
import { lisbonMidnightUtc } from './standbyWindows';
import { nationalHolidays } from './holidaysPT';
import { planVsFlown } from './planVsFlown';
import { HOME_BASE } from './dutyStats';
import { irsRetention, type IrsTable } from './irsWithholding';
import { HOLIDAY_ENTITLEMENT_DAYS } from './aeCompliance';
import type { ParsedDuty } from './types';
import { countryOf, raacoDays } from './raaco';
import { fdpForDay } from './fdp';
import { OFF_DAY_BONUS, OFF_DAY_HOURLY, offDayChoice, restCutOf } from './offDayWork';

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
//   • a flight on a planned day off (cl. 13 — "Voo em Off", or marked by the pilot) when paid: 3% of
//     the VB per FDP hour + 15% of the VB for the day, outside the plafonds (domain/offDayWork.ts);
//   • reduced rests the pilot typed (cl. 2.8), over the planned-vs-flown one for that day.
// Not modelled: split duty (cl. 11), the annual plafond reconciliation paid in March (cl. 2.4), the holiday
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
  ve: number; // vencimento de exercício (all the anuidades)
  veCommand: number; // the part of `ve` that is the "Anuid. técnica Comando" (commanders; 0 otherwise)
  vs: number; // vencimento de senioridade
  extras: number; // fixed monthly complements (cl. 3), €
  chiefBonus: number; // the part of `extras` that is the "Prémio de chefia" (commanders; 0 otherwise)
  perDiemA: number;
  perDiemB: number;
  instructorSession: number; // € per session given as an instructor; 0 if not an instructor
  lineTrainingDay: number; // € per day of flights flown as instructor (LIFUS_INS / FAM_INS)
  // € per line check ("LCC_Line Check" on the payslip), one per day of flights marked W_INS (the
  // examiner's mark; the day's own code is W_PNT). `lineChecks` ('yyyy-MM' → count) is the pilot's
  // correction on the pay card, when the roster's count is wrong; absent = the roster's.
  lineCheck: number;
  lineChecks: Record<string, number>;
  officeDay: number; // € per office day ("Subs. gabinete" on the payslip — GAB days), the pilot's own figure
  mealTicket: number; // € per day of ground duty at base ("Sub. alimentação tickets", paid to the meal card)
  // ── For the net estimate ──
  irsTable: IrsTable;
  dependents: number;
  nonTaxableFixed: number; // the part of `extras` not subject to IRS / SS (the PGA's pension contribution)
  fixedDeductions: number; // monthly deductions other than IRS and SS (insurance, union, pension fund…)
  // Daily limits of the per diem free of IRS / SS (the legal limits for ajudas de custo, already
  // reduced because the company pays the hotel: −50% national, −30% abroad), by the kind of day.
  exemptNationalIrs: number;
  exemptNationalSs: number;
  exemptAbroadIrs: number;
  exemptAbroadSs: number;
  pensionAuto: boolean; // compute the pension-plan lines from the RB (RRRGS cl. 16)
  unionPct: number; // union fee, % of the base below; 0 = typed into fixedDeductions instead
  unionBase: number; // € the fee is a percentage of; 0 = automatic (unionBaseAuto)
  // The pilot's own word on which payslip carries the holiday subsidy, ticked on the pay card:
  // { year, month } (1–12), or month 0 for "not in any month I've seen". null, or another year,
  // = automatic from the roster (the month before the first holidays of 10+ working days, cl. 7.3).
  holidayPay: { year: number; month: number } | null;
}

export const DEFAULT_PAY_SETTINGS: PaySettings = {
  enabled: false, category: 'OP3', vb: 0, ve: 0, veCommand: 0, vs: 0, extras: 0, chiefBonus: 0,
  perDiemA: AE_PER_DIEM.OP.a, perDiemB: AE_PER_DIEM.OP.b, instructorSession: 0, lineTrainingDay: 0, lineCheck: 0, lineChecks: {},
  // The meal-card value of a real 2026 payslip (10,46 € a day, = the card's tax-free limit); office
  // days are paid at a rate the pilot types.
  officeDay: 0, mealTicket: 10.46,
  irsTable: 'I', dependents: 0, nonTaxableFixed: 0, fixedDeductions: 0,
  // Per diem paid for a day away is partly exempt (as ajudas de custo); per diem for days at base
  // (simulator, training, office — "Perdiem … T" on payslips) is taxed in full. The limit is per
  // day: national, or abroad when the day touches an airport outside Portugal, already reduced for
  // the hotel the company pays. Read off four real 2026 payslips, where "Outros valores p/ impostos"
  // = per diem away + that month's abonos − the limits, to the cent: IRS 36,33 / 116,95 €, SS 54,49 /
  // 175,42 € (national / abroad). 51,90 was tried in 0.8.35.1 and reverted in 0.8.37.1: the October
  // payslip's "Sujeito a SS 283,17" = 3 × 229,50 − 54,49 − 2 × 175,42, to the cent.
  // Editable, to follow the State Budget.
  exemptNationalIrs: 36.33, exemptNationalSs: 54.49, exemptAbroadIrs: 116.95, exemptAbroadSs: 175.42,
  pensionAuto: false,
  unionPct: 0, unionBase: 0,
  holidayPay: null,
};

// The union fee's base, worked out from a real commander's payslip (the same 1% in two months):
// every fixed line except the two that come with the command function — "Prémio de chefia" and
// "Anuid. técnica Comando" — and the PGA's pension contribution. For a first officer, who has
// neither, that is simply all the fixed pay. Not written in the AE (cl. 12 only says the company
// deducts the fee), so a typed base still overrides it.
export function unionBaseAuto(s: PaySettings): number {
  const pensionByHand = s.pensionAuto ? 0 : s.nonTaxableFixed; // a hand-typed PGA contribution sits in `extras`
  return Math.max(0, Math.round((s.vb + s.ve + s.vs + s.extras - pensionByHand - (s.veCommand ?? 0) - (s.chiefBonus ?? 0)) * 100) / 100);
}

export function unionFee(s: PaySettings): number {
  if (!s.unionPct) return 0;
  const base = s.unionBase || unionBaseAuto(s);
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
// CLTC / CTRI beside a flight (with the trainee's login) is line training given too, though the
// roster prints no LIFUS for it (user, Nov 2026).
export const isInstructorFlight = (d: ParsedDuty) =>
  (d.dutyType === 'Flight Duty' || d.dutyType === 'Positioning') && /\b(?:(?:LIFUS|FAM)_INS|CLTC|CTRI)\b/.test(d.observations ?? '');

// A flight on a line check given as the examiner: marked W_INS on each sector (user, Nov 2026,
// from a CrewLine roster: a W_PNT day with W_INS on both legs). One line check per such day.
export const isLineCheckFlight = (d: ParsedDuty) =>
  (d.dutyType === 'Flight Duty' || d.dutyType === 'Positioning') && /\bW_INS\b/.test(d.observations ?? '');

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
  perDiemDates: { a: string[]; b: string[] }; // which days, so the pilot can check them against the payslip
  perDiemTravelDays: number; // per-diem days spent away (flying or on a layover)
  // Each of those days, with what it pays and whether it touched an airport abroad — the exempt
  // limit is per day and depends on that.
  perDiemTravel: { date: string; value: number; abroad: boolean }[];
  // RAACO meal allowances of the month (paid apart, on the Abonos statement), per day: they add to
  // that day's per diem before the exempt limit, and what's over it is taxed with the salary.
  abonos: number;
  abonosByDate: Record<string, number>;
  perDiemTravelValue: number;
  complementDays: number;
  complementValue: number;
  extensions: number;
  extensionValue: number;
  reducedMinutes: number;
  reductionValue: number;
  offDays: number; // flights on a planned day off, paid under cl. 13
  offDayMinutes: number; // their flight duty time
  offDayValue: number;
  instructorSessions: number;
  instructorValue: number;
  lineTrainingDays: number;
  lineTrainingValue: number;
  lineChecks: number;
  lineChecksAuto: number; // the roster's count (days with W_INS flights)
  lineCheckValue: number;
  officeDays: number; // GAB days
  officeValue: number;
  mealTicketDays: number; // per diem B days at base (ground duty): one meal ticket each
  mealTicketValue: number; // tax-free, loaded onto the meal card (and taken off the transfer)
  // Paid in this payslip on top of the month's pay (RRRGS cl. 7 and 8): each one RB.
  holidaySubsidy: number;
  christmasSubsidy: number;
  holidayPayMonth: number | null; // the payslip month that carries the holiday subsidy, if known
  holidayPayAuto: boolean; // that month comes from the roster, not from the pilot's tick
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
export const CHRISTMAS_PAY_MONTH = 11; // paid with the November pay (user, from PGA payslips)
const nextMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

// RRRGS cl. 7.3: the holiday subsidy is paid in one go, with the pay of the month before the
// first holidays of ten working days or more. Found from the roster's runs of holiday days in
// `year` (weekends and national holidays inside a run don't count as working days). 0 when the
// roster doesn't show such a run — the pilot can set the month by hand.
export function autoHolidayPayMonth(duties: ParsedDuty[], year: number): number {
  const off = new Set(nationalHolidays(year));
  const dates = [...new Set(duties.filter((d) => isHoliday(d) && d.date.startsWith(`${year}-`)).map((d) => d.date))].sort();
  let start: string | null = null;
  let prev: string | null = null;
  let working = 0;
  const isWorking = (iso: string) => {
    const wd = new Date(`${iso}T12:00:00Z`).getUTCDay();
    return wd !== 0 && wd !== 6 && !off.has(iso);
  };
  // A run carries on over days off that aren't working days (a weekend left as a day off).
  const joins = (from: string, to: string) => {
    for (let d = nextDate(from); d < to; d = nextDate(d)) if (isWorking(d)) return false;
    return true;
  };
  for (const iso of [...dates, '']) {
    if (iso && prev && joins(prev, iso)) {
      if (isWorking(iso)) working++;
    } else {
      if (start && working >= 10) {
        const m = Number(start.slice(5, 7));
        return m === 1 ? 0 : m - 1; // a run from January would be paid in the previous year's December
      }
      start = iso || null;
      working = iso && isWorking(iso) ? 1 : 0;
    }
    prev = iso || prev;
  }
  return 0;
}

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
  // Flights on a day off paid under cl. 13 stay out of the plafonds (cl. 13.5): paid on their own.
  const offDayDates = new Set([...days].filter(([date, day]) => inMonth(date) && offDayChoice(day) === 'paid').map(([date]) => date));
  let dutyCredited = 0;
  for (const d of dutyDays(duties, PGA_PILOT_RULES)) {
    if (!inMonth(d.date) || offDayDates.has(d.date)) continue;
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
    if (!inMonth(date) || offDayDates.has(date)) continue;
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
  const perDiemDates = { a: [] as string[], b: [] as string[] };
  let available = 0; // days not on holidays or absence, for the complementary payment
  let mealTicketDays = 0; // ground duty at base: a meal ticket each (payslips: as many as the "B … T" days)
  let perDiemTravelDays = 0; // days away — the part of the per diem partly exempt from tax
  let perDiemTravelValue = 0;
  const perDiemTravel: { date: string; value: number; abroad: boolean }[] = [];
  // A day abroad: it touches an airport outside Portugal (an unknown airport counts as abroad).
  const abroadOn = (day: ParsedDuty[], at: string) => [at, ...day.flatMap((x) => [x.departureAirport, x.arrivalAirport])]
    .filter((a): a is string => !!a)
    .some((a) => a.toUpperCase() !== base.toUpperCase() && countryOf(a) !== 'Portugal (fora da base)');
  let where = base; // the airport the pilot is at, carried through the roster
  const dates = [...days.keys()].sort();
  const carryOver = new Set<string>();
  for (const date of dates) {
    const day = days.get(date)!;
    const w = workWindow(date, day, PGA_PILOT_RULES);
    if (w && w.end.getTime() > lisbonMidnightUtc(nextDate(date))) carryOver.add(nextDate(date));
    const awayAtStart = where !== base;
    const whereAtStart = where;
    for (const x of [...day].sort((a, b) => (a.departureTime ?? '').localeCompare(b.departureTime ?? ''))) {
      if ((x.dutyType === 'Flight Duty' || x.dutyType === 'Positioning') && x.arrivalAirport) where = x.arrivalAirport.toUpperCase();
    }
    if (!inMonth(date)) continue;
    // An IO for the "prevenir" pays the per diem A of the duty it replaced — national, at base,
    // so taxed in full like any day at base (user, from a colleague: "mete nacional o perdiem").
    const flying = day.some((x) => FLYING.has(x.dutyType) || x.dutyType === 'Standby Airport' || isPrevenirIO(x));
    const travelling = carryOver.has(date) || day.some((x) => x.dutyType === 'Flight Duty' || x.dutyType === 'Positioning');
    if (flying || carryOver.has(date)) {
      perDiemA++;
      perDiemDates.a.push(date);
      // Away counts too: a simulator in Frankfurt during a stay is per diem A away, not "… T".
      if (travelling || awayAtStart) {
        perDiemTravelDays++; perDiemTravelValue += s.perDiemA;
        perDiemTravel.push({ date, value: s.perDiemA, abroad: abroadOn(day, awayAtStart ? whereAtStart : base) });
      }
    } else if (awayAtStart || day.some((x) => GROUND_B.has(x.dutyType))) {
      perDiemB++;
      perDiemDates.b.push(date);
      // A medical day pays per diem B "T" but no meal ticket (October payslip: 7 B T, 6 tickets —
      // the one without is the aeromedical exam, user-confirmed).
      if (!awayAtStart && !day.every((x) => x.dutyType === 'Medical' || !GROUND_B.has(x.dutyType))) mealTicketDays++;
      if (awayAtStart) {
        perDiemTravelDays++; perDiemTravelValue += s.perDiemB;
        perDiemTravel.push({ date, value: s.perDiemB, abroad: abroadOn(day, whereAtStart) });
      }
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
  // A cut the pilot typed for a day replaces the planned-vs-flown one for that day.
  const typedCuts = [...days].filter(([date]) => inMonth(date)).map(([date, day]) => [date, restCutOf(day)] as const)
    .filter((x): x is readonly [string, number] => x[1] !== null && x[1] > 0);
  const typedCutDates = new Set(typedCuts.map(([date]) => date));
  const reducedMinutes = pvf.reductions.filter((r) => !typedCutDates.has(r.date)).reduce((sum, r) => sum + r.cut, 0)
    + typedCuts.reduce((sum, [, m]) => sum + m, 0);
  const reductionValue = (reducedMinutes / 60) * hourly;

  // ── Flights on a planned day off, paid (cl. 13): each flight duty period, then the day ──
  let offDayMinutes = 0;
  for (const date of offDayDates) {
    const fdp = fdpForDay(days.get(date)!, null, base);
    offDayMinutes += fdp?.planned ?? 0;
  }
  const offDayValue = (offDayMinutes / 60) * OFF_DAY_HOURLY * s.vb + offDayDates.size * OFF_DAY_BONUS * s.vb;

  // ── Simulator sessions as instructor (not in the AE; the pilot's own fee) ──
  const instructorSessions = [...instructorSimDates(duties)].filter(inMonth).length;
  const instructorValue = instructorSessions * (s.instructorSession || 0);

  // ── Line training / familiarisation flown as instructor, per day ──
  const lineTrainingDays = new Set(duties.filter((d) => inMonth(d.date) && isInstructorFlight(d)).map((d) => d.date)).size;
  const lineTrainingValue = lineTrainingDays * (s.lineTrainingDay || 0);

  // ── Line checks: days with W_INS flights, unless the pilot corrected the month's count ──
  const lineChecksAuto = new Set(duties.filter((d) => inMonth(d.date) && isLineCheckFlight(d)).map((d) => d.date)).size;
  const typed = s.lineChecks?.[month];
  const lineChecks = typed === undefined ? lineChecksAuto : Math.max(0, typed);
  const lineCheckValue = lineChecks * (s.lineCheck || 0);

  // ── Office days ("Subs. gabinete"): the GAB days of the month, at the pilot's rate ──
  const officeDays = new Set(duties.filter((d) => inMonth(d.date) && d.dutyType === 'Office Duty' && /^GAB/i.test(d.dutyCode)).map((d) => d.date)).size;
  const officeValue = officeDays * (s.officeDay || 0);
  const mealTicketValue = cents(mealTicketDays * (s.mealTicket || 0));

  // ── RAACO meal allowances (paid apart; only their tax is on the payslip) ──
  const abonosByDate: Record<string, number> = {};
  for (const d of raacoDays(duties, base).values()) if (inMonth(d.date) && d.total > 0) abonosByDate[d.date] = d.total;
  const abonos = Object.values(abonosByDate).reduce((a, v) => a + v, 0);

  const pension = pensionLines(s);
  const rb = s.vb + s.ve + s.vs + s.extras + pension.contribution;
  // ── Subsidies (RRRGS cl. 7 and 8), on the payslip this estimate is paid in (the month after the
  // work). As a real July payslip pays them, to the cent: on ALL the fixed monthly lines (VB, VE,
  // VS, chief bonus, complements — not the pension contribution), the holiday subsidy for the 42
  // holiday days the pilot is entitled to (fixed pay ÷ 30 × 42, "a totalidade dos dias de férias",
  // cl. 7.2), the Christmas one a month's fixed pay. Christmas: the AE says "até 15 de dezembro";
  // the PGA pays it with the November pay. Holidays: with the pay of the month before the first
  // holidays of 10 working days or more — from the roster, unless the pilot ticked the month.
  const paidIn = nextMonth(month);
  const paidYear = Number(paidIn.slice(0, 4));
  const paidMonth = Number(paidIn.slice(5, 7));
  const fixedPay = s.vb + s.ve + s.vs + s.extras - (s.pensionAuto ? 0 : s.nonTaxableFixed || 0);
  const ticked = s.holidayPay && s.holidayPay.year === paidYear ? s.holidayPay.month : null;
  const holidayPayMonth = ticked ?? autoHolidayPayMonth(duties, paidYear);
  const holidaySubsidy = holidayPayMonth === paidMonth ? cents((fixedPay / 30) * HOLIDAY_ENTITLEMENT_DAYS) : 0;
  const christmasSubsidy = paidMonth === CHRISTMAS_PAY_MONTH ? cents(fixedPay) : 0;

  const variable = overtimeVal + perDiemValue + complementValue + extensionValue + reductionValue + offDayValue + instructorValue + lineTrainingValue
    + lineCheckValue + officeValue + mealTicketValue;
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
    perDiemDates,
    perDiemTravelDays,
    perDiemTravel,
    abonos,
    abonosByDate,
    perDiemTravelValue,
    complementDays,
    complementValue,
    extensions: pvf.extensions.length,
    extensionValue,
    reducedMinutes,
    reductionValue,
    offDays: offDayDates.size,
    offDayMinutes,
    offDayValue,
    instructorSessions,
    instructorValue,
    lineTrainingDays,
    lineTrainingValue,
    lineChecks,
    lineChecksAuto,
    lineCheckValue,
    officeDays,
    officeValue,
    mealTicketDays,
    mealTicketValue,
    holidaySubsidy,
    christmasSubsidy,
    holidayPayMonth: holidayPayMonth || null,
    holidayPayAuto: ticked === null,
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
  // The subsidies' own withholding: by law (CIRS art. 99.º-C) they are taxed apart from the
  // month's pay, each one on its own through the same table.
  subsidyIrs: number;
  subsidyPensionContribution: number; // the PGA's 6,5% on the subsidies (abono, no tax)
  mealCard: number; // the meal tickets, taken off the transfer: they go onto the meal card ("Cartão-refeição")
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
  // Everything but the per diem for days away and the meal tickets (tax-free, on the meal card).
  const variableTaxed = r.variable - r.perDiemTravelValue - (r.mealTicketValue || 0);
  // Per day away: per diem + that day's abonos, less the day's limit (national or abroad); abonos
  // on any other day are taxed in full. The taxable rest goes with the salary (PGA payroll).
  const travelTaxable = (kind: 'irs' | 'ss') => {
    const limit = (abroad: boolean) => (kind === 'irs'
      ? (abroad ? s.exemptAbroadIrs : s.exemptNationalIrs)
      : (abroad ? s.exemptAbroadSs : s.exemptNationalSs)) || 0;
    const abonos = r.abonosByDate ?? {};
    let taxable = 0;
    const counted = new Set<string>();
    for (const d of r.perDiemTravel ?? []) {
      counted.add(d.date);
      taxable += Math.max(0, d.value + (abonos[d.date] ?? 0) - limit(d.abroad));
    }
    for (const [date, v] of Object.entries(abonos)) if (!counted.has(date)) taxable += v;
    return taxable;
  };
  const irsBase = fixedTaxable + variableTaxed + travelTaxable('irs');
  const ssBase = fixedTaxable + variableTaxed + travelTaxable('ss');
  const irs = irsRetention(irsBase, s.irsTable || 'I', s.dependents || 0);
  // Subsidies: SS like any pay, IRS withheld apart for each one, and the pension plan applies to
  // them too (it "incide 14 vezes por ano", RRRGS cl. 16.2): 6,5% / 7,5% of the subsidy itself —
  // the PGA's part as a non-taxable abono ("Fundo pensões contr. SF/SN"), the deposit taken off.
  // All matched a July payslip to the cent; the union fee is not taken from them.
  const subsidies = [r.holidaySubsidy, r.christmasSubsidy].filter((v) => v > 0);
  const subsidyTotal = subsidies.reduce((a, v) => a + v, 0);
  const subsidyIrs = subsidies.reduce((a, v) => a + irsRetention(v, s.irsTable || 'I', s.dependents || 0), 0);
  const subsidyPension = s.pensionAuto
    ? { contribution: cents(subsidyTotal * PENSION_COMPANY), deposit: cents(subsidyTotal * PENSION_TOTAL) }
    : { contribution: 0, deposit: 0 };
  const ss = Math.round((ssBase + subsidyTotal) * SS_RATE * 100) / 100;
  const fixedDeductions = s.fixedDeductions || 0;
  const union = unionFee(s);
  const pensionDeposit = cents(pension.deposit + subsidyPension.deposit);
  const grossAll = gross + subsidyTotal + subsidyPension.contribution;
  return {
    gross: grossAll, irsBase, irs, irsRate: irsBase > 0 ? irs / irsBase : 0, ssBase, ss, pensionDeposit, union, fixedDeductions,
    subsidyIrs,
    subsidyPensionContribution: subsidyPension.contribution,
    mealCard: r.mealTicketValue || 0,
    net: grossAll - irs - subsidyIrs - ss - pensionDeposit - union - fixedDeductions - (r.mealTicketValue || 0),
  };
}
