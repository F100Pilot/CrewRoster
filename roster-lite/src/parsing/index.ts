import type { ParseResult, ParsedDuty } from '../domain/types';
import { parseCsv } from './csv/parseCsv';
import { parseIcs } from './ics/parseIcs';
import { extractPdf } from './pdf/extractText';
import { reconstructLines } from './pdf/reconstructLines';
import { interpret } from './pdf/interpret';
import { interpretPgaGrid } from './pdf/pgaGrid';
import { parseCrewInfo, attachCrewToDuties, reattachCrew, CREW_PARSER_VERSION, type CrewLeg } from './pdf/crewInfo';

export { CREW_PARSER_VERSION };

function sortByDate(duties: ParseResult['duties']): ParseResult['duties'] {
  return [...duties].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Re-derive crew for an already-imported roster by re-running the (current) crew parser on the
// PDFs that produced it. Returns the duties with refreshed crew; if no crew section is found in
// any PDF (or all are unreadable) the duties are returned unchanged. Lets older rosters pick up
// parser improvements on load without the user having to re-import — see RosterProvider.
export async function refreshCrewFromPdfs(duties: ParsedDuty[], buffers: ArrayBuffer[]): Promise<ParsedDuty[]> {
  const legs: CrewLeg[] = [];
  for (const buf of buffers) {
    try {
      const { tokens } = await extractPdf(buf);
      legs.push(...parseCrewInfo(tokens));
    } catch {
      // A single corrupt/unreadable PDF must not abort the refresh — skip it.
    }
  }
  if (legs.length === 0) return duties;
  // Work on a copy (with copied crew arrays) so callers can compare and avoid a needless write.
  const copy = duties.map((d) => ({ ...d, crew: d.crew?.map((c) => ({ ...c })) }));
  reattachCrew(copy, legs);
  return copy;
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
      // Attach the rostered crew (from the "Crew Information on Leg" section) to each flight.
      attachCrewToDuties(pgaDuties, parseCrewInfo(extracted.tokens));
      return { sourceType: 'pdf', duties: sortByDate(pgaDuties), rawText: extracted.rawText, warnings: [] };
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
