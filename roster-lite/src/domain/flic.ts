// FLIC (TAP) live stand for the PGA hubs. flic.tap.pt is public but serves no CORS headers, so
// the browser can't read it directly — the Cloudflare worker fetches the board server-side
// (POST /api/flic) and returns parsed rows. We then match the row for this flight and show its
// stand. The board only lists the current operational window, so a stand is only available on
// the day of the flight; outside that window there's simply nothing to show.

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');
const BOARD_BASE = 'https://flic.tap.pt/FLIC_UI/FLIC.aspx?Id=';
const HUBS = new Set(['LIS', 'OPO']);

export interface FlicRow {
  carrier: string;
  num: string;
  route: string;
  reg: string;
  eqt: string;
  stand: string;
  std: string;
  etd: string;
  atd: string;
  status: string;
}

export interface FlicLeg {
  kind: 'dep' | 'arr'; // departing from a hub / arriving at a hub
  hub: string; // LIS or OPO
  boardId: string; // PGA-LIS_DEP
  boardUrl: string; // full board, to open as a fallback
}

export interface FlicStandInfo extends FlicLeg {
  found: boolean;
  stand: string | null;
  status: string | null;
  reg: string | null;
  eqt: string | null;
  sched: string | null; // STD (dep) or STA (arr), UTC
  est: string | null; // ETD/ETA, UTC
  act: string | null; // ATD/ATA, UTC
  updated: string | null; // board "as of" stamp
}

// FLIC only exists for the hubs, so the feature is only available with a worker configured.
export function flicEnabled(): boolean {
  return !!API_BASE;
}

// Which hub boards matter for this flight: the departure board when leaving a hub, the arrival
// board when landing at one (a LIS→OPO leg touches both).
export function flicLegsFor(dep: string | null, arr: string | null): FlicLeg[] {
  const out: FlicLeg[] = [];
  const d = dep?.toUpperCase();
  const a = arr?.toUpperCase();
  if (d && HUBS.has(d)) out.push(makeLeg('dep', d));
  if (a && HUBS.has(a)) out.push(makeLeg('arr', a));
  return out;
}

function makeLeg(kind: 'dep' | 'arr', hub: string): FlicLeg {
  const boardId = `PGA-${hub}_${kind === 'dep' ? 'DEP' : 'ARR'}`;
  return { kind, hub, boardId, boardUrl: `${BOARD_BASE}${boardId}` };
}

const digitsOf = (s: string | null | undefined) => (s || '').replace(/\D/g, '').replace(/^0+/, '');

// Normalise a FLIC registration ("CSTPW") to the canonical hyphenated mark ("CS-TPW") so it
// matches the format the logbook stores (AeroDataBox returns it hyphenated). The PGA fleet is
// all Portuguese (CS-…); other marks are left as-is.
export function normalizeReg(raw: string | null | undefined): string | null {
  const s = (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s) return null;
  const m = /^(CS)([A-Z]{3})$/.exec(s);
  return m ? `${m[1]}-${m[2]}` : s;
}

type Board = { updated: string; rows: FlicRow[] };

// Short-lived cache of board fetches, keyed by board id. The same board is needed by several
// components at once when a day opens (the stand card and each flight's aircraft lookup), so
// this collapses that burst into a single network call. A manual refresh passes force to bypass
// it. Failed fetches (null) are not cached, so they retry.
const BOARD_TTL_MS = 45_000;
const boardCache = new Map<string, { ts: number; promise: Promise<Board | null> }>();

async function fetchBoard(id: string, force = false): Promise<Board | null> {
  if (!API_BASE) return null;
  const hit = boardCache.get(id);
  if (!force && hit && Date.now() - hit.ts < BOARD_TTL_MS) return hit.promise;

  const promise = (async (): Promise<Board | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/flic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { rows?: FlicRow[]; updated?: string };
      if (!Array.isArray(data.rows)) return null;
      return { updated: data.updated || '', rows: data.rows };
    } catch {
      return null;
    }
  })();

  boardCache.set(id, { ts: Date.now(), promise });
  // Don't let a null/failed result linger in the cache — drop it so the next call retries.
  promise.then((data) => { if (data == null) boardCache.delete(id); }).catch(() => boardCache.delete(id));
  return promise;
}

// Match the board row for this flight: same flight number, and (when possible) the same other
// airport — for a departure board that's the destination, for an arrivals board the origin.
function matchRow(rows: FlicRow[], flightDigits: string, otherIata: string | null): FlicRow | null {
  if (!flightDigits) return null;
  const other = otherIata?.toUpperCase() || '';
  const sameNum = rows.filter((r) => digitsOf(r.num) === flightDigits);
  if (other) {
    const exact = sameNum.find((r) => r.route.toUpperCase() === other);
    if (exact) return exact;
  }
  return sameNum[0] || null;
}

// Resolve the live stand(s) for a flight touching a hub. Returns one entry per hub leg; an entry
// has found=false when the flight isn't on the board (e.g. not yet posted / not operating today).
export async function fetchFlicStands(
  flightNumber: string | null,
  dep: string | null,
  arr: string | null,
  opts: { force?: boolean } = {},
): Promise<FlicStandInfo[]> {
  const legs = flicLegsFor(dep, arr);
  if (legs.length === 0 || !API_BASE) return [];
  const flightDigits = digitsOf(flightNumber);

  const results = await Promise.all(
    legs.map(async (leg): Promise<FlicStandInfo> => {
      const base: FlicStandInfo = {
        ...leg,
        found: false,
        stand: null,
        status: null,
        reg: null,
        eqt: null,
        sched: null,
        est: null,
        act: null,
        updated: null,
      };
      const board = await fetchBoard(leg.boardId, opts.force);
      if (!board) return base;
      base.updated = board.updated || null;
      const other = leg.kind === 'dep' ? arr : dep;
      const row = matchRow(board.rows, flightDigits, other);
      if (!row) return base;
      return {
        ...base,
        found: true,
        stand: row.stand || null,
        status: row.status || null,
        reg: row.reg || null,
        eqt: row.eqt || null,
        sched: row.std || null,
        est: row.etd || null,
        act: row.atd || null,
      };
    }),
  );
  return results;
}

// The aircraft registration (and equipment) for a flight from the FLIC board — the most current
// source on the day of the flight. Returns the first hub leg that carries a tail (both legs of a
// LIS↔OPO rotation share the airframe), with the mark normalised to "CS-…". Null off-day / not
// on the board / no worker configured.
export async function fetchFlicReg(
  flightNumber: string | null,
  dep: string | null,
  arr: string | null,
): Promise<{ reg: string; eqt: string | null } | null> {
  const stands = await fetchFlicStands(flightNumber, dep, arr);
  for (const s of stands) {
    if (s.found && s.reg) {
      const reg = normalizeReg(s.reg);
      if (reg) return { reg, eqt: s.eqt };
    }
  }
  return null;
}
