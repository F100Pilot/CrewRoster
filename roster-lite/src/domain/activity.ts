import type { LogbookRow } from './types';
import { rowBlock } from './logbook';

// Daily flying activity for the year heatmap: block minutes flown per calendar day, and the
// list of years that have any logged flying (newest first).

export function blockByDate(rows: LogbookRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.date, (m.get(r.date) ?? 0) + rowBlock(r));
  return m;
}

export function activeYears(rows: LogbookRow[]): number[] {
  const ys = new Set<number>();
  for (const r of rows) ys.add(Number(r.date.slice(0, 4)));
  return [...ys].filter((y) => Number.isFinite(y)).sort((a, b) => b - a);
}

// 0 (none) … 4 (heavy) intensity bucket for a day's block minutes.
export function activityLevel(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  if (minutes <= 90) return 1;
  if (minutes <= 240) return 2;
  if (minutes <= 480) return 3;
  return 4;
}
