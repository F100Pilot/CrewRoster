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
// Day tokens are weekday+day-of-month only ("Mon15"). A single global weekday+dd map
// breaks on long ranges: it can only cover a fixed window and the same "Mon15" recurs
// across months (collisions). Instead we reconstruct the period's full calendar and
// resolve each grid band by matching its consecutive day columns against that calendar.

const MAX_PERIOD_DAYS = 420; // calendar window from the period start (> a year is unusual)

interface CalDay { key: string; date: string }

// The duty-plan header prints the period start as "<start> -" (e.g. "01Jan26 -").
// We anchor the calendar on that start and extend it a generous window — we do NOT
// trust a paired "end" date, because the layout can place an unrelated date next to
// the start (which would truncate the calendar and silently drop later months). Each
// grid band is then placed by sequence matching, so a calendar longer than the real
// roster is harmless (no band matches the empty tail).
function periodRange(tokens: PositionedToken[]): { start: Date; end: Date } {
  const ref = new Date();
  let start: Date | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const m = tokens[i].text.match(/^(\d{2})([A-Za-z]{3})(\d{2})\s*-\s*$/);
    if (!m) continue;
    const s = parseDate(`${m[1]}${m[2]}${m[3]}`, 'ddMMMyy', ref);
    if (isValid(s)) { start = s; break; }
  }
  // Fallback: earliest weekday+dd-style period token as the start.
  if (!start || !isValid(start)) {
    const periods = tokens
      .map((t) => t.text.match(PERIOD))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => parseDate(`${m[1]}${m[2]}${m[3]}`, 'ddMMMyy', ref))
      .filter((d) => isValid(d))
      .sort((a, b) => a.getTime() - b.getTime());
    start = periods[0] ?? new Date();
  }
  return { start, end: addDays(start, MAX_PERIOD_DAYS) };
}

function buildCalendar(start: Date, end: Date): CalDay[] {
  const cal: CalDay[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    cal.push({ key: format(d, 'EEEdd'), date: format(d, 'yyyy-MM-dd') });
  }
  return cal;
}

// Best contiguous offset where `keys` align with `calKeys`, plus the match score.
function bestMatch(keys: string[], calKeys: string[]): { off: number; score: number } {
  let off = -1;
  let score = -1;
  for (let o = 0; o + keys.length <= calKeys.length; o++) {
    let s = 0;
    for (let i = 0; i < keys.length; i++) if (calKeys[o + i] === keys[i]) s++;
    if (s > score) { score = s; off = o; }
    if (s === keys.length) break;
  }
  return { off, score };
}

