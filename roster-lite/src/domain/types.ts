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
  /** Layover hotel for this duty's overnight (resolved from a day's "Hn" marker). */
  hotel?: { name: string; phone: string | null } | null;
  /** Crew rostered on this flight (from the PDF's "Crew Information on Leg" section). */
  crew?: CrewMember[];
}

// One crew member on a leg, from the PDF "Crew Information on Leg" section.
// e.g. token "FBARROS, BARROS, FO FILIPE" → {login:'FBARROS', surname:'BARROS', role:'FO', firstName:'FILIPE'}
export interface CrewMember {
  login: string;
  surname: string;
  role: string; // CP (captain), FO (first officer), PU (purser), ST (cabin)
  firstName?: string;
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

// A flown aircraft registration, recorded per crew member + day + flight. Kept apart
// from the roster so it survives roster re-downloads and powers the logbook.
export interface AircraftReg {
  key: string; // `${userId}|${date}|${flightNumber}`
  userId: string;
  date: string; // YYYY-MM-DD
  flightNumber: string;
  dep: string | null;
  arr: string | null;
  reg: string; // e.g. CS-TPU
  model: string | null;
  recordedAt: string; // ISO timestamp
}

// A permanent logbook row, one per operated sector. Persisted on its own (separate from
// the roster) so it survives clearing the roster: new rosters merge new sectors in, and
// the user can edit/add/remove rows by hand. Block time is derived from off/on.
export interface LogbookRow {
  key: string; // `${userId}|${date}|${flightNumber}|${dep}-${arr}`
  userId: string;
  date: string; // YYYY-MM-DD
  flightNumber: string;
  from: string; // departure airport
  to: string; // arrival airport
  off: string; // departure time, UTC "HH:mm"
  on: string; // arrival time, UTC "HH:mm"
  aircraft: string; // type, e.g. E90
  reg: string; // tail, '' if unknown
  regInferred?: boolean; // tail inferred from the day's rotation, not captured directly
  edited?: boolean; // added/edited by hand → not overwritten by roster merges
}

// A crew document with an expiry the pilot wants to track (medical, licence, OPC/LPC,
// passport…). Permanent and per-user, independent of the roster.
export interface CrewDocument {
  id: string;
  userId: string;
  name: string;
  expiry: string; // YYYY-MM-DD
}

// A PDF downloaded from CrewLink, kept in IndexedDB so the user can re-open,
// re-download, or delete it. Registered by download time and date range.
export interface SavedPdf {
  id: string;
  userId?: string; // the crew member this PDF belongs to (per-user history)
  fileName: string;
  blob: Blob;
  downloadedAt: string; // ISO timestamp of when it was fetched
  beginDate: string | null; // ISO YYYY-MM-DD (requested range start), or null
  endDate: string | null; // ISO YYYY-MM-DD (requested range end), or null = server max
}
