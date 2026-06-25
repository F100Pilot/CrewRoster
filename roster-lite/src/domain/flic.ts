// FLIC (TAP) stand boards for the PGA hubs. flic.tap.pt is internal to TAP (needs their
// network/login and blocks cross-origin requests), so the app can't read the stand directly —
// instead it deep-links to the right arrivals/departures board for the flight's LIS/OPO leg.

const BASE = 'https://flic.tap.pt/FLIC_UI/FLIC.aspx?Id=PGA-';
const HUBS = new Set(['LIS', 'OPO']);

export interface FlicLink {
  label: string;
  url: string;
}

// Up to two links: the departure board when leaving a hub, the arrival board when landing at one.
export function flicStandLinks(dep: string | null, arr: string | null): FlicLink[] {
  const out: FlicLink[] = [];
  const d = dep?.toUpperCase();
  const a = arr?.toUpperCase();
  if (d && HUBS.has(d)) out.push({ label: `Partida ${d}`, url: `${BASE}${d}_DEP` });
  if (a && HUBS.has(a)) out.push({ label: `Chegada ${a}`, url: `${BASE}${a}_ARR` });
  return out;
}
