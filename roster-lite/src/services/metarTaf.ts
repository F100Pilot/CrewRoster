import { getCheckwxKey } from '../storage/settings';

// Decoded METAR/TAF for an airport, fetched directly from CheckWX with the user's own key.
// IATA→ICAO is resolved from a lazily-loaded table (so the dataset isn't in the app shell).
// Returns null when no key is set, the airport is unknown, or the request fails — the caller
// then falls back to the keyless Open-Meteo summary.

export interface AirportWx {
  icao: string;
  metarRaw: string | null;
  tafRaw: string | null;
  category: string | null; // VFR / MVFR / IFR / LIFR (from CheckWX flight_category)
}

let icaoMap: Record<string, string> | null = null;
async function toIcao(iata: string): Promise<string | null> {
  if (!icaoMap) icaoMap = (await import('../domain/iataToIcao.json')).default as Record<string, string>;
  return icaoMap[iata.toUpperCase()] ?? null;
}

const cache = new Map<string, AirportWx | null>();

async function checkwx(path: string, key: string): Promise<unknown> {
  const res = await fetch(`https://api.checkwx.com/${path}`, { headers: { 'X-API-Key': key } });
  if (!res.ok) throw new Error(`CheckWX ${res.status}`);
  return res.json();
}

export async function fetchAirportWx(iata: string | null): Promise<AirportWx | null> {
  const key = getCheckwxKey();
  if (!key || !iata) return null;
  const icao = await toIcao(iata);
  if (!icao) return null;
  if (cache.has(icao)) return cache.get(icao)!;

  try {
    const [metar, taf] = await Promise.all([
      checkwx(`metar/${icao}/decoded`, key).catch(() => null),
      checkwx(`taf/${icao}`, key).catch(() => null),
    ]);
    const m = (metar as { data?: Array<{ raw_text?: string; flight_category?: string }> } | null)?.data?.[0];
    const t = (taf as { data?: string[] } | null)?.data?.[0];
    const wx: AirportWx = {
      icao,
      metarRaw: m?.raw_text ?? null,
      tafRaw: typeof t === 'string' ? t : null,
      category: m?.flight_category ?? null,
    };
    // Nothing came back at all → treat as no data (don't cache a permanent miss on a transient).
    if (!wx.metarRaw && !wx.tafRaw) return null;
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
