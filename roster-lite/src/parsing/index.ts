import type { ParseResult } from '../domain/types';
import { parseCsv } from './csv/parseCsv';
import { parseIcs } from './ics/parseIcs';
import { extractPdf } from './pdf/extractText';
import { reconstructLines } from './pdf/reconstructLines';
import { interpret } from './pdf/interpret';
import { interpretPgaGrid, pgaBlankDates } from './pdf/pgaGrid';
import { parseCrewInfo, parseGroundCrewInfo, attachCrewToDuties, attachGroundCrewToDuties } from './pdf/crewInfo';

// Bumped whenever the PDF parsing (duties, crew, times, routes…) changes in a way that should
// re-apply to ALREADY-imported rosters. On app load a stored PDF roster whose parseVersion is
// behind this is re-parsed from its saved PDF(s) — see RosterProvider — so improvements reach
// the user without re-downloading. Bump this with any meaningful parser change.
export const PARSE_VERSION = 16; // 16: blank grid days clear the stored day (merge); 15: a delayed day keeps the planned report (rosterMerge); 14: LIFUS_INS / FAM_INS marks

function sortByDate(duties: ParseResult['duties']): ParseResult['duties'] {
  return [...duties].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Dispatch a user-provided file through the right parser. All paths converge on
// ParsedDuty[] + rawText so the UI and storage have a single code path.
export async function parseRosterFile(file: File): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'pdf') {
    const buf = await file.arrayBuffer();
    const extracted = await extractPdf(buf);

    // Primary: the PGA "Individual duty plan" grid parser.
    const pgaDuties = interpretPgaGrid(extracted.tokens);
    if (pgaDuties.length > 0) {
      // Attach the rostered crew (from the "Crew Information on Leg" section) to each flight,
      // and the simulator/ground crew (from "Crew Information on Ground Activity") to those duties.
      attachCrewToDuties(pgaDuties, parseCrewInfo(extracted.tokens));
      attachGroundCrewToDuties(pgaDuties, parseGroundCrewInfo(extracted.tokens));
      const parsed = new Set(pgaDuties.map((d) => d.date));
      const blankDates = pgaBlankDates(extracted.tokens).filter((d) => !parsed.has(d));
      return { sourceType: 'pdf', duties: sortByDate(pgaDuties), rawText: extracted.rawText, warnings: [], blankDates };
    }

    // Fallback: generic line-based interpreter (other/unknown PDF layouts).
    const lines = reconstructLines(extracted.tokens);
    const { duties, warnings } = interpret(lines);
    return { sourceType: 'pdf', duties: sortByDate(duties), rawText: extracted.rawText, warnings };
  }

  const text = await file.text();
  if (ext === 'ics') {
    const duties = parseIcs(text);
    return {
      sourceType: 'ics',
      duties: sortByDate(duties),
      rawText: text,
      warnings: duties.length ? [] : ['Nenhum evento encontrado no ICS.'],
    };
  }
  if (ext === 'csv') {
    const duties = parseCsv(text);
    return {
      sourceType: 'csv',
      duties: sortByDate(duties),
      rawText: text,
      warnings: duties.length ? [] : ['Nenhuma linha de escala encontrada no CSV.'],
    };
  }

  throw new Error(`Tipo de ficheiro não suportado: .${ext}. Usa PDF, CSV ou ICS.`);
}
