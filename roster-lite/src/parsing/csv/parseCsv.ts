import type { ParsedDuty } from '../../domain/types';
import { inferDutyType } from '../../domain/dutyType';
import { normalizeTime } from '../shared/patterns';

// Minimal, dependency-free CSV parser (handles quoted fields and commas/semicolons).
// Ported in spirit from backend/src/services/csvParser.ts, which used csv-parse.
// Tokenizes the whole text into records tracking quote state across newlines, so a
// quoted field containing a line break (e.g. multi-line observations) doesn't corrupt
// the record split.
function parseCsvRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let pending = false; // a field/record is in progress (so we emit a trailing record)
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true; pending = true;
    } else if (ch === delimiter) {
      record.push(field); field = ''; pending = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++; // consume CRLF as one break
      if (pending || field !== '') { record.push(field); records.push(record); }
      field = ''; record = []; pending = false;
    } else {
      field += ch; pending = true;
    }
  }
  if (pending || field !== '') { record.push(field); records.push(record); }
  return records.map((r) => r.map((c) => c.trim()));
}

function pick(row: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    if (row[k] != null && row[k] !== '') return row[k];
  }
  return null;
}

export function parseCsv(content: string): ParsedDuty[] {
  const text = content.replace(/^﻿/, ''); // strip BOM
  // Detect the delimiter from the header (first physical line, before any quoted break).
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const records = parseCsvRecords(text, delimiter).filter((r) => r.some((c) => c !== ''));
  if (records.length < 2) return [];

  const headers = records[0];
  const duties: ParsedDuty[] = [];
  for (let i = 1; i < records.length; i++) {
    const values = records[i];
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
