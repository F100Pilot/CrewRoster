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
const CARRIER = /^(TP|LH|NI|S4|DH\/[A-Z0-9]{2,3})$/i; // own carrier, or deadhead on ANY airline (DH/TP, DH/AY…)

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

// All contiguous offsets where `keys` align with `calKeys`, sharing the top score.
// A weekly band's weekday+dd run is ambiguous (e.g. a July week also fits an April
// week), so several offsets can tie — the caller disambiguates by proximity to the
// running chronological cursor.
function matchOffsets(keys: string[], calKeys: string[]): { score: number; offsets: number[] } {
  let score = -1;
  let offsets: number[] = [];
  for (let o = 0; o + keys.length <= calKeys.length; o++) {
    let s = 0;
    for (let i = 0; i < keys.length; i++) if (calKeys[o + i] === keys[i]) s++;
    if (s > score) { score = s; offsets = [o]; }
    else if (s === score) offsets.push(o);
  }
  return { score, offsets };
}

interface BandCandidates { reversed: boolean; offsets: number[]; len: number }

// Where a band's day columns can sit in the period calendar. The PGA grid draws days
// right-to-left (columns run in DESCENDING date order by x), so we try both
// orientations and keep the better. `offsets` is every calendar index (ascending) where
// the band's EARLIEST date could begin; the tiler picks the consistent one.
function bandCandidates(colKeys: string[], calendar: CalDay[]): BandCandidates {
  const len = colKeys.length;
  if (len === 0) return { reversed: false, offsets: [], len };
  const calKeys = calendar.map((c) => c.key);
  const fwd = matchOffsets(colKeys, calKeys);
  const rev = matchOffsets([...colKeys].reverse(), calKeys);
  const reversed = rev.score > fwd.score;
  const { score, offsets } = reversed ? rev : fwd;
  // Allow a floor of 1 matched column so short trailing bands (1–2 days) still resolve.
  const required = Math.max(1, Math.ceil(len * 0.6));
  if (score < required) return { reversed, offsets: [], len };
  return { reversed, offsets: [...offsets].sort((a, b) => a - b), len };
}

// Date for a band column given its assigned offset and orientation.
function bandColumnDate(cand: BandCandidates, offset: number, i: number, calendar: CalDay[]): string | undefined {
  const idx = cand.reversed ? offset + (cand.len - 1 - i) : offset + i;
  return calendar[idx]?.date;
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
  // Requested days off end in "_RQST" (e.g. OFF_RQST). Match the suffix generically so
  // any prefix variant counts, and keep the exact code on the chip.
  if (/_RQST$/.test(n)) return { dutyType: 'Day Off', dutyCode: n };
  // PLS = "Período Livre de Serviço" (service-free period): PLS_IRREG, PLS_RECOV,
  // PLS_TEIA/TEIC, PLS_ROST, PLS_TRACK. Treated as a free (non-flying) day.
  if (/^PLS_/.test(n)) return { dutyType: 'Day Off', dutyCode: n };
  if (/^E\d{2}-[A-Z]{3}-\d$/.test(n)) return { dutyType: 'Simulator', dutyCode: n }; // E90-VIE-1
  if (/^GAB\d$/.test(n)) return { dutyType: 'Office Duty', dutyCode: n };
  if (/^SIM/.test(n)) return { dutyType: 'Simulator', dutyCode: 'SIM' };
  if (/^(SBY|STBY)/.test(n)) return { dutyType: 'Standby Airport', dutyCode: 'SBY' };
  // Assistances (standby/reserve with a time window), for BOTH pilots and cabin crew.
  // H-codes/R24: H7+, H9+, H12+, H14+, H23+, H509, H616, R24. A-codes: A1, A2, A2+, A3,
  // A3++, A4, A4+, A5, A5+, A6, A8 (used across ranks, not cabin-only). The "+"/3-digit
  // forms never collide with aircraft (A\d{3}) or hotel markers (H\d).
  if (/^H(\d+\+|\d{3})$/.test(n)) return { dutyType: 'Standby Home', dutyCode: n };
  if (n === 'R24') return { dutyType: 'Standby Home', dutyCode: n };
  if (/^A\d\+{0,2}$/.test(n)) return { dutyType: 'Standby Home', dutyCode: n };
  // Vacation: F (carried-over, working days), PLIC/SLIC/RLIC (calendar days), plus the
  // older VAC/AN.
  if (/^(VAC|AN|F|PLIC|SLIC|RLIC)$/.test(n)) return { dutyType: 'Vacation', dutyCode: n };
  // Cabin line checks / exam flights: verified (WPNC/W_EXAM) and verifier (VPNC/V_EXAM).
  if (/^(WPNC|VPNC|W_EXAM|V_EXAM)$/.test(n)) return { dutyType: 'Training', dutyCode: n };
  // Instruction. FP1_INST / FP2_INST = the crew member is the INSTRUCTOR (ends in "_INST",
  // with a T, so it's not caught by the "_INS" line-training annotation rule). FP1 / FP2 =
  // the crew member is the TRAINEE. Both classify as Training; the exact code distinguishes
  // the role on the chip.
  if (/_INST$/.test(n)) return { dutyType: 'Training', dutyCode: n };
  if (/^FP\d$/.test(n)) return { dutyType: 'Training', dutyCode: n };
  // Recurrent ground instruction (as trainee), e.g. RGTC1 / RGTC2 — usually two sessions.
  if (/^RGTC\d*$/.test(n)) return { dutyType: 'Training', dutyCode: n };
  // Training duty code, e.g. "FPE-LEARN". Anchored so the longer descriptive token
  // ("FP-Elearning CA-MEL ...") that sits in an adjacent sub-column is NOT mistaken
  // for a second training duty.
  if (/^FP\w*-LEARN$/.test(n)) return { dutyType: 'Training', dutyCode: n };
  if (n === 'FAL') return { dutyType: 'Absence', dutyCode: 'FAL' }; // Falta (ausência)
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
  dh?: boolean; // a standalone "DH" appeared above this flight → deadhead crew
}

