import type { ParsedDuty } from './types';

// Global roster search: match a query against flights (number, airports, route, crew), duty
// codes/types and dates — returning hits that jump to the day (and the specific flight).

export interface SearchHit {
  date: string;
  flightNumber: string | null;
  dep: string | null;
  arr: string | null;
  title: string; // main line
  isFlight: boolean;
}

export function searchRoster(duties: ParsedDuty[], query: string, limit = 80): SearchHit[] {
  const q = query.trim().toUpperCase();
  if (q.length < 2) return [];
  const hits: SearchHit[] = [];
  for (const d of duties) {
    const hay: string[] = [d.dutyCode, d.dutyType, d.flightNumber ?? '', d.departureAirport ?? '', d.arrivalAirport ?? '', d.date];
    if (d.departureAirport && d.arrivalAirport) hay.push(`${d.departureAirport}-${d.arrivalAirport}`);
    const [y, m, dd] = d.date.split('-');
    hay.push(`${dd}/${m}`, `${dd}/${m}/${y}`);
    if (d.crew) for (const c of d.crew) { hay.push(c.login, c.surname); if (c.firstName) hay.push(c.firstName); }
    if (!hay.some((h) => h.toUpperCase().includes(q))) continue;

    const isFlight = d.dutyType === 'Flight Duty' && !!d.flightNumber;
    hits.push({
      date: d.date,
      flightNumber: d.flightNumber ?? null,
      dep: d.departureAirport ?? null,
      arr: d.arrivalAirport ?? null,
      title: isFlight
        ? `${d.flightNumber} · ${d.departureAirport ?? '—'}–${d.arrivalAirport ?? '—'}`
        : (d.dutyType || d.dutyCode),
      isFlight,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}
