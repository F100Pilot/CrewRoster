import { payEstimate, RATE_L1, type PaySettings } from './payEstimate';
import type { ParsedDuty } from './types';

// RRRGS cl. 2.2 b) and 2.4: the yearly credits — duty-pay 1136:40, block-pay 624:00 (Tabelas 2.2 / 2.4, a full year; the
// holidays don't cut them, cl. 2.2 c v b) — whichever is better for the pilot in the year. The hours above them are paid at
// the hourly rate (the table has one limit only: 3% of the VB — "uma injustiça, mas é o que é", a tester, Nov 2026), less
// what the months already paid above their own plafonds; a positive balance comes with the March pay (cl. 2.4).
export const ANNUAL_DUTY_MIN = 1136 * 60 + 40;
export const ANNUAL_BLOCK_MIN = 624 * 60;

// Tabela 2.2 / 2.3: the yearly credits by the number of months worked (12 = a full year; a pilot released on the line
// mid-year counts from that month, cl. 2.2 c iii b). Index = months − 1.
const DUTY_BY_MONTHS = ['110:00', '203:20', '296:40', '390:00', '483:20', '576:40', '670:00', '763:20', '856:40', '950:00', '1043:20', '1136:40'];
const BLOCK_BY_MONTHS = ['60:00', '111:16', '162:32', '213:49', '265:05', '316:21', '367:38', '418:54', '470:10', '521:27', '572:43', '624:00'];
const hm = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
// Tabela 2.4: per day of parental leave (cl. 2.2 c i b).
const DUTY_CUT_PER_DAY = 3 * 60 + 37;
const BLOCK_CUT_PER_DAY = 2 * 60;

// What cuts the yearly credits (RRRGS cl. 2.2 c), typed by the pilot on the card (a tester, Nov 2026: "devia de descontar
// … ano de admissão etc"). Holidays and justified absences don't (c ii, c v b).
export interface AnnualCuts {
  fromMonth?: number; // 1–12: the month released on the line in the year of admission (Tabela 2.3)
  parentalDays?: number; // days of parental leave in the year (Tabela 2.4: 3:37 duty / 2:00 block a day)
  reducedPct?: number; // agreed reduction of activity, % (cl. 18; c iv b)
}
export function annualLimits(cuts: AnnualCuts = {}): { duty: number; block: number } {
  const months = Math.min(12, Math.max(1, 13 - (cuts.fromMonth || 1)));
  const days = Math.max(0, cuts.parentalDays || 0);
  const keep = 1 - Math.min(100, Math.max(0, cuts.reducedPct || 0)) / 100;
  return {
    duty: Math.round(Math.max(0, hm(DUTY_BY_MONTHS[months - 1]) - days * DUTY_CUT_PER_DAY) * keep),
    block: Math.round(Math.max(0, hm(BLOCK_BY_MONTHS[months - 1]) - days * BLOCK_CUT_PER_DAY) * keep),
  };
}

export interface AnnualMonth { month: string; duty: number; block: number; paid: number }
export interface AnnualPlafond {
  year: number;
  months: AnnualMonth[]; // the months the stored roster covers
  duty: number; // credited minutes in the year
  block: number;
  dutyValue: number; // € above the yearly credit, at 3% of the VB
  blockValue: number;
  best: 'duty' | 'block' | null;
  annualValue: number;
  monthlyPaid: number; // the months' own overtime
  balance: number; // what March would add (never negative)
  vb: number; // the VB the hours are valued at: the year's last month with figures
  limits: { duty: number; block: number }; // the year's credits after the cuts
}

// `settingsFor` gives each work month's own figures (getPaySettingsFor). Months with no roster stay out.
export function annualPlafond(
  duties: ParsedDuty[], year: number, settingsFor: (month: string) => PaySettings, todayISO: string, base: string,
  cuts: AnnualCuts = {},
): AnnualPlafond {
  const limits = annualLimits(cuts);
  const months: AnnualMonth[] = [];
  let vb = 0;
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    if (!duties.some((d) => d.date.startsWith(key))) continue;
    const s = settingsFor(key);
    const r = payEstimate(duties, key, s, todayISO, base);
    months.push({ month: key, duty: r.duty.credited, block: r.block.credited, paid: r.overtimeValue });
    if (s.vb) vb = s.vb;
  }
  const duty = months.reduce((a, x) => a + x.duty, 0);
  const block = months.reduce((a, x) => a + x.block, 0);
  const above = (credited: number, limit: number) => (Math.max(0, credited - limit) / 60) * RATE_L1 * vb;
  const dutyValue = above(duty, limits.duty);
  const blockValue = above(block, limits.block);
  const annualValue = Math.max(dutyValue, blockValue);
  const best = annualValue <= 0 ? null : dutyValue >= blockValue ? 'duty' : 'block';
  const monthlyPaid = months.reduce((a, x) => a + x.paid, 0);
  const cents = (v: number) => Math.round(v * 100) / 100;
  return {
    year, months, duty, block, dutyValue: cents(dutyValue), blockValue: cents(blockValue), best,
    annualValue: cents(annualValue), monthlyPaid: cents(monthlyPaid), balance: cents(Math.max(0, annualValue - monthlyPaid)), vb, limits,
  };
}
