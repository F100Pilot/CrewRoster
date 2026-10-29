import { rowBlock } from './logbook';
import { dutyDays, type DutyRules } from './dutyTime';
import type { LogbookRow, ParsedDuty } from './types';

// Block and duty per calendar month, for the evolution chart in Statistics. Block comes from the
// permanent logbook, which keeps every month ever flown; duty can only be counted where a roster
// is stored, so a month the roster doesn't cover reads null ("unknown"), never 0.
export interface MonthTotal {
  month: string; // "YYYY-MM"
  block: number; // minutes
  duty: number | null; // counted minutes (standby already weighted); null without a roster
}

// The `count` months ending with the month of `todayISO`, oldest first.
export function lastMonths(todayISO: string, count = 12): string[] {
  const [y, m] = todayISO.split('-').map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const idx = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`);
  }
  return out;
}

export function monthlyTotals(
  rows: LogbookRow[], duties: ParsedDuty[], rules: DutyRules, todayISO: string, count = 12,
): MonthTotal[] {
  const block = new Map<string, number>();
  for (const r of rows) {
    const k = r.date.slice(0, 7);
    block.set(k, (block.get(k) ?? 0) + rowBlock(r));
  }
  // A roster lists every day (days off included), so any entry means the month is covered.
  const covered = new Set(duties.map((d) => d.date.slice(0, 7)));
  const duty = new Map<string, number>();
  for (const d of dutyDays(duties, rules)) {
    const k = d.date.slice(0, 7);
    duty.set(k, (duty.get(k) ?? 0) + d.minutes);
  }
  return lastMonths(todayISO, count).map((month) => ({
    month,
    block: block.get(month) ?? 0,
    duty: covered.has(month) ? duty.get(month) ?? 0 : null,
  }));
}

// A clean axis top for a maximum in minutes: whole hours, stepped 10/20/25/50/100 h so the
// gridlines land on round numbers. Returns the top and the step (both minutes).
export function niceHourAxis(maxMinutes: number): { top: number; step: number } {
  const h = Math.max(1, maxMinutes / 60);
  const step = [5, 10, 20, 25, 50, 100, 200].find((s) => h / s <= 4) ?? 500;
  return { top: Math.ceil(h / step) * step * 60, step: step * 60 };
}
