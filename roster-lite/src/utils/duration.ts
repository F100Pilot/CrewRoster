// Time-span helpers for flight block time and duty length.
//
// All schedule times are UTC "HH:mm" strings (see localTime.ts). A flight that lands
// "before" it departs has crossed midnight, so negative spans wrap into the next day.

// Whole minutes between two "HH:mm" times, wrapping past midnight (max one day).
export function diffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let d = eh * 60 + em - (sh * 60 + sm);
  if (d < 0) d += 24 * 60; // crossed midnight
  return d;
}

// "2h45" / "8h05" / "45m" — clearly a duration, never confusable with a clock time.
export function formatDuration(min: number): string {
  if (min < 0) min = 0;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

// A UTC Date from a duty date (YYYY-MM-DD) and a "HH:mm" UTC time.
export function utcDateTime(dateISO: string, hhmm: string): Date {
  return new Date(`${dateISO}T${hhmm}:00Z`);
}

// Coarse "in 3d 4h" / "in 2h 10m" / "in 5m" countdown from now to a future instant.
// Returns null once the instant is in the past.
export function countdownTo(target: Date, now: Date = new Date()): string | null {
  let mins = Math.round((target.getTime() - now.getTime()) / 60000);
  if (mins <= 0) return null;
  const d = Math.floor(mins / (24 * 60));
  mins -= d * 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}
