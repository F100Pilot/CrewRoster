import { format, subDays } from 'date-fns';

// How many days BEFORE today a roster download starts by default.
//
// CrewLink rewrites a flight's times once it has been operated (the plan gives way to what
// actually happened), so a download that begins "today" can never correct a sector already
// flown: those days aren't in the PDF, so neither the roster nor the logbook ever sees the
// final times. Reaching a week back lets each sync settle the days just flown — mergeDuties
// overrides per day and mergeLogbook then refreshes the (non hand-edited) logbook rows.
export const SYNC_LOOKBACK_DAYS = 7;

/** Default "from" date for a roster download: a week back, so just-flown days re-sync. */
export function defaultBeginDate(today: Date = new Date()): string {
  return format(subDays(today, SYNC_LOOKBACK_DAYS), 'yyyy-MM-dd');
}

/** Today as YYYY-MM-DD (local). The cut-off for "still actionable": a sync reaches back over
 *  days already flown, and their settled times must not be reported as roster changes. */
export function todayISO(today: Date = new Date()): string {
  return format(today, 'yyyy-MM-dd');
}
