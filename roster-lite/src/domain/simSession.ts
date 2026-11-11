import type { ParsedDuty } from './types';

// EBT simulator sessions (LIS-EBT-1 / LIS-EBT-2, since Sep 2026): the roster only gives the session
// block (4h00 or 5h00); the briefing and debriefing around it are not printed. User rule: day 1 has a
// 30-min briefing and a 1-hour debriefing, day 2 the other way round. Shown as extra information —
// the roster's own times stay as they are.
export interface EbtBriefing { day: 1 | 2; briefMin: number; debriefMin: number }

export function ebtBriefing(d: Pick<ParsedDuty, 'dutyType' | 'dutyCode'>): EbtBriefing | null {
  if (d.dutyType !== 'Simulator') return null;
  const m = /EBT-([12])$/.exec(d.dutyCode ?? '');
  if (!m) return null;
  return m[1] === '1' ? { day: 1, briefMin: 30, debriefMin: 60 } : { day: 2, briefMin: 60, debriefMin: 30 };
}

export const briefLabel = (min: number) => (min < 60 ? `${min} min` : `${min / 60} h`);

// One line for lists: "briefing 30 min · debriefing 1 h".
export const ebtBriefingText = (b: EbtBriefing) => `briefing ${briefLabel(b.briefMin)} · debriefing ${briefLabel(b.debriefMin)}`;
