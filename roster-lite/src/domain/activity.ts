import type { LogbookRow, ParsedDuty } from './types';
import { rowBlock } from './logbook';

// Daily activity for the year heatmap: block minutes flown per calendar day (from the logbook),
// plus non-flying work days (simulator, training, office) from the roster — coloured apart.

export function blockByDate(rows: LogbookRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.date, (m.get(r.date) ?? 0) + rowBlock(r));
  return m;
}

// Ground (non-flying) work the heatmap should still show: simulator, training/checks and office
// duty. Other duty types (standby, day off, vacation, …) are not "activity" and stay blank.
export type GroundKind = 'sim' | 'training' | 'office';
const GROUND_DUTY_TYPE: Record<string, GroundKind> = {
  Simulator: 'sim',
  Training: 'training',
  'Office Duty': 'office',
};

// One ground kind per date (sim wins over training over office when a day mixes them), so the
// heatmap can colour and label non-flying work days.
export function groundActivityByDate(duties: ParsedDuty[]): Map<string, GroundKind> {
  const order: GroundKind[] = ['office', 'training', 'sim']; // later = higher priority
  const m = new Map<string, GroundKind>();
  for (const d of duties) {
    const kind = GROUND_DUTY_TYPE[d.dutyType];
    if (!kind) continue;
    const cur = m.get(d.date);
    if (!cur || order.indexOf(kind) > order.indexOf(cur)) m.set(d.date, kind);
  }
  return m;
}

// Years with any logged flying or (optionally) ground activity, newest first.
export function activeYears(rows: LogbookRow[], extraDates?: Iterable<string>): number[] {
  const ys = new Set<number>();
  for (const r of rows) ys.add(Number(r.date.slice(0, 4)));
  if (extraDates) for (const d of extraDates) ys.add(Number(String(d).slice(0, 4)));
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
