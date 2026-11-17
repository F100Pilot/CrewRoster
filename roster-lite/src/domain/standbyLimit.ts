import type { ParsedDuty } from './types';
import { isStandbyDuty } from './rosterMerge';

// RUPT cl. 19.24: "O número total de assistências e reservas, publicadas por ano civil em planeamento é de 24" — the
// standbys AND the R24 reserves, by calendar year, as PLANNED: one used to fly still counts (a tester, Nov 2026: "conta
// do planeado... não depois do realizado"; the merge keeps it as `plannedStandby`). cl. 19.16: per calendar month, in the
// published planning, at most 6 days (2 of them reserves at most, 2 airport standbys at most).
export const STANDBY_YEAR_LIMIT = 24;
export const STANDBY_MONTH_LIMIT = 6;

export interface StandbyDay {
  date: string;
  code: string;
  used: boolean; // replaced since by another duty (called out, or changed before the day)
  kind: 'home' | 'airport' | 'reserve';
}

const kindOf = (code: string, dutyType?: string): StandbyDay['kind'] =>
  /^(R24H?|RSV\d*|RES\d*|R)$/i.test(code) || dutyType === 'Reserve' ? 'reserve'
    : /^(APT|SBY(-A)?|STA)$/i.test(code) || dutyType === 'Standby Airport' ? 'airport' : 'home';

// One per day (cl. 19.2: one standby period a day), the standby on the roster now or the one it was published with.
export function standbyDays(duties: ParsedDuty[], year: string): StandbyDay[] {
  const byDate = new Map<string, StandbyDay>();
  for (const d of duties) {
    if (!d.date.startsWith(year) || byDate.has(d.date)) continue;
    if (isStandbyDuty(d)) byDate.set(d.date, { date: d.date, code: d.dutyCode, used: false, kind: kindOf(d.dutyCode, d.dutyType) });
  }
  for (const d of duties) {
    if (!d.date.startsWith(year) || byDate.has(d.date) || !d.plannedStandby) continue;
    byDate.set(d.date, { date: d.date, code: d.plannedStandby, used: true, kind: kindOf(d.plannedStandby) });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface StandbyMonth { month: string; days: StandbyDay[]; reserves: number; airport: number }
export function standbyByMonth(days: StandbyDay[]): StandbyMonth[] {
  const m = new Map<string, StandbyDay[]>();
  for (const d of days) {
    const k = d.date.slice(0, 7);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(d);
  }
  return [...m.entries()].map(([month, list]) => ({
    month, days: list,
    reserves: list.filter((d) => d.kind === 'reserve').length,
    airport: list.filter((d) => d.kind === 'airport').length,
  }));
}
