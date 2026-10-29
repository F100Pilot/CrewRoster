import type { ParsedDuty } from './types';
import { PGA_PILOT_RULES, isStandby, standbyInterval, workWindow } from './dutyTime';
import { lisbonLocal, lisbonMidnightUtc } from './standbyWindows';

// Checks of a pilot's roster against the planning rules of the Portugália / SIPLA company
// agreement (RUPT). EXPERIMENTAL: a reading of the agreement by the app, not the company's own
// validation — the UI says so next to every result.
//
// Ground rules for every check:
// • Only the roster from the first day of the current month on is reported: that's what can
//   still be acted on.
// • A rule is only judged on days the roster actually covers. A day with no entry at all is
//   unknown and breaks the stretch, so a gap in the imported data never reads as a violation.
// • Where a rule has exceptions the roster can't show (irregularities, the 11-day alternative
//   folga regime, rotations of 5+ days), the check takes the planned roster at face value.

export type CheckStatus = 'ok' | 'warn' | 'na';

export interface ComplianceCheck {
  id: 'folgas-mes' | 'intervalo-folgas' | 'folgas-72-96' | 'fim-de-semana' | 'descanso-semanal' | 'es-lf-nd';
  label: string;
  clause: string;
  status: CheckStatus;
  detail: string;
}

type DayKind = 'folga' | 'leave' | 'work' | 'free' | 'unknown';

const DAY = 86400000;
const HOUR = 3600000;
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// A "dia de folga" is a rostered day off at base (RUPT cl. 6, def. 11): W_OFF / OFF and the
// requested ones (OFF_RQST). A PLS_* (service-free period) or an "X" (day off away from base)
// isn't one.
const FOLGA_CODE = /^(W_OFF|OFF|[A-Z]+_RQST)$/;

function kindOf(duties: ParsedDuty[]): DayKind {
  if (duties.some((d) => d.dutyType === 'Vacation' || d.dutyType === 'Absence')) return 'leave';
  if (duties.some((d) => d.dutyType !== 'Day Off')) return 'work';
  if (duties.some((d) => FOLGA_CODE.test(d.dutyCode.toUpperCase()))) return 'folga';
  return 'free';
}

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday

interface Day { date: string; kind: DayKind; duties: ParsedDuty[] }

// Every calendar date from the first to the last in the roster, with its kind.
function timeline(duties: ParsedDuty[]): Day[] {
  const byDate = new Map<string, ParsedDuty[]>();
  for (const d of duties) {
    if (!byDate.has(d.date)) byDate.set(d.date, []);
    byDate.get(d.date)!.push(d);
  }
  const dates = [...byDate.keys()].sort();
  if (dates.length === 0) return [];
  const out: Day[] = [];
  for (let iso = dates[0]; iso <= dates[dates.length - 1]; iso = addDays(iso, 1)) {
    const ds = byDate.get(iso) ?? [];
    out.push({ date: iso, kind: ds.length ? kindOf(ds) : 'unknown', duties: ds });
  }
  return out;
}

// Runs of consecutive folga days — a "período de folga" needs at least 48h, i.e. 2 days (def. 27).
function folgaRuns(days: Day[]): { from: string; to: string; length: number }[] {
  const runs: { from: string; to: string; length: number }[] = [];
  let start: number | null = null;
  days.forEach((d, i) => {
    if (d.kind === 'folga') { if (start === null) start = i; }
    else if (start !== null) { runs.push({ from: days[start].date, to: days[i - 1].date, length: i - start }); start = null; }
  });
  if (start !== null) runs.push({ from: days[start].date, to: days[days.length - 1].date, length: days.length - start });
  return runs;
}