// Resolve a band's day columns to real dates by matching its consecutive weekday+dd
// sequence against the period calendar. The PGA grid draws days right-to-left (columns
// run in DESCENDING date order by x), so we try both orientations and keep the better.
// Sequence matching is far less ambiguous than a single weekday+dd key, so it
// disambiguates recurring days across a long roster.
function resolveBandDates(colKeys: string[], calendar: CalDay[]): Map<string, string> {
  const map = new Map<string, string>();
  if (colKeys.length === 0) return map;
  const calKeys = calendar.map((c) => c.key);

  const fwd = bestMatch(colKeys, calKeys);
  const rev = bestMatch([...colKeys].reverse(), calKeys);
  const reversed = rev.score > fwd.score;
  const { off, score } = reversed ? rev : fwd;

  const required = Math.max(2, Math.ceil(colKeys.length * 0.6));
  if (off < 0 || score < required) return map;

  const n = colKeys.length;
  for (let i = 0; i < n; i++) {
    const cal = reversed ? calendar[off + (n - 1 - i)] : calendar[off + i];
    if (cal) map.set(colKeys[i], cal.date);
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
  // "X" = day off away from base; keep it distinct from a regular W_OFF so the chip
  // still reads "X" (the crew member recognises it as a free day outside the base).
  if (n === 'X') return { dutyType: 'Day Off', dutyCode: 'X' };
  if (/^W?_?OFF$/.test(n)) return { dutyType: 'Day Off', dutyCode: 'OFF' };
  if (/^E\d{2}-[A-Z]{3}-\d$/.test(n)) return { dutyType: 'Simulator', dutyCode: n }; // E90-VIE-1
  if (/^GAB\d$/.test(n)) return { dutyType: 'Office Duty', dutyCode: n };
  if (/^SIM/.test(n)) return { dutyType: 'Simulator', dutyCode: 'SIM' };
  if (/^(SBY|STBY)/.test(n)) return { dutyType: 'Standby Airport', dutyCode: 'SBY' };
  // Home standby slots are coded A1, A2, A3, … in the PGA roster (single/double
  // digit, so they never collide with aircraft like A320 which is A\d{3}). Keep the
  // exact code so the chip still reads "A1".
  if (/^A\d{1,2}$/.test(n)) return { dutyType: 'Standby Home', dutyCode: n };
  if (/^(VAC|AN)$/.test(n)) return { dutyType: 'Vacation', dutyCode: 'VAC' };
  // Training duty code, e.g. "FPE-LEARN". Anchored so the longer descriptive token
  // ("FP-Elearning CA-MEL ...") that sits in an adjacent sub-column is NOT mistaken
  // for a second training duty.
  if (/^FP\w*-LEARN$/.test(n)) return { dutyType: 'Training', dutyCode: n };
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

// Parse a single sub-column's tokens into duties. Each flight/duty occupies its own
// narrow x sub-column with its attributes stacked vertically (one per y-line), so we
// walk top→bottom and segment on each "starter" (a carrier prefix or a duty-name);
// everything else accrues to the current entry. A clean sub-column yields one duty.
function parseSubColumn(colTokens: PositionedToken[], date: string): ParsedDuty[] {
  const ordered = [...colTokens].sort((a, b) => b.y - a.y).map((t) => t.text);
  const segments: Segment[] = [];
  let cur: Segment | null = null;

  for (const w of ordered) {
    const starter = CARRIER.test(w) || classifyDuty(w) !== null;
    if (starter) {
      cur = { tokens: [w], notes: [] };
      segments.push(cur);
    } else if (isAnnotation(w) || isCrewName(w)) {
      if (cur && /_INS$/.test(w)) cur.notes.push(w);
    } else if (cur) {
      cur.tokens.push(w);
    }
  }

  const duties: ParsedDuty[] = [];
  for (const seg of segments) {
    const words = seg.tokens;
    const airports = words.filter((w) => AIRPORT.test(w) && !CARRIER.test(w));
    const aircraft = words.find((w, i) => i > 0 && AIRCRAFT.test(w) && !AIRPORT.test(w)) ?? null;

    const carrierIdx = words.findIndex((w) => CARRIER.test(w));
    if (carrierIdx >= 0) {
      const isDeadhead = /^DH\//i.test(words[carrierIdx]);
      // The flight number sits in the row directly below the carrier code (next token
      // by y). Identify it structurally rather than by value, because numbers like
      // "1455" are indistinguishable from a 14:55 clock time.
      const numIdx = /^\d{2,4}$/.test(words[carrierIdx + 1] ?? '') ? carrierIdx + 1 : -1;
      const num = numIdx >= 0 ? words[numIdx] : null;
      const code = words[carrierIdx].replace(/^DH\//i, '').toUpperCase();
      // Exclude the flight-number slot so it can't be read as a departure/arrival time.
      const times = words
        .filter((_, i) => i !== numIdx)
        .map(toTime)
        .filter((t): t is string => !!t);
      duties.push({
        date,
        dutyCode: isDeadhead ? 'DH' : 'FLT',
        dutyType: isDeadhead ? 'Positioning' : 'Flight Duty',
        // reportingTime is computed day-wide (first flight dep - 1h) in interpretPgaGrid.
        reportingTime: null,
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
      const isTraining = named.dutyType === 'Training';
      const times = words.map(toTime).filter((t): t is string => !!t);
      duties.push({
        date,
        dutyCode: named.dutyCode,
        dutyType: named.dutyType,
        reportingTime: isFree ? null : times[0] ?? null,
        // Training shows the scheduled block (e.g. FPE-LEARN 07:45–08:15).
        departureTime: isTraining ? times[0] ?? null : null,
        arrivalTime: isTraining ? times[1] ?? null : null,
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

function subtractHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m - 60;
  const hh = ((Math.floor(total / 60)) % 24 + 24) % 24;
  const mm = ((total % 60) + 60) % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function sameDuty(a: ParsedDuty, b: ParsedDuty): boolean {
  return a.flightNumber === b.flightNumber && a.dutyCode === b.dutyCode && a.departureTime === b.departureTime;
}

export function interpretPgaGrid(tokens: PositionedToken[]): ParsedDuty[] {
  const { start, end } = periodRange(tokens);
  const calendar = buildCalendar(start, end);
  const byDate = new Map<string, ParsedDuty[]>();

  const pages = new Map<number, PositionedToken[]>();
  for (const t of tokens) {
    if (!pages.has(t.page)) pages.set(t.page, []);
    pages.get(t.page)!.push(t);
  }

  for (const pageTokens of pages.values()) {
    const rows = clusterRows(pageTokens);
    // Any row with several weekday columns is a grid header — whether it's the real
    // chronological roster OR a non-plan summary/legend table (per-flight statistics,
    // the licences page, etc.). We use ALL of them to delimit the vertical bands…
    const allHeaders = rows.filter((r) => r.cells.filter((c) => DOW.test(c.text) && c.x < 500).length >= 4);
    // …but only PARSE the ones that also carry the right-margin "date" label, which the
    // summary/licences tables lack. (Page 3 even has "VAC" = vaccine, "LPC", "IM"…)
    const headers = allHeaders.filter((r) =>
      r.cells.some((c) => /^date$/i.test(c.text.trim()) && c.x >= 494)
    );

    headers.forEach((h) => {
      const cols: Column[] = h.cells
        .filter((c) => DOW.test(c.text) && c.x < 500)
        .map((c) => ({ x: c.x, token: c.text }))
        .sort((a, b) => a.x - b.x);

      // Resolve this band's columns to real dates by matching its consecutive
      // weekday+dd sequence against the period calendar (handles long ranges and
      // recurring days that a global map would collide).
      const bandDate = resolveBandDates(cols.map((c) => c.token), calendar);

      const yTop = h.y;
      // A band ends at the NEXT header row below it — counting summary/legend headers
      // too. Bounding by the next *parsed* header instead would let a real grid's band
      // run to the page bottom and swallow the summary tables underneath (June flights
      // leaking onto late-July days), so we scan over allHeaders here.
      const yBot = Math.max(
        ...allHeaders.filter((r) => r.y < yTop - 2).map((r) => r.y),
        -Infinity
      );
      const data = pageTokens.filter((t) => t.x < 494 && t.y < yTop - 2 && t.y > yBot && t.text.trim());

      // A day spans a RANGE of x: each of its flights/duties is drawn in its own narrow
      // sub-column, and the day's header label sits at the right-most (largest-x)
      // sub-column. So we cluster data tokens into sub-columns by x (a tight tolerance —
      // adjacent flights can be only ~5px apart) and assign each sub-column to a day.
      const subs: { x: number; tokens: PositionedToken[] }[] = [];
      for (const t of [...data].sort((a, b) => a.x - b.x)) {
        const s = subs.find((s) => Math.abs(s.x - t.x) <= 3);
        if (s) {
          s.tokens.push(t);
          s.x = Math.round((s.x * (s.tokens.length - 1) + t.x) / s.tokens.length);
        } else {
          subs.push({ x: t.x, tokens: [t] });
        }
      }

      // A sub-column belongs to the day with the smallest label-x that is >= its x
      // (the label marks the day's right edge; the day owns everything up to it).
      const dayFor = (x: number): Column => {
        for (const c of cols) if (c.x >= x - 4) return c;
        return cols[cols.length - 1];
      };

      for (const s of subs) {
        const date = bandDate.get(dayFor(s.x).token);
        if (!date) continue;
        const entries = parseSubColumn(s.tokens, date);
        if (!byDate.has(date)) byDate.set(date, []);
        const arr = byDate.get(date)!;
        for (const d of entries) if (!arr.some((e) => sameDuty(e, d))) arr.push(d);
      }
    });
  }

  // Order duties within each day chronologically (by departure/reporting time),
  // then compute the day's check-in time = first flight's departure - 1h (UTC).
  for (const arr of byDate.values()) {
    arr.sort((a, b) => {
      const ta = a.departureTime ?? a.reportingTime ?? '';
      const tb = b.departureTime ?? b.reportingTime ?? '';
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });
    const firstFlight = arr.find(
      (d) => (d.dutyType === 'Flight Duty' || d.dutyType === 'Positioning') && d.departureTime
    );
    if (firstFlight) {
      firstFlight.reportingTime = subtractHour(firstFlight.departureTime!);
    }
  }

  return [...byDate.values()].flat().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
