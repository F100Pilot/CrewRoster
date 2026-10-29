import { toLocalTime } from '../utils/localTime';

// Clock windows of the standby ("assistência") and reserve codes, as published by the DOV in
// "Netline | Atualização sobre Novos Códigos" (14 Feb 2025). The roster grid prints the code but
// not reliably its end, so the duration — what the duty-time limits need — comes from here.
// Times are Lisbon local time, as in the notice.
export interface StandbyWindow {
  start: string; // "HH:mm", Lisbon local
  minutes: number;
}

export const STANDBY_WINDOWS: Record<string, StandbyWindow> = {
  // Pilots — home standby, plus the 24-hour reserve.
  H509: { start: '05:00', minutes: 4 * 60 },
  H616: { start: '06:00', minutes: 10 * 60 },
  'H7+': { start: '07:00', minutes: 10 * 60 },
  'H9+': { start: '09:00', minutes: 10 * 60 },
  'H12+': { start: '12:00', minutes: 10 * 60 },
  'H14+': { start: '14:00', minutes: 10 * 60 },
  'H23+': { start: '23:00', minutes: 10 * 60 },
  R24: { start: '00:00', minutes: 24 * 60 },
  // Cabin crew — home standby.
  A1: { start: '05:00', minutes: 6 * 60 },
  A2: { start: '06:00', minutes: 6 * 60 },
  'A2+': { start: '07:00', minutes: 6 * 60 },
  A3: { start: '09:00', minutes: 6 * 60 },
  'A3++': { start: '11:00', minutes: 6 * 60 },
  A4: { start: '12:00', minutes: 6 * 60 },
  'A4+': { start: '13:30', minutes: 6 * 60 },
  A5: { start: '15:00', minutes: 6 * 60 },
  'A5+': { start: '15:00', minutes: 4 * 60 },
  A6: { start: '18:00', minutes: 4 * 60 },
  A8: { start: '18:00', minutes: 6 * 60 },
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const hhmm = (min: number): string => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// Minutes Lisbon is ahead of UTC on a date (60 in summer, 0 in winter).
export function lisbonOffsetMinutes(dateISO: string): number {
  const noonLocal = toLocalTime(dateISO, '12:00', 'LIS') ?? '12:00';
  return toMinutes(noonLocal) - 12 * 60;
}

// The instant of local midnight in Lisbon at the start of a date, as epoch milliseconds. The
// clocks change at 01:00 UTC, after midnight, so midnight still runs on the PREVIOUS day's offset
// — on the last Sunday of October local midnight is 23:00 UTC the day before.
export function lisbonMidnightUtc(dateISO: string): number {
  const prev = new Date(`${dateISO}T00:00:00Z`);
  prev.setUTCDate(prev.getUTCDate() - 1);
  return new Date(`${dateISO}T00:00:00Z`).getTime() - lisbonOffsetMinutes(prev.toISOString().slice(0, 10)) * 60000;
}

const LISBON_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

// The Lisbon local date and minutes-after-midnight of an instant — read from the timezone
// database at that very instant, so the hour around a clock change comes out right too.
export function lisbonLocal(ms: number): { date: string; minutes: number } {
  const p = Object.fromEntries(LISBON_CLOCK.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

// A Lisbon local clock time on a given date, as the UTC "HH:mm" the rest of the app works in.
// The offset is read for that date, so summer and winter time both come out right.
export function lisbonLocalToUtc(dateISO: string, localHHMM: string): string {
  return hhmm(toMinutes(localHHMM) - lisbonOffsetMinutes(dateISO));
}

// The window of a standby code on a date, in UTC: its start and duration. Null for a code the
// notice doesn't list.
export function standbyWindowUtc(code: string, dateISO: string): { start: string; minutes: number } | null {
  const w = STANDBY_WINDOWS[code.toUpperCase()];
  return w ? { start: lisbonLocalToUtc(dateISO, w.start), minutes: w.minutes } : null;
}
