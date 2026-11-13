// Sharing a month's roster with people outside the app (family, a colleague swapping a day…):
// a plain day-by-day text for WhatsApp/SMS/e-mail, or a calendar file they can add to theirs.
// Only the schedule goes out — never crew names, pay or AE figures — and times are local at the
// airport, the clock someone at home reads (UTC only where the airport's timezone is unknown).
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import type { ParsedDuty } from '../domain/types';
import { dayLabel } from './dates';
import { dutyTypeLabel } from '../domain/dutyLabels';
import { toLocalTime } from './localTime';
import { buildIcsFor } from './icsExport';
import { downloadBlob } from './download';

const clock = (date: string, utc: string | null, airport: string | null) =>
  utc ? (toLocalTime(date, utc, airport) ?? `${utc}z`) : null;

// One line per day with something on it, in date order.
export function monthText(monthKey: string, duties: ParsedDuty[], base: string): string {
  const month = duties.filter((d) => d.date.startsWith(monthKey));
  const days = [...new Set(month.map((d) => d.date))].sort();
  const title = format(parseISO(`${monthKey}-01`), 'MMMM yyyy', { locale: pt });
  const lines = days.map((date) => {
    const day = month.filter((d) => d.date === date);
    const legs = day.filter((d) => d.flightNumber && d.departureAirport && d.arrivalAirport)
      .sort((a, b) => (a.departureTime ?? '').localeCompare(b.departureTime ?? ''));
    let what: string;
    if (legs.length) {
      const first = legs[0];
      const last = legs[legs.length - 1];
      const route = [first.departureAirport, ...legs.map((l) => l.arrivalAirport)].join(' → ');
      const from = clock(date, first.departureTime, first.departureAirport);
      const to = clock(date, last.arrivalTime, last.arrivalAirport);
      const away = last.arrivalAirport !== base ? ` (fica em ${last.arrivalAirport})` : '';
      what = `Voo ${route}${from && to ? ` · ${from}–${to}` : ''}${away}`;
    } else {
      const d = day[0];
      const t0 = clock(date, d.departureTime, d.departureAirport ?? base);
      const t1 = clock(date, d.arrivalTime, d.departureAirport ?? base);
      what = `${dutyTypeLabel(d.dutyType)}${d.dutyType === 'Day Off' || d.dutyType === 'Vacation' ? '' : ` ${d.dutyCode}`}${t0 && t1 ? ` · ${t0}–${t1}` : ''}`;
    }
    return `${dayLabel(date)} — ${what}`;
  });
  return [`Escala de ${title}`, '', ...lines, '', 'Horas locais.'].join('\n');
}

async function shareFile(blob: Blob, fileName: string, title: string): Promise<void> {
  const file = new File([blob], fileName, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
    }
  }
  downloadBlob(blob, fileName);
}

// The text through the share sheet; without one (desktop), copied to the clipboard.
export async function shareMonthText(monthKey: string, duties: ParsedDuty[], base: string): Promise<'shared' | 'copied' | 'failed'> {
  const text = monthText(monthKey, duties, base);
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Escala', text });
      return 'shared';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'shared';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

// Only this month's duties, as a .ics the other person opens to add to their calendar.
export async function shareMonthIcs(monthKey: string, duties: ParsedDuty[]): Promise<void> {
  const title = format(parseISO(`${monthKey}-01`), 'MMMM yyyy', { locale: pt });
  const ics = buildIcsFor(duties.filter((d) => d.date.startsWith(monthKey)), `Escala ${title}`);
  await shareFile(new Blob([ics], { type: 'text/calendar' }), `escala-${monthKey}.ics`, `Escala de ${title}`);
}
