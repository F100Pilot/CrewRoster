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

// A single day's change between the previous roster and a freshly imported one.
export type ChangeType = 'added' | 'removed' | 'modified';
export interface DayChange {
  date: string; // YYYY-MM-DD
  type: ChangeType;
}

// A crew member is either a pilot (flight crew) or cabin crew. Some features —
// logbook, landing recency — only make sense for pilots; flight-time limits and
// rest apply to both. Treat a missing role as 'pilot' for backward compatibility.
export type CrewRole = 'pilot' | 'cabin';

export interface UserProfile {
  id: string;
  name: string;
  crewCode?: string;
  role?: CrewRole; // default 'pilot'
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
  changes?: DayChange[]; // what changed vs the previous import (Tier 2 diff)
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
