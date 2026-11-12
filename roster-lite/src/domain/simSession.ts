import type { ParsedDuty } from './types';

// EBT simulator sessions (LIS-EBT-1 / LIS-EBT-2, since Sep 2026): the roster only gives the session
// block (4h00 or 5h00); the briefing and debriefing around it are not printed. User rule: day 1 has a
// 30-min briefing and a 1-hour debriefing, day 2 a 1-hour briefing and a 1-hour debriefing (corrected in
// 0.8.40.1 from 30 min, by a colleague's November duty-pay: the roster's DT for a 4 h EBT-2 is 06:00). The roster's times stay as
// printed (the session); the DUTY — limits, rest, duty-pay — runs from the briefing to the end of the
// debriefing (user, Nov 2026: "o tempo de simulador conta o simulador mais o briefing e debriefing").
export interface EbtBriefing { day: 1 | 2; briefMin: number; debriefMin: number }

export function ebtBriefing(d: Pick<ParsedDuty, 'dutyType' | 'dutyCode'>): EbtBriefing | null {
  if (d.dutyType !== 'Simulator') return null;
  const m = /EBT-([12])$/.exec(d.dutyCode ?? '');
  if (!m) return null;
  return m[1] === '1' ? { day: 1, briefMin: 30, debriefMin: 60 } : { day: 2, briefMin: 60, debriefMin: 60 };
}

export const briefLabel = (min: number) => (min < 60 ? `${min} min` : `${min / 60} h`);

// One line for lists: "briefing 30 min · debriefing 1 h".
export const ebtBriefingText = (b: EbtBriefing) => `briefing ${briefLabel(b.briefMin)} · debriefing ${briefLabel(b.debriefMin)}`;

const shift = (hhmm: string, min: number) => {
  const t = ((Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + min) % 1440 + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

// The duty as worked: an EBT session widened by its briefing before and debriefing after (a copy;
// any other duty is returned as it is). Used by the duty-time maths, never for display.
export function asWorked(d: ParsedDuty): ParsedDuty {
  const b = ebtBriefing(d);
  if (!b || !d.departureTime || !d.arrivalTime) return d;
  const start = shift(d.departureTime, -b.briefMin);
  return { ...d, reportingTime: start, departureTime: start, arrivalTime: shift(d.arrivalTime, b.debriefMin) };
}
