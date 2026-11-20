import { payEstimate, RATE_L1, type PaySettings } from './payEstimate';
import type { ParsedDuty } from './types';

// RRRGS cl. 2.2 b) and 2.4: the yearly credits — duty-pay 1136:40, block-pay 624:00 (Tabelas 2.2 / 2.4, a full year; the
// holidays don't cut them, cl. 2.2 c v b) — whichever is better for the pilot in the year. The hours above them are paid at
// the hourly rate (the table has one limit only: 3% of the VB — "uma injustiça, mas é o que é", a tester, Nov 2026), less
// what the months already paid above their own plafonds; a positive balance comes with the March pay (cl. 2.4).
export const ANNUAL_DUTY_MIN = 1136 * 60 + 40;
export const ANNUAL_BLOCK_MIN = 624 * 60;

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
}

// `settingsFor` gives each work month's own figures (getPaySettingsFor). Months with no roster stay out.
export function annualPlafond(
  duties: ParsedDuty[], year: number, settingsFor: (month: string) => PaySettings, todayISO: string, base: string,
): AnnualPlafond {
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
  const dutyValue = above(duty, ANNUAL_DUTY_MIN);
  const blockValue = above(block, ANNUAL_BLOCK_MIN);
  const annualValue = Math.max(dutyValue, blockValue);
  const best = annualValue <= 0 ? null : dutyValue >= blockValue ? 'duty' : 'block';
  const monthlyPaid = months.reduce((a, x) => a + x.paid, 0);
  const cents = (v: number) => Math.round(v * 100) / 100;
  return {
    year, months, duty, block, dutyValue: cents(dutyValue), blockValue: cents(blockValue), best,
    annualValue: cents(annualValue), monthlyPaid: cents(monthlyPaid), balance: cents(Math.max(0, annualValue - monthlyPaid)), vb,
  };
}
