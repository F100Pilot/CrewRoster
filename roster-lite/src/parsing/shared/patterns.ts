// Shared text patterns, centralized from backend/src/services/icsParser.ts (parseSummary).
// PGA / TAP Express flights use TP and NI prefixes.

export const ROUTE_RE = /^([A-Z]{3})-([A-Z]{3})$/; // e.g. LIS-OPO
export const FLIGHT_RE = /^([A-Z]{2}\d{1,4}[A-Z]?)$/i; // e.g. TP1920, NI453
export const TIME_RE = /^([0-2]?\d[:.h][0-5]\d)$/; // 06:30, 06.30, 06h30
export const DUTY_CODE_RE = /^([A-Z]{2,5})$/;

// Normalize a time token to HH:MM, or return null if it isn't a time.
export function normalizeTime(token: string | null | undefined): string | null {
  if (!token) return null;
  const m = token.match(/(\d{1,2})[:.h](\d{2})/);
  if (!m) return null;
  const h = m[1].padStart(2, '0');
  return `${h}:${m[2]}`;
}

// Extract flight number, route and a duty code from a free-form summary/line.
// Mirrors the logic of parseSummary() in the original icsParser.
export function parseSummary(summary: string): {
  dutyCode: string;
  flightNumber: string | null;
  departureAirport: string | null;
  arrivalAirport: string | null;
} {
  const parts = summary.split(/\s+/).filter(Boolean);
  let dutyCode = 'UNK';
  let flightNumber: string | null = null;
  let departureAirport: string | null = null;
  let arrivalAirport: string | null = null;

  for (const part of parts) {
    const route = part.match(ROUTE_RE);
    if (route) {
      departureAirport = route[1];
      arrivalAirport = route[2];
      continue;
    }
    const flight = part.match(FLIGHT_RE);
    if (flight) {
      flightNumber = flight[1].toUpperCase();
      continue;
    }
    const code = part.match(DUTY_CODE_RE);
    if (code) dutyCode = code[1].toUpperCase();
  }

  return { dutyCode, flightNumber, departureAirport, arrivalAirport };
}
