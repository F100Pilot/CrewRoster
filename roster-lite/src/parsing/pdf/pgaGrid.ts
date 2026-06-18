// PGA NetLine "Individual duty plan" parser.
//
// This PDF is a dense, transposed layout: each duty period is drawn as a GRID where
// the days are COLUMNS and attributes (duty, airport, dep/arr times, aircraft, info)
// are stacked rows beneath each day header. There are several such grids per page and
// they overlap/repeat across pages, so we parse every grid and de-duplicate by date.
//
// Operates purely on positioned tokens (no pdf.js import) so it is unit-testable with a
// captured token fixture (see __tests__/fixtures/pga-tokens.json).
import { addDays, format, isValid, parse as parseDate } from 'date-fns';
import type { ParsedDuty } from '../../domain/types';
import type { PositionedToken } from './extractText';

const DOW = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\d{2}$/;
const PERIOD = /(\d{2})([A-Za-z]{3})(\d{2})/; // 15Jun26 (may have surrounding text)
const AIRPORT = /^[A-Z]{3}$/;
const TIME = /^([0-2]\d)([0-5]\d)$/; // 0440 -> 04:40
const AIRCRAFT = /^(E\d{2}|A\d{3}|B\d{3})$/i; // E90, E95, A320...
const CARRIER = /^(DH\/)?(TP|LH|NI|S4)$/i; // carrier or deadhead prefix

interface Row {
  y: number;
  cells: PositionedToken[];
}

interface Column {
  x: number;
  token: string; // e.g. "Mon15"
}

function clusterRows(tokens: PositionedToken[], tol = 2.5): Row[] {
  const rows: Row[] = [];
  for (const t of tokens) {
    const row = rows.find((r) => Math.abs(r.y - t.y) <= tol);
    if (row) row.cells.push(t);
    else rows.push({ y: t.y, cells: [t] });
  }
  rows.sort((a, b) => b.y - a.y);
  for (const r of rows) r.cells.sort((a, b) => a.x - b.x);
  return rows;
}

// --- Date reconstruction -------------------------------------------------------------
// Day tokens are weekday+day-of-month only ("Mon15"); reconstruct full dates from the
// period start date printed in the header.
function buildDateMap(tokens: PositionedToken[]): Map<string, string> {
  const map = new Map<string, string>();
  // The duty-plan period start is printed as "<date> -" (e.g. "15Jun26 -"). Anchor on
  // that so we don't pick up unrelated dates (licence validity, vacation ranges, etc.).
  const startToken = tokens.map((t) => t.text.match(/^(\d{2})([A-Za-z]{3})(\d{2})\s*-\s*$/)).find((m) => !!m);
  let start: Date | undefined;
  if (startToken) start = parseDate(`${startToken[1]}${startToken[2]}${startToken[3]}`, 'ddMMMyy', new Date());
  if (!start || !isValid(start)) {
    const periods = tokens
      .map((t) => t.text.match(PERIOD))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => parseDate(`${m[1]}${m[2]}${m[3]}`, 'ddMMMyy', new Date()))
      .filter((d) => isValid(d))
      .sort((a, b) => a.getTime() - b.getTime());
    start = periods[0] ?? new Date();
  }
  // Walk 70 days from the start; first occurrence of each weekday+dd key wins.
  for (let i = 0; i < 70; i++) {
    const d = addDays(start, i);
    const key = format(d, 'EEEdd'); // "Mon15"
    if (!map.has(key)) map.set(key, format(d, 'yyyy-MM-dd'));
  }
  return map;
}

function toTime(token: string): string | null {
  const m = token.match(TIME);
  return m ? `${m[1]}:${m[2]}` : null;
}

// Map a non-flight PGA duty-name token to a readable duty type + normalized code.
// Returns null for anything that isn't a duty "starter" (annotations, crew, etc.).
function classifyDuty(name: string): { dutyType: string; dutyCode: string } | null {
  const n = name.toUpperCase();
  if (/^W?_?OFF$/.test(n) || n === 'X') return { dutyType: 'Day Off', dutyCode: 'OFF' };
  if (/^E\d{2}-[A-Z]{3}-\d$/.test(n)) return { dutyType: 'Simulator', dutyCode: n }; // E90-VIE-1
  if (/^GAB\d$/.test(n)) return { dutyType: 'Office Duty', dutyCode: n };
  if (/^SIM/.test(n)) return { dutyType: 'Simulator', dutyCode: 'SIM' };
  if (/^(SBY|STBY)/.test(n)) return { dutyType: 'Standby Airport', dutyCode: 'SBY' };
  if (/^(VAC|AN)$/.test(n)) return { dutyType: 'Vacation', dutyCode: 'VAC' };
  if (/^FP/.test(n) && /LEARN/.test(n)) return { dutyType: 'Training', dutyCode: 'ELEARN' };
  return null;
}

// Annotations attach to the current entry rather than starting a new one
// (line-training markers, hotel markers, crew names, the [FT]/[DT]/[FDP] block).
function isAnnotation(w: string): boolean {
  return /_INS$/.test(w) || /-LEARN$/i.test(w) || /^H\d$/.test(w) || /^\[(FT|DT|FDP)$/.test(w) || /^\d{2}:\d{2}\]$/.test(w);
}
function isCrewName(w: string): boolean {
  return /^[A-Z]{5,}$/.test(w) && !AIRPORT.test(w) && !CARRIER.test(w);
}

