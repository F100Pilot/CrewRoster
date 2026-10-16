// The windows the FTL / company-agreement limits are measured over, shared by flight time and
// duty time. Each works on a per-day series of counted minutes.
export interface DayAmount {
  date: string; // YYYY-MM-DD
  minutes: number;
}

export interface PeakWindow {
  minutes: number;
  endDate: string | null; // the day the worst window ends on
}

const isoMinusDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

// The heaviest `span` consecutive days ANYWHERE in the series — past or future. The limits apply
// to "any N consecutive days", so a trailing-to-today total can read green while next week's
// roster already breaches the cap. The worst window always ends on a day that has an amount, so
// only those need testing.
export function peakWindow(days: DayAmount[], span: number): PeakWindow {
  if (days.length === 0) return { minutes: 0, endDate: null };
  let best: PeakWindow = { minutes: 0, endDate: days[0].date };
  for (const end of days) {
    const fromISO = isoMinusDays(end.date, span - 1);
    let sum = 0;
    for (const d of days) if (d.date >= fromISO && d.date <= end.date) sum += d.minutes;
    if (sum > best.minutes) best = { minutes: sum, endDate: end.date };
  }
  return best;
}

// Sum over the `span` days ending at refISO (inclusive).
export function trailingSum(days: DayAmount[], refISO: string, span: number): number {
  const fromISO = isoMinusDays(refISO, span - 1);
  return days.reduce((s, d) => (d.date >= fromISO && d.date <= refISO ? s + d.minutes : s), 0);
}

export interface PeakQuarter {
  minutes: number;
  label: string | null; // e.g. "4.º trim. 2026"
}

// Calendar quarters, as the company agreement defines them (RUPT cl. 6, def. 47: the first
// quarter is January–March). Returns the heaviest quarter from the one containing refISO onward —
// the current quarter with whatever is already planned in it, or a later one the roster reaches
// into. Past quarters are left out: they can no longer be breached.
export function peakQuarter(days: DayAmount[], refISO: string): PeakQuarter {
  const key = (iso: string) => `${iso.slice(0, 4)}-${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
  const current = key(refISO);
  const totals = new Map<string, number>([[current, 0]]);
  for (const d of days) {
    const k = key(d.date);
    if (k < current) continue;
    totals.set(k, (totals.get(k) ?? 0) + d.minutes);
  }
  let best: PeakQuarter = { minutes: -1, label: null };
  for (const [k, minutes] of totals) {
    if (minutes > best.minutes) {
      const [y, q] = k.split('-');
      best = { minutes, label: `${q}.º trim. ${y}` };
    }
  }
  return best;
}
