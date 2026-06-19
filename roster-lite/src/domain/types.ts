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

export interface UserProfile {
  id: string;
  name: string;
  crewCode?: string;
  createdAt: string;
}

// A fully imported roster, as persisted in IndexedDB.
export interface Roster {
  id: string; // userId
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

// A PDF downloaded from CrewLink, kept in IndexedDB so the user can re-open,
// re-download, or delete it. Registered by download time and date range.
export interface SavedPdf {
  id: string;
  fileName: string;
  blob: Blob;
  downloadedAt: string; // ISO timestamp of when it was fetched
  beginDate: string | null; // ISO YYYY-MM-DD (requested range start), or null
  endDate: string | null; // ISO YYYY-MM-DD (requested range end), or null = server max
}
