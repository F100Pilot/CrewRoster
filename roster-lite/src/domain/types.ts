// The ParsedDuty contract is kept identical to backend/src/services/csvParser.ts so the
// ported CSV/ICS parsers and any future PDF interpreter all converge on one shape.
export interface ParsedDuty {
  date: string; // YYYY-MM-DD
  dutyCode: string;
  dutyType: string;
  reportingTime: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  flightNumber: string | null;
  departureAirport: string | null;
  arrivalAirport: string | null;
  aircraftType: string | null;
  observations: string | null;
}

export type SourceType = 'pdf' | 'csv' | 'ics';

// A fully imported roster, as persisted in IndexedDB.
export interface Roster {
  id: 'current';
  fileName: string;
  sourceType: SourceType;
  importedAt: string; // ISO timestamp
  duties: ParsedDuty[];
  rawText: string; // extracted text — powers the debug view and the raw fallback
}

// Result of running a file through the parsing pipeline (before persistence).
export interface ParseResult {
  sourceType: SourceType;
  duties: ParsedDuty[];
  rawText: string;
  warnings: string[];
}