interface Segment {
  tokens: string[];
  notes: string[];
}

// Parse one day-column's tokens into duties. Tokens are stacked vertically (one
// attribute per y-line), so we walk top→bottom and segment on each "starter"
// (a carrier prefix or a duty-name); everything else accrues to the current entry.
function parseColumn(colTokens: PositionedToken[], date: string): ParsedDuty[] {
  const ordered = [...colTokens].sort((a, b) => b.y - a.y).map((t) => t.text);
  const segments: Segment[] = [];
  let cur: Segment | null = null;

  for (const w of ordered) {
    const starter = CARRIER.test(w) || classifyDuty(w) !== null;
    if (starter) {
      cur = { tokens: [w], notes: [] };
      segments.push(cur);
    } else if (isAnnotation(w) || isCrewName(w)) {
      if (cur && (/_INS$/.test(w) || /-LEARN$/i.test(w))) cur.notes.push(w);
    } else if (cur) {
      cur.tokens.push(w);
    }
  }

  const duties: ParsedDuty[] = [];
  for (const seg of segments) {
    const words = seg.tokens;
    const airports = words.filter((w) => AIRPORT.test(w) && !CARRIER.test(w));
    const times = words.map(toTime).filter((t): t is string => !!t);
    const aircraft = words.find((w, i) => i > 0 && AIRCRAFT.test(w) && !AIRPORT.test(w)) ?? null;

    const carrierIdx = words.findIndex((w) => CARRIER.test(w));
    if (carrierIdx >= 0) {
      const isDeadhead = /^DH\//i.test(words[carrierIdx]);
      const num = words.slice(carrierIdx + 1).find((w) => /^\d{2,4}$/.test(w) && !TIME.test(w));
      const code = words[carrierIdx].replace(/^DH\//i, '').toUpperCase();
      duties.push({
        date,
        dutyCode: isDeadhead ? 'DH' : 'FLT',
        dutyType: isDeadhead ? 'Positioning' : 'Flight Duty',
        reportingTime: times[0] ?? null,
        departureTime: times[0] ?? null,
        arrivalTime: times[1] ?? null,
        flightNumber: num ? `${code}${num}` : null,
        departureAirport: airports[0] ?? null,
        arrivalAirport: airports[1] ?? null,
        aircraftType: aircraft,
        observations: seg.notes.join(', ') || null,
      });
      continue;
    }

    const named = classifyDuty(words[0]);
    if (named) {
      const isFree = named.dutyType === 'Day Off';
      duties.push({
        date,
        dutyCode: named.dutyCode,
        dutyType: named.dutyType,
        reportingTime: isFree ? null : times[0] ?? null,
        departureTime: null,
        arrivalTime: null,
        flightNumber: null,
        departureAirport: isFree ? null : airports[0] ?? null,
        arrivalAirport: null,
        aircraftType: aircraft,
        observations: seg.notes.join(', ') || null,
      });
    }
  }

  return duties;
}

function sameDuty(a: ParsedDuty, b: ParsedDuty): boolean {
  return a.flightNumber === b.flightNumber && a.dutyCode === b.dutyCode && a.departureTime === b.departureTime;
}

export function interpretPgaGrid(tokens: PositionedToken[]): ParsedDuty[] {
  const dateMap = buildDateMap(tokens);
  const byDate = new Map<string, ParsedDuty[]>();

  const pages = new Map<number, PositionedToken[]>();
  for (const t of tokens) {
    if (!pages.has(t.page)) pages.set(t.page, []);
    pages.get(t.page)!.push(t);
  }

  for (const pageTokens of pages.values()) {
    const rows = clusterRows(pageTokens);
    const headers = rows.filter((r) => r.cells.filter((c) => DOW.test(c.text) && c.x < 500).length >= 4);

    headers.forEach((h, gi) => {
      const cols: Column[] = h.cells
        .filter((c) => DOW.test(c.text) && c.x < 500)
        .map((c) => ({ x: c.x, token: c.text }))
        .sort((a, b) => a.x - b.x);
      const yTop = h.y;
      const yBot = headers[gi + 1]?.y ?? -Infinity;
      const data = pageTokens.filter((t) => t.x < 494 && t.y < yTop - 2 && t.y > yBot);

      for (const col of cols) {
        const date = dateMap.get(col.token);
        if (!date) continue;
        // Assign tokens whose nearest column center is this column (within 22px).
        const colTokens = data.filter((t) => {
          let best = cols[0];
          for (const c of cols) if (Math.abs(t.x - c.x) < Math.abs(t.x - best.x)) best = c;
          return best.x === col.x && Math.abs(t.x - col.x) <= 22;
        });
        if (!colTokens.length) continue;

        const entries = parseColumn(colTokens, date);
        if (!byDate.has(date)) byDate.set(date, []);
        const arr = byDate.get(date)!;
        for (const d of entries) if (!arr.some((e) => sameDuty(e, d))) arr.push(d);
      }
    });
  }

  return [...byDate.values()].flat().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
