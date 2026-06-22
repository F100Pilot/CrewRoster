import type { ParsedDuty } from '../../domain/types';
import { inferDutyType } from '../../domain/dutyType';
import { normalizeTime } from '../shared/patterns';

// Minimal, dependency-free CSV parser (handles quoted fields and commas/semicolons).
// Ported in spirit from backend/src/services/csvParser.ts, which used csv-parse.
function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function pick(row: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    if (row[k] != null && row[k] !== '') return row[k];
  }
  return null;
}

export function parseCsv(content: string): ParsedDuty[] {
  const text = content.replace(/^﻿/, ''); // strip BOM
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];

  // Detect delimiter from the header row.
  const delimiter = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const headers = splitCsvLine(lines[0], delimiter);

  const duties: ParsedDuty[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i], delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => (row[h] = values[idx] ?? ''));

    const date = pick(row, ['Date', 'date', 'Datum']);
    const dutyCode = pick(row, ['DutyCode', 'duty_code', 'Code']);
    if (!date || !dutyCode) continue;

    duties.push({
      date,
      dutyCode,
      dutyType: inferDutyType(dutyCode),
      // Normalize to "HH:mm" so downstream block/rest/FTL math (which splits on ":")
      // works regardless of the CSV's time format (0630, 06h30, 6:30…).
      reportingTime: normalizeTime(pick(row, ['ReportingTime', 'reporting_time', 'Report'])),
      departureTime: normalizeTime(pick(row, ['DepartureTime', 'departure_time', 'STD'])),
      arrivalTime: normalizeTime(pick(row, ['ArrivalTime', 'arrival_time', 'STA'])),
      flightNumber: pick(row, ['FlightNumber', 'flight_number', 'Flight']),
      departureAirport: pick(row, ['DepartureAirport', 'departure_airport', 'Dep']),
      arrivalAirport: pick(row, ['ArrivalAirport', 'arrival_airport', 'Arr']),
      aircraftType: pick(row, ['AircraftType', 'aircraft_type', 'AC']),
      observations: pick(row, ['Observations', 'observations', 'Notes']),
    });
  }
  return duties;
}
