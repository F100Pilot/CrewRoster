import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';

// Dates as the screens show them, in Portuguese — "Qua, 28 set", "novembro 2026". Kept apart
// from date-fns' default (English) locale on purpose: the PDF parser matches the roster's own
// English day headers ("Mon01") with the default.
const clean = (s: string) => s.replace('.', '');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function dayLabel(iso: string, withYear = false): string {
  const d = parseISO(iso);
  const base = `${cap(clean(format(d, 'EEE', { locale: pt })))}, ${format(d, 'dd')} ${clean(format(d, 'MMM', { locale: pt }))}`;
  return withYear ? `${base} ${format(d, 'yyyy')}` : base;
}

export const monthLabel = (d: Date): string => cap(format(d, 'MMMM yyyy', { locale: pt }));
