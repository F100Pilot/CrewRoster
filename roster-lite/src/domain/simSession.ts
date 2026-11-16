import type { ParsedDuty } from './types';
import { diffMinutes, formatDuration } from '../utils/duration';

// EBT simulator sessions (LIS-EBT-1 / LIS-EBT-2, since Sep 2026): the roster only gives the session
// block (4h00 or 5h00); the briefing and debriefing around it are not printed. User rule: day 1 has a
// 30-min briefing and a 1-hour debriefing, day 2 a 1-hour briefing and a 30-min debriefing (user, 0.9.3.15, from his own
// roster: "tem de ser 30 minutos" — 0.8.40.1 had made it 1 h after a colleague's November duty-pay). The roster's times stay as
// printed (the session); the DUTY — limits, rest, duty-pay — runs from the briefing to the end of the
// debriefing (user, Nov 2026: "o tempo de simulador conta o simulador mais o briefing e debriefing").
// The duty's debriefing (`dutyDebriefMin`) follows the company's monthly maps since 0.9.3.83: 05:30 on BOTH days (Sep 2026
// map: LIS-EBT-1 and LIS-EBT-2, 04:00 block each), so day 2's 30-min debriefing counts in the duty too (user: "sim,
// 5h30"; 0.9.3.25 to 0.9.3.82 kept 1 h there).
export interface EbtBriefing { day: 1 | 2; briefMin: number; debriefMin: number; dutyDebriefMin: number }

export function ebtBriefing(d: Pick<ParsedDuty, 'dutyType' | 'dutyCode'>): EbtBriefing | null {
  if (d.dutyType !== 'Simulator') return null;
  const m = /EBT-([12])$/.exec(d.dutyCode ?? '');
  if (!m) return null;
  return m[1] === '1'
    ? { day: 1, briefMin: 30, debriefMin: 60, dutyDebriefMin: 60 }
    : { day: 2, briefMin: 60, debriefMin: 30, dutyDebriefMin: 30 };
}

export const briefLabel = (min: number) => (min < 60 ? `${min} min` : `${min / 60} h`);

// One line for lists: "briefing 30 min · debriefing 1 h".
export const ebtBriefingText = (b: EbtBriefing, sessionMin?: number | null) =>
  `briefing ${briefLabel(b.briefMin)} · debriefing ${briefLabel(b.debriefMin)}`
  + (sessionMin ? ` · serviço ${formatDuration(ebtDutyMinutes(b, sessionMin))}` : '');

/** The duty the app counts for an EBT session of `sessionMin` (briefing + session + the duty's debriefing). */
export const ebtDutyMinutes = (b: EbtBriefing, sessionMin: number) => b.briefMin + sessionMin + b.dutyDebriefMin;

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
  return { ...d, reportingTime: start, departureTime: start, arrivalTime: shift(d.arrivalTime, b.dutyDebriefMin) };
}

/** The session's length as the roster prints it (departure → arrival), or null. */
export const sessionMinutes = (d: Pick<ParsedDuty, 'departureTime' | 'arrivalTime'>) =>
  d.departureTime && d.arrivalTime ? diffMinutes(d.departureTime, d.arrivalTime) : null;
