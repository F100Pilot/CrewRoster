import type { ParsedDuty } from './types';

// Two things the pilot settles on the day page, over what the roster prints (pilots only — AE):
//
// • A flight on a planned day off ("Voo em Off" under the sector). RRRGS cl. 13: accepted at the
//   company's invitation (RUPT cl. 15.18), each flight duty period of the day is paid at 3% of the VB
//   an hour plus 15% of the VB for the day given up, the month after — and those hours stay out of
//   the monthly plafonds (cl. 13.5, no double pay). Or the pilot keeps the day off and takes it later
//   (RUPT cl. 15.9 b / 15.19): then the day is ordinary work. A colleague asked for the choice.
// • A reduced rest ("Reducao Repouso"): at base by an irregularity and with the pilot's agreement, up
//   to 2 h (RUPT cl. 34.3); on a night stop, cl. 36. RRRGS cl. 2.8 pays the time cut in duty-pay,
//   outside the plafonds. The pilot types the minutes (a colleague: "meterem o número de minutos").

export type OffDayChoice = 'paid' | 'kept';
export const OFF_DAY_HOURLY = 0.03; // cl. 13.1 — 3% of the VB an hour
export const OFF_DAY_BONUS = 0.15; // cl. 13.2 b — 15% of the VB per day off given up
export const REST_CUT_MAX = 120; // RUPT cl. 34.3 — at most 2 h

const marks = (d: ParsedDuty) => (d.observations ?? '').split(/,\s*/);
const flying = (d: ParsedDuty) => d.dutyType === 'Flight Duty' || d.dutyType === 'Positioning';

export const markedOffDay = (day: ParsedDuty[]) => day.some((d) => flying(d) && marks(d).includes('VOO_OFF'));
export const markedRestCut = (day: ParsedDuty[]) => day.some((d) => marks(d).includes('RED_REP'));

// The day's choice: the pilot's, else paid when the roster marks the flight as on a day off.
export function offDayChoice(day: ParsedDuty[]): OffDayChoice | null {
  if (!day.some(flying)) return null;
  const own = day.find((d) => d.offDayPay)?.offDayPay;
  if (own) return own;
  return markedOffDay(day) ? 'paid' : null;
}

// The minutes the pilot typed for the rest cut before this day, or null.
export function restCutOf(day: ParsedDuty[]): number | null {
  const v = day.find((d) => d.restCutMin != null)?.restCutMin;
  return v == null ? null : Math.max(0, Math.min(REST_CUT_MAX, v));
}