// Parse a single sub-column's tokens into duties. Each flight/duty occupies its own
// narrow x sub-column with its attributes stacked vertically (one per y-line), so we
// walk top→bottom and segment on each "starter" (a carrier prefix or a duty-name);
// everything else accrues to the current entry. A clean sub-column yields one duty.
function parseSubColumn(colTokens: PositionedToken[], date: string): ParsedDuty[] {
  const ordered = [...colTokens].sort((a, b) => b.y - a.y).map((t) => t.text);
  const segments: Segment[] = [];
  let cur: Segment | null = null;
  let pendingDH = false; // a "DH" token seen above the next flight marks it deadhead

  for (const w of ordered) {
    // A standalone "DH" before the flight code means the sector is flown as deadhead
    // (positioning as a passenger). It applies to the NEXT flight starter.
    if (/^DH$/i.test(w)) { pendingDH = true; continue; }
    const starter = CARRIER.test(w) || classifyDuty(w) !== null;
    if (starter) {
      cur = { tokens: [w], notes: [], dh: pendingDH };
      pendingDH = false;
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
    // Skip index 0 (the starter: carrier or duty code) so a 3-letter code like "FAL"
    // or "OFF" isn't mistaken for an airport.
    const airports = words.filter((w, i) => i > 0 && AIRPORT.test(w) && !CARRIER.test(w));
    const aircraft = words.find((w, i) => i > 0 && AIRCRAFT.test(w) && !AIRPORT.test(w)) ?? null;

    const carrierIdx = words.findIndex((w) => CARRIER.test(w));
    if (carrierIdx >= 0) {
      // Deadhead either as a "DH/TP" combined prefix or a standalone "DH" above the code.
      const isDeadhead = /^DH\//i.test(words[carrierIdx]) || seg.dh === true;
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

  // Safety net: a sub-column with a genuine but unrecognised duty would drop the day.
  // To never FABRICATE a duty from a stray marker (hotel names like "STEIGENBERG"/"NH
  // Hotel", place names, crew names, summary cells…), we require ALL of:
  //   • the code looks like a real PGA duty code: uppercase letters then a digit
  //     (GS1, RGTC3, H7…) — hotel/place/crew tokens have no embedded digit, so they
  //     are excluded;
  //   • a real reporting TIME is present in the same sub-column.
  // We would rather lose an uncertain entry than show a wrong one.
  if (duties.length === 0) {
    const looksLikeDutyCode = (w: string) => /^[A-Z]{1,5}\d[A-Z0-9+]*$/.test(w);
    const code = ordered.find((w) => looksLikeDutyCode(w) && !DOW.test(w) && !TIME.test(w));
    const times = code ? ordered.map(toTime).filter((t): t is string => !!t) : [];
    const airports = code ? ordered.filter((w) => AIRPORT.test(w) && w !== code && !CARRIER.test(w)) : [];
    if (code && times.length > 0) {
      duties.push({
        date,
        dutyCode: code.toUpperCase(),
        dutyType: 'Other',
        reportingTime: times[0] ?? null,
        departureTime: null,
        arrivalTime: null,
        flightNumber: null,
        departureAirport: airports[0] ?? null,
        arrivalAirport: null,
        aircraftType: null,
        observations: null,
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

interface CollectedBand {
  cols: Column[];
  colKeys: string[];
  subs: { x: number; tokens: PositionedToken[] }[];
  cand: BandCandidates;
  offset?: number;
}

// Phases 1 + 2: collect every roster band from the pages, then tile them onto the
// period calendar by date contiguity. Shared by interpretPgaGrid and diagnosePgaGrid.
function prepareBands(tokens: PositionedToken[]): { calendar: CalDay[]; bands: CollectedBand[] } {
  const { start, end } = periodRange(tokens);
  const calendar = buildCalendar(start, end);

  const pages = new Map<number, PositionedToken[]>();
  for (const t of tokens) {
    if (!pages.has(t.page)) pages.set(t.page, []);
    pages.get(t.page)!.push(t);
  }

  // ── Phase 1: collect bands with columns, sub-columns and candidate offsets. ──────────
  const bands: CollectedBand[] = [];
  for (const pageTokens of pages.values()) {
    const rows = clusterRows(pageTokens);
    const dowCount = (r: Row) => r.cells.filter((c) => DOW.test(c.text) && c.x < 500).length;
    const hasDateLabel = (r: Row) => r.cells.some((c) => /^date$/i.test(c.text.trim()) && c.x >= 494);
    const headers = rows.filter((r) => hasDateLabel(r) && dowCount(r) >= 1);
    const allHeaders = rows.filter((r) => dowCount(r) >= 4 || headers.includes(r));

    headers.forEach((h) => {
      const cols: Column[] = h.cells
        .filter((c) => DOW.test(c.text) && c.x < 500)
        .map((c) => ({ x: c.x, token: c.text }))
        .sort((a, b) => a.x - b.x);

      const yTop = h.y;
      const yBot = Math.max(...allHeaders.filter((r) => r.y < yTop - 2).map((r) => r.y), -Infinity);
      const data = pageTokens.filter((t) => t.x < 494 && t.y < yTop - 2 && t.y > yBot && t.text.trim());

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

      const colKeys = cols.map((c) => c.token);
      bands.push({ cols, colKeys, subs, cand: bandCandidates(colKeys, calendar) });
    });
  }

  // ── Phase 2: tile bands by date contiguity from the period start. Order-independent
  // for uniquely-keyed bands; identical-pattern bands (an April week vs a July week) are
  // placed in document order (earlier in the document → earlier slot). ─────────────────
  const placed = new Array<boolean>(bands.length).fill(false);
  let remaining = bands.filter((b) => b.cand.offsets.length > 0).length;
  let cursor = 0;
  let guard = 0;
  while (remaining > 0 && guard++ < bands.length * 4 + 8) {
    const idx = bands.findIndex((b, i) => !placed[i] && b.cand.offsets.length > 0 && b.cand.offsets.includes(cursor));
    if (idx >= 0) {
      bands[idx].offset = cursor;
      placed[idx] = true;
      remaining--;
      cursor += bands[idx].cand.len;
    } else {
      let next = Infinity;
      bands.forEach((b, i) => {
        if (placed[i]) return;
        for (const o of b.cand.offsets) if (o > cursor && o < next) next = o;
      });
      if (next === Infinity) break;
      cursor = next;
    }
  }
  bands.forEach((b, i) => { if (!placed[i] && b.cand.offsets.length > 0) b.offset = b.cand.offsets[0]; });

  return { calendar, bands };
}

export function interpretPgaGrid(tokens: PositionedToken[]): ParsedDuty[] {
  const { calendar, bands } = prepareBands(tokens);
  const byDate = new Map<string, ParsedDuty[]>();

  // ── Phase 3: turn each placed band's sub-columns into dated duties. ─────────────────
  for (const b of bands) {
    if (b.offset === undefined) continue;
    const bandDate = new Map<string, string>();
    b.colKeys.forEach((key, i) => {
      const d = bandColumnDate(b.cand, b.offset!, i, calendar);
      if (d) bandDate.set(key, d);
    });
    // A sub-column belongs to the day with the smallest label-x that is >= its x.
    const dayFor = (x: number): Column => {
      for (const c of b.cols) if (c.x >= x - 4) return c;
      return b.cols[b.cols.length - 1];
    };
    for (const s of b.subs) {
      const date = bandDate.get(dayFor(s.x).token);
      if (!date) continue;
      const entries = parseSubColumn(s.tokens, date);
      if (!byDate.has(date)) byDate.set(date, []);
      const arr = byDate.get(date)!;
      for (const d of entries) if (!arr.some((e) => sameDuty(e, d))) arr.push(d);
    }
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

// Human-readable diagnosis of how each grid band was placed onto the calendar. Used by
// the Debug page to investigate missing/misplaced days without exposing internals.
export function diagnosePgaGrid(tokens: PositionedToken[]): string {
  const { calendar, bands } = prepareBands(tokens);
  const out: string[] = [];
  const calStart = calendar[0]?.date ?? '?';
  out.push(`Calendário: ${calStart} … +${calendar.length}d`);
  out.push(`Bandas: ${bands.length}`);
  out.push('');

  const fmtOffsets = (cand: BandCandidates) =>
    cand.offsets.slice(0, 6).map((o) => calendar[o]?.date ?? `#${o}`).join(', ') +
    (cand.offsets.length > 6 ? ` …(+${cand.offsets.length - 6})` : '');

  bands.forEach((b, i) => {
    const first = b.colKeys[0] ?? '';
    const last = b.colKeys[b.colKeys.length - 1] ?? '';
    let range = '—';
    if (b.offset !== undefined) {
      const s = bandColumnDate(b.cand, b.offset, b.cand.reversed ? b.colKeys.length - 1 : 0, calendar);
      const e = bandColumnDate(b.cand, b.offset, b.cand.reversed ? 0 : b.colKeys.length - 1, calendar);
      range = `${s} … ${e}`;
    }
    out.push(
      `#${i} [${first}…${last}] len=${b.cand.len} rev=${b.cand.reversed ? 'Y' : 'N'} ` +
      `cand=[${fmtOffsets(b.cand)}] -> ${range}`,
    );
  });

  // Map every band's sub-columns to dates, collecting the RAW tokens that land on each
  // day — so missing days can be inspected (unrecognised code? wrong day? no tokens?).
  const rawByDate = new Map<string, string[]>();
  for (const b of bands) {
    if (b.offset === undefined) continue;
    const bandDate = new Map<string, string>();
    b.colKeys.forEach((key, i) => {
      const d = bandColumnDate(b.cand, b.offset!, i, calendar);
      if (d) bandDate.set(key, d);
    });
    const dayFor = (x: number): Column => {
      for (const c of b.cols) if (c.x >= x - 4) return c;
      return b.cols[b.cols.length - 1];
    };
    for (const s of b.subs) {
      const date = bandDate.get(dayFor(s.x).token);
      if (!date) continue;
      const texts = [...s.tokens].sort((p, q) => q.y - p.y).map((t) => t.text);
      rawByDate.set(date, [...(rawByDate.get(date) ?? []), ...texts]);
    }
  }

  // Coverage: gaps inside the parsed date span.
  const duties = interpretPgaGrid(tokens);
  const dates = [...new Set(duties.map((d) => d.date))].sort();
  if (dates.length > 0) {
    out.push('');
    out.push(`Dias com registo: ${dates.length} (${dates[0]} … ${dates[dates.length - 1]})`);
    const present = new Set(dates);
    const missing: string[] = [];
    const startIdx = calendar.findIndex((c) => c.date === dates[0]);
    const endIdx = calendar.findIndex((c) => c.date === dates[dates.length - 1]);
    for (let i = startIdx; i >= 0 && i <= endIdx; i++) {
      if (!present.has(calendar[i].date)) missing.push(calendar[i].date);
    }
    out.push(missing.length ? `Dias EM FALTA: ${missing.length}` : 'Sem buracos no intervalo.');
    // Show the raw tokens that landed on each missing day.
    for (const d of missing) {
      const toks = rawByDate.get(d);
      out.push(`  ${d}: ${toks && toks.length ? toks.join(' | ') : '(sem tokens nesse dia)'}`);
    }
  }

  // Full per-day token dump — share the days you suspect are wrong (e.g. a hotel marker
  // on an OFF day) so they can be turned into a permanent test fixture.
  out.push('');
  out.push('--- Tokens por dia ---');
  for (const d of [...rawByDate.keys()].sort()) {
    out.push(`${d}: ${(rawByDate.get(d) ?? []).join(' | ')}`);
  }

  return out.join('\n');
}

