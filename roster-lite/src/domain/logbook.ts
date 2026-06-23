import type { AircraftReg, ParsedDuty } from './types';
import { operatedFlights } from './flightTime';
import { regMapKey, resolveRegs } from './aircraftRegs';
import { diffMinutes, formatDuration } from '../utils/duration';

// A pilot's logbook row, one per operated sector. Built straight from the roster so
// there's nothing to copy by hand.
export interface LogbookEntry {
  date: string;
  flightNumber: string;
  from: string;
  to: string;
  off: string; // departure time, UTC "HH:mm"
  on: string; // arrival time, UTC "HH:mm"
  blockMinutes: number;
  aircraft: string;
  reg: string; // aircraft registration (recorded from flight info), or ''
  regInferred: boolean; // tail inferred from a same-day rotation sibling, not captured directly
}

// `regs` maps date+flight+route → recorded registration; pass it to fill the tail. Tails
// are resolved across same-day rotations too (one captured leg fills its siblings).
export function logbookEntries(
  duties: ParsedDuty[], regs?: Map<string, AircraftReg>,
): LogbookEntry[] {
  const resolved = resolveRegs(duties, regs ?? new Map());
  return operatedFlights(duties).map((d) => {
    const hit = resolved.get(regMapKey(d.date, d.flightNumber ?? '', d.departureAirport, d.arrivalAirport));
    return {
      date: d.date,
      flightNumber: d.flightNumber ?? '',
      from: d.departureAirport ?? '',
      to: d.arrivalAirport ?? '',
      off: d.departureTime!,
      on: d.arrivalTime!,
      blockMinutes: diffMinutes(d.departureTime!, d.arrivalTime!),
      aircraft: d.aircraftType ?? '',
      reg: hit?.reg ?? '',
      regInferred: hit?.inferred ?? false,
    };
  });
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// CSV with a header row, CRLF line endings (spreadsheet-friendly).
export function logbookCsv(entries: LogbookEntry[]): string {
  const header = ['Data', 'Voo', 'De', 'Para', 'Off (UTC)', 'On (UTC)', 'Bloco', 'Aeronave', 'Matrícula'];
  const rows = entries.map((e) => [
    e.date,
    e.flightNumber,
    e.from,
    e.to,
    e.off,
    e.on,
    formatDuration(e.blockMinutes),
    e.aircraft,
    e.reg,
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

// Landings in the trailing `days`-day window ending at refISO. One operated sector
// is one landing — the basis for recency (e.g. 3 landings in 90 days).
export function landingsInWindow(duties: ParsedDuty[], refISO: string, days = 90): number {
  const ref = new Date(`${refISO}T00:00:00Z`);
  const from = new Date(ref);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  const fromISO = from.toISOString().slice(0, 10);
  return operatedFlights(duties).filter((d) => d.date >= fromISO && d.date <= refISO).length;
}