// ── cl. 21.2 / 21.14–15 — at least 10 folga days per calendar month, reduced by 2 for every 7
// days of absence or holiday (rounded). Only months the roster covers in full are judged.
function monthlyFolgas(days: Day[], fromISO: string) {
  const months = new Map<string, Day[]>();
  for (const d of days) {
    const k = d.date.slice(0, 7);
    if (!months.has(k)) months.set(k, []);
    months.get(k)!.push(d);
  }
  const results: { month: string; count: number; required: number; leave: number }[] = [];
  for (const [k, ds] of months) {
    if (`${k}-01` < fromISO.slice(0, 7) + '-01') continue;
    const daysInMonth = new Date(Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0)).getUTCDate();
    if (ds.length < daysInMonth || ds.some((d) => d.kind === 'unknown')) continue;
    const leave = ds.filter((d) => d.kind === 'leave').length;
    results.push({
      month: k,
      count: ds.filter((d) => d.kind === 'folga').length,
      required: Math.max(0, 10 - Math.round((2 * leave) / 7)),
      leave,
    });
  }
  return results;
}

const monthName = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]}`;

function checkMonthly(days: Day[], fromISO: string): ComplianceCheck {
  const base = { id: 'folgas-mes' as const, label: 'Folgas no mês', clause: 'RUPT cl. 21.2' };
  const months = monthlyFolgas(days, fromISO);
  if (months.length === 0) return { ...base, status: 'na', detail: 'Escala do mês incompleta — sem dados para verificar.' };
  const short = months.filter((m) => m.count < m.required);
  const describe = (m: (typeof months)[number]) => `${monthName(m.month)}: ${m.count} (mín. ${m.required})`;
  return short.length
    ? { ...base, status: 'warn', detail: short.map(describe).join(' · ') }
    : { ...base, status: 'ok', detail: months.map(describe).join(' · ') };
}

// ── cl. 21.4 — a month with exactly 10 folga days (and no leave) needs two folga periods of 72h
// or one of 96h.
function checkLongFolgas(days: Day[], fromISO: string): ComplianceCheck {
  const base = { id: 'folgas-72-96' as const, label: 'Folgas de 72h / 96h', clause: 'RUPT cl. 21.4' };
  const months = monthlyFolgas(days, fromISO).filter((m) => m.count === 10 && m.leave === 0);
  if (months.length === 0) return { ...base, status: 'na', detail: 'Só se aplica a meses com exatamente 10 folgas.' };
  const runs = folgaRuns(days);
  const bad = months.filter((m) => {
    const inMonth = runs.filter((r) => r.from.slice(0, 7) <= m.month && r.to.slice(0, 7) >= m.month);
    return !(inMonth.filter((r) => r.length >= 3).length >= 2 || inMonth.some((r) => r.length >= 4));
  });
  return bad.length
    ? { ...base, status: 'warn', detail: `${bad.map((m) => monthName(m.month)).join(', ')}: falta um período de 96h ou dois de 72h.` }
    : { ...base, status: 'ok', detail: `${months.map((m) => monthName(m.month)).join(', ')}: cumprido.` };
}

// ── cl. 21.3 — at most 6 days between folga periods. Leave and unknown days break the stretch.
// A stretch already longer than 6 days is a breach whatever came before it, so one starting at
// the beginning of the imported roster still counts.
function checkInterval(days: Day[], fromISO: string): ComplianceCheck {
  const base = { id: 'intervalo-folgas' as const, label: 'Intervalo entre folgas', clause: 'RUPT cl. 21.3' };
  const periods = new Set(folgaRuns(days).filter((r) => r.length >= 2).flatMap((r) => {
    const out: string[] = [];
    for (let d = r.from; d <= r.to; d = addDays(d, 1)) out.push(d);
    return out;
  }));
  const breaches: { from: string; to: string; length: number }[] = [];
  let runStart: string | null = null;
  let length = 0;
  const close = (end: string) => {
    if (runStart && length > 6 && end >= fromISO) breaches.push({ from: runStart, to: end, length });
    runStart = null; length = 0;
  };
  let prev: string | null = null;
  for (const d of days) {
    if (periods.has(d.date) || d.kind === 'leave' || d.kind === 'unknown') { if (prev) close(prev); prev = null; continue; }
    if (!runStart) runStart = d.date;
    length++;
    prev = d.date;
  }
  if (prev) close(prev);
  const known = days.filter((d) => d.date >= fromISO && d.kind !== 'unknown').length;
  if (breaches.length) {
    return { ...base, status: 'warn', detail: breaches.map((b) => `${b.length} dias seguidos (${ddmm(b.from)}–${ddmm(b.to)})`).join(' · ') };
  }
  return known >= 7
    ? { ...base, status: 'ok', detail: 'Nunca mais de 6 dias entre períodos de folga.' }
    : { ...base, status: 'na', detail: 'Escala curta demais para verificar.' };
}

// ── cl. 21.8 — a Saturday and Sunday off together at least every 6 weeks. Holiday or absence
// suspends the count, which restarts on return (21.8 a).
function checkWeekend(days: Day[], fromISO: string): ComplianceCheck {
  const base = { id: 'fim-de-semana' as const, label: 'Fim de semana de folga', clause: 'RUPT cl. 21.8' };
  const kind = new Map(days.map((d) => [d.date, d.kind]));
  let anchor: string | null = null; // the last folga weekend (or return from leave)
  let lastWeekend: string | null = null;
  const breaches: { since: string; at: string }[] = [];
  for (const d of days) {
    if (d.kind === 'unknown') { anchor = null; continue; }
    if (d.kind === 'leave') { anchor = d.date; continue; }
    if (anchor === null) anchor = d.date; // first known day: the 6 weeks are fully observed from here
    if (weekday(d.date) === 6 && d.kind === 'folga' && kind.get(addDays(d.date, 1)) === 'folga') {
      anchor = d.date; lastWeekend = d.date; continue;
    }
    if (daysBetween(anchor, d.date) > 42) {
      if (d.date >= fromISO) breaches.push({ since: anchor, at: d.date });
      anchor = d.date; // report each stretch once
    }
  }
  if (breaches.length) {
    return { ...base, status: 'warn', detail: breaches.map((b) => `sem sábado+domingo de folga de ${ddmm(b.since)} a ${ddmm(b.at)}`).join(' · ') };
  }
  if (!lastWeekend) return { ...base, status: 'na', detail: 'Nenhum fim de semana de folga na escala importada.' };
  return { ...base, status: 'ok', detail: `Último: ${ddmm(lastWeekend)} · o próximo até ${ddmm(addDays(lastWeekend, 42))}.` };
}

// ── cl. 15.2 + def. 26 — in every 7 days a weekly rest: 36h free of any service, including two
// consecutive local nights (8h each between 22:00 and 08:00, def. 23), starting no later than
// 14:00 of the 6th day. Standby and reserve are service; days off are free time.
function checkWeeklyRest(days: Day[], fromISO: string): ComplianceCheck {
  const base = { id: 'descanso-semanal' as const, label: 'Descanso semanal (36h)', clause: 'RUPT cl. 15.2' };
  // Continuous stretches of covered days; unknown days split them.
  const segments: Day[][] = [];
  let cur: Day[] = [];
  for (const d of days) {
    if (d.kind === 'unknown') { if (cur.length) segments.push(cur); cur = []; } else cur.push(d);
  }
  if (cur.length) segments.push(cur);

  const nightOverlap = (from: number, to: number, nightDate: string) => {
    const s = lisbonMidnightUtc(nightDate) + 22 * HOUR;
    return Math.max(0, Math.min(to, s + 10 * HOUR) - Math.max(from, s));
  };
  const qualifies = (from: number, to: number) => {
    if (to - from < 36 * HOUR) return false;
    for (let n = lisbonLocal(from).date, end = lisbonLocal(to).date; n <= end; n = addDays(n, 1)) {
      if (nightOverlap(from, to, n) >= 8 * HOUR && nightOverlap(from, to, addDays(n, 1)) >= 8 * HOUR) return true;
    }
    return false;
  };
  // Latest start for the next weekly rest: 14:00 local on the 6th day, counting the day the
  // previous one ended as day 1.
  const deadline = (endMs: number) => lisbonMidnightUtc(addDays(lisbonLocal(endMs).date, 5)) + 14 * HOUR;

  const breaches: { from: number; to: number }[] = [];
  let checked = false;
  for (const seg of segments) {
    const segStart = lisbonMidnightUtc(seg[0].date);
    const segEnd = lisbonMidnightUtc(addDays(seg[seg.length - 1].date, 1));
    const busy: [number, number][] = [];
    for (const d of seg) {
      const w = workWindow(d.date, d.duties, PGA_PILOT_RULES);
      if (w) busy.push([w.start.getTime(), w.end.getTime()]);
      for (const s of d.duties.filter(isStandby)) {
        const iv = standbyInterval(s);
        if (iv) busy.push([iv.start.getTime(), iv.end.getTime()]);
      }
    }
    busy.sort((a, b) => a[0] - b[0]);
    const rests: [number, number][] = [];
    let free = segStart;
    for (const [s, e] of busy) {
      if (s > free && qualifies(free, Math.min(s, segEnd))) rests.push([free, Math.min(s, segEnd)]);
      free = Math.max(free, e);
    }
    if (segEnd > free && qualifies(free, segEnd)) rests.push([free, segEnd]);

    // The start of the stretch counts as a rest end: a run longer than allowed from there is a
    // breach whatever came before. At the open end, the free time after the last duty may run on
    // past the imported roster — so it's a breach only if even that free time began too late.
    let prevEnd = segStart;
    for (const [s, e] of rests) {
      if (s > deadline(prevEnd)) breaches.push({ from: prevEnd, to: s });
      prevEnd = e;
    }
    const trailingFree = Math.min(free, segEnd);
    if (prevEnd < segEnd && trailingFree > deadline(prevEnd)) breaches.push({ from: prevEnd, to: trailingFree });
    if (segEnd - segStart >= 7 * DAY) checked = true;
  }

  const recent = breaches.filter((b) => lisbonLocal(b.to).date >= fromISO);
  if (recent.length) {
    return {
      ...base, status: 'warn',
      detail: recent.map((b) => `sem 36h livres com 2 noites entre ${ddmm(lisbonLocal(b.from).date)} e ${ddmm(lisbonLocal(b.to).date)}`).join(' · '),
    };
  }
  return checked
    ? { ...base, status: 'ok', detail: 'Um descanso semanal em cada 7 dias.' }
    : { ...base, status: 'na', detail: 'Escala curta demais para verificar.' };
}

// ── def. 14, 19, 22 and cl. 22 — Early Start, Late Finish and Night Duty. For clause 22 an Early
// Start begins 05:00–06:29 (22.7); a Late Finish ends 00:00–01:59; a Night Duty touches
// 02:00–04:59. Times are the base's local time (cl. 32.2) — Lisbon.
export type DutyTag = 'ES' | 'LF' | 'ND';

export function dutyTags(date: string, dayDuties: ParsedDuty[]): DutyTag[] {
  if (!dayDuties.some((d) => d.dutyType === 'Flight Duty' && d.departureTime && d.arrivalTime)) return [];
  const w = workWindow(date, dayDuties, PGA_PILOT_RULES);
  if (!w) return [];
  const tags: DutyTag[] = [];
  const start = lisbonLocal(w.start.getTime()).minutes;
  const end = lisbonLocal(w.end.getTime()).minutes;
  if (start >= 5 * 60 && start < 6 * 60 + 30) tags.push('ES');
  if (end < 2 * 60) tags.push('LF');
  for (const n of [date, addDays(date, 1)]) {
    const s = lisbonMidnightUtc(n) + 2 * HOUR;
    if (w.start.getTime() < s + 3 * HOUR && w.end.getTime() > s) { tags.push('ND'); break; }
  }
  return tags;
}

// cl. 22.1 — between folga periods: at most 2 consecutive flight duties that are ES/LF/ND, and
// at most 3 in all; 3 consecutive are allowed when all are Early Starts and folga periods sit
// right before and after them.
function checkEsLfNd(days: Day[], fromISO: string): ComplianceCheck {
  const base = { id: 'es-lf-nd' as const, label: 'Early Start / Late Finish / Night Duty', clause: 'RUPT cl. 22' };
  const periodDays = new Set(folgaRuns(days).filter((r) => r.length >= 2).flatMap((r) => {
    const out: string[] = [];
    for (let d = r.from; d <= r.to; d = addDays(d, 1)) out.push(d);
    return out;
  }));
  type Fdp = { date: string; tags: DutyTag[] };
  const segments: { fdps: Fdp[]; boundedBefore: boolean; boundedAfter: boolean }[] = [];
  let cur: { fdps: Fdp[]; boundedBefore: boolean; boundedAfter: boolean } = { fdps: [], boundedBefore: false, boundedAfter: false };
  for (const d of days) {
    const separator = periodDays.has(d.date) ? 'folga' : d.kind === 'leave' || d.kind === 'unknown' ? 'other' : null;
    if (separator) {
      if (cur.fdps.length) { cur.boundedAfter = separator === 'folga'; segments.push(cur); }
      cur = { fdps: [], boundedBefore: separator === 'folga', boundedAfter: false };
      continue;
    }
    const tags = dutyTags(d.date, d.duties);
    if (d.duties.some((x) => x.dutyType === 'Flight Duty')) cur.fdps.push({ date: d.date, tags });
  }
  if (cur.fdps.length) segments.push(cur);

  const problems: string[] = [];
  for (const seg of segments) {
    if (seg.fdps[seg.fdps.length - 1].date < fromISO) continue;
    const tagged = seg.fdps.filter((f) => f.tags.length);
    let run = 0; let best = 0; let bestEnd = '';
    for (const f of seg.fdps) {
      run = f.tags.length ? run + 1 : 0;
      if (run > best) { best = run; bestEnd = f.date; }
    }
    const threeEarly = best === 3 && seg.fdps.length === 3 && seg.boundedBefore && seg.boundedAfter &&
      seg.fdps.every((f) => f.tags.length === 1 && f.tags[0] === 'ES');
    if (best > 2 && !threeEarly) problems.push(`${best} seguidos até ${ddmm(bestEnd)}`);
    else if (tagged.length > 3) problems.push(`${tagged.length} entre folgas (${ddmm(tagged[0].date)}–${ddmm(tagged[tagged.length - 1].date)})`);
  }
  const any = segments.some((s) => s.fdps.some((f) => f.tags.length && f.date >= fromISO));
  if (problems.length) return { ...base, status: 'warn', detail: problems.join(' · ') };
  return any
    ? { ...base, status: 'ok', detail: 'Dentro dos limites entre períodos de folga.' }
    : { ...base, status: 'na', detail: 'Sem serviços destes tipos na escala.' };
}

// All checks, in the order the card shows them. `refISO` is today.
export function aeCompliance(duties: ParsedDuty[], refISO: string): ComplianceCheck[] {
  const days = timeline(duties);
  const fromISO = `${refISO.slice(0, 7)}-01`;
  return [
    checkMonthly(days, fromISO),
    checkInterval(days, fromISO),
    checkLongFolgas(days, fromISO),
    checkWeekend(days, fromISO),
    checkWeeklyRest(days, fromISO),
    checkEsLfNd(days, fromISO),
  ];
}

// ── cl. 38 — 42 calendar days of paid holiday per year. Counts the days the imported roster marks
// as PLIC / SLIC / RLIC (holiday types, calendar days) in the year, taken and planned alike; "F"
// (carried-over holiday, working days) is a separate entitlement and is counted apart.
export const HOLIDAY_ENTITLEMENT_DAYS = 42;
const CALENDAR_HOLIDAY = /^(PLIC|SLIC|RLIC)$/;

export interface HolidayCount {
  year: number;
  calendarDays: number; // PLIC / SLIC / RLIC
  carriedDays: number; // F
  entitlement: number;
}

export function holidayCount(duties: ParsedDuty[], year: number): HolidayCount {
  const calendar = new Set<string>();
  const carried = new Set<string>();
  for (const d of duties) {
    if (!d.date.startsWith(`${year}-`) || d.dutyType !== 'Vacation') continue;
    const code = d.dutyCode.toUpperCase();
    if (CALENDAR_HOLIDAY.test(code)) calendar.add(d.date);
    else if (code === 'F') carried.add(d.date);
  }
  return { year, calendarDays: calendar.size, carriedDays: carried.size, entitlement: HOLIDAY_ENTITLEMENT_DAYS };
}
