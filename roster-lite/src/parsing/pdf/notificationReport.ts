// Parser for the NetLine "Crew Notification" PDF — the report shown in CrewLink's
// notification pop-up. Unlike the duty-plan grid, it's a simple table:
//
//   date | known state (old) | current state (new) | user
//
// Each row's duties sit either in the "known" or "current" column (by x), and a date in
// the left column starts a change block that the following rows belong to. This lets us
// show the BEFORE → AFTER of each changed day before the user confirms the notification.
import { extractPdf, type PositionedToken } from './extractText';

export interface NotifChange {
  date: string; // ISO yyyy-MM-dd when the year resolves, else the raw label
  rawDate: string; // e.g. "09Jul"
  known: string[]; // old duty summaries (e.g. "A1 LIS 04:00-10:00")
  current: string[]; // new duty summaries (e.g. "TP860 LIS-VCE 05:45-08:45")
}

export interface NotificationReport {
  notificationDate: string | null; // e.g. "09Jul26"
  notificationId: string | null; // e.g. "23Jun26-11:23:19"
  changes: NotifChange[];
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const hhmm = (t: string) => `${t.slice(0, 2)}:${t.slice(2)}`;
const isTime = (s: string) => /^\d{4}$/.test(s);
const isAirport = (s: string) => /^[A-Z]{3}$/.test(s);

// "09Jul" + year "26" → "2026-07-09". Returns the raw label if it can't be resolved.
function toISO(label: string, year2: string | null): string {
  const m = label.match(/^(\d{1,2})([A-Za-z]{3})$/);
  if (!m || !year2) return label;
  const mon = MONTHS[m[2].toLowerCase()];
  if (!mon) return label;
  return `20${year2}-${mon}-${m[1].padStart(2, '0')}`;
}

// Turn one duty line's tokens (in x order) into a readable summary. Handles flights
// ("TP 860 LIS 0545 0845 VCE E95") and other activities ("A1 LIS 0400 1000").
export function summarizeNotifLine(tokens: string[]): string {
  const times = tokens.filter(isTime);
  const airports = tokens.filter(isAirport);
  const span = times.length >= 2 ? ` ${hhmm(times[0])}-${hhmm(times[1])}`
    : times.length === 1 ? ` ${hhmm(times[0])}` : '';
  // Flight: a 2-letter carrier followed by a flight number.
  if (/^[A-Z]{2}$/.test(tokens[0] ?? '') && /^\d+$/.test(tokens[1] ?? '')) {
    const route = airports.length >= 2 ? ` ${airports[0]}-${airports[1]}` : airports[0] ? ` ${airports[0]}` : '';
    return `${tokens[0]}${tokens[1]}${route}${span}`.trim();
  }
  // Activity/standby: code + location + times.
  const loc = airports[0] ? ` ${airports[0]}` : '';
  return `${tokens[0] ?? ''}${loc}${span}`.trim();
}

function groupRows(tokens: PositionedToken[]): PositionedToken[][] {
  const sorted = [...tokens].sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const rows: PositionedToken[][] = [];
  let row: PositionedToken[] = [];
  let lastY: number | null = null;
  for (const t of sorted) {
    if (lastY === null || Math.abs(t.y - lastY) <= 3) row.push(t);
    else { rows.push(row); row = [t]; }
    lastY = t.y;
  }
  if (row.length) rows.push(row);
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

export function parseNotificationReport(tokens: PositionedToken[]): NotificationReport | null {
  const knownHeader = tokens.find((t) => /known state/i.test(t.text));
  const currentHeader = tokens.find((t) => /current state/i.test(t.text));
  if (!knownHeader || !currentHeader) return null;
  const knownX = knownHeader.x;
  const currentX = currentHeader.x;
  const userHeader = tokens.find((t) => /^user$/i.test(t.text) && Math.abs(t.y - knownHeader.y) <= 2);
  const userX = userHeader ? userHeader.x : currentX + 200;
  const headerY = knownHeader.y;

  // Read a "Label: value" metadata field (value is the next token to its right).
  const meta = (label: RegExp): string | null => {
    const lab = tokens.find((t) => label.test(t.text));
    if (!lab) return null;
    const right = tokens
      .filter((t) => Math.abs(t.y - lab.y) <= 2 && t.x > lab.x + 1)
      .sort((a, b) => a.x - b.x);
    return right[0]?.text ?? null;
  };
  const notificationDate = meta(/Notification date:/i);
  const notificationId = meta(/Notification id:/i);
  const year2 = notificationDate?.match(/(\d{2})$/)?.[1] ?? null;

  // Data tokens live below the header; the lone "*" bullets are layout markers.
  const data = tokens.filter((t) => t.y < headerY - 2 && t.text.trim() && t.text.trim() !== '*');

  const changes: NotifChange[] = [];
  let cur: NotifChange | null = null;
  for (const row of groupRows(data)) {
    const dateTok = row.find((t) => t.x < knownX - 2 && /^\d{1,2}[A-Za-z]{3}$/.test(t.text));
    if (dateTok) {
      cur = { rawDate: dateTok.text, date: toISO(dateTok.text, year2), known: [], current: [] };
      changes.push(cur);
    }
    if (!cur) continue;
    const known = row.filter((t) => t.x >= knownX - 4 && t.x < currentX - 4).map((t) => t.text);
    const current = row.filter((t) => t.x >= currentX - 4 && t.x < userX - 4).map((t) => t.text);
    if (known.length) cur.known.push(summarizeNotifLine(known));
    if (current.length) cur.current.push(summarizeNotifLine(current));
  }
  return { notificationDate, notificationId, changes };
}

// Extract + parse the notification PDF in one call (used by the app).
export async function parseNotificationPdf(data: ArrayBuffer): Promise<NotificationReport | null> {
  const { tokens } = await extractPdf(data);
  return parseNotificationReport(tokens);
}
