// Decoded METAR/TAF for an airport, via the app's Cloudflare Worker (which fetches the NOAA
// Aviation Weather Center server-side — AWC has no CORS, so the browser can't call it directly).
// Keyless. IATA→ICAO is resolved from a lazily-loaded table (kept out of the app shell). Returns
// null when there's no proxy configured, the airport is unknown, or nothing comes back — the
// caller then falls back to the keyless Open-Meteo summary.

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');

export interface AirportWx {
  icao: string;
  metarRaw: string | null;
  tafRaw: string | null;
  category: string | null; // VFR / MVFR / IFR / LIFR (AWC flight category, when available)
}

let icaoMap: Record<string, string> | null = null;
async function toIcao(iata: string): Promise<string | null> {
  if (!icaoMap) icaoMap = (await import('../domain/iataToIcao.json')).default as Record<string, string>;
  return icaoMap[iata.toUpperCase()] ?? null;
}

const cache = new Map<string, AirportWx | null>();

interface Station { icao: string; metarRaw: string | null; tafRaw: string | null; category: string | null }

export async function fetchAirportWx(iata: string | null): Promise<AirportWx | null> {
  if (!iata || !API_BASE) return null;
  const icao = await toIcao(iata);
  if (!icao) return null;
  if (cache.has(icao)) return cache.get(icao)!;

  try {
    const res = await fetch(`${API_BASE}/api/metar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: icao }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { stations?: Station[] };
    const s = data.stations?.find((x) => x.icao?.toUpperCase() === icao) ?? data.stations?.[0];
    if (!s || (!s.metarRaw && !s.tafRaw)) return null;
    const wx: AirportWx = { icao, metarRaw: s.metarRaw ?? null, tafRaw: s.tafRaw ?? null, category: s.category ?? null };
    cache.set(icao, wx);
    return wx;
  } catch {
    return null;
  }
}

// Colour for a flight category chip.
export function categoryColor(category: string | null): string {
  switch ((category ?? '').toUpperCase()) {
    case 'VFR': return '#2e7d32';
    case 'MVFR': return '#1976d2';
    case 'IFR': return '#c62828';
    case 'LIFR': return '#6a1b9a';
    default: return '#5c6bc0';
  }
}
