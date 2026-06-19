import { AIRPORT_COORD, midpoint } from '../domain/airports';

// Route turbulence estimate — a free, browser-only approximation, NOT an official
// turbulence product. It combines two public proxies from Open-Meteo (no API key,
// CORS-enabled):
//   • vertical wind shear across cruise pressure levels → clear-air turbulence
//   • CAPE (convective available potential energy)       → thunderstorm turbulence
// The roster only knows origin/destination/time, so we sample the great-circle
// midpoint at roughly mid-flight and at a typical short-haul cruise (~FL340).

export type TurbulenceLevel = 'low' | 'moderate' | 'high';

export interface TurbulenceForecast {
  level: TurbulenceLevel;
  shearKmh: number;
  capeJkg: number;
}

// Heuristic thresholds (deliberately conservative). Shear is the largest wind-speed
// difference between adjacent cruise levels, in km/h; CAPE in J/kg.
export function computeRisk(shearKmh: number, capeJkg: number): TurbulenceLevel {
  const cat = shearKmh >= 75 ? 2 : shearKmh >= 45 ? 1 : 0;
  const conv = capeJkg >= 1000 ? 2 : capeJkg >= 300 ? 1 : 0;
  const score = Math.max(cat, conv);
  return score >= 2 ? 'high' : score >= 1 ? 'moderate' : 'low';
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// The whole-hour nearest to the middle of the flight, as "HH:00".
function midHour(depUtc: string | null, arrUtc: string | null): string {
  if (!depUtc) return '12:00';
  const d = toMin(depUtc);
  const a = arrUtc ? toMin(arrUtc) : d;
  const avg = Math.round((d + a) / 2);
  const h = Math.floor(avg / 60) % 24;
  return `${String(h).padStart(2, '0')}:00`;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

// Module-level cache so flipping between days doesn't refetch the same route/hour.
const cache = new Map<string, TurbulenceForecast | null>();

export async function fetchTurbulence(
  dep: string | null,
  arr: string | null,
  dateISO: string | null,
  depUtc: string | null,
  arrUtc: string | null
): Promise<TurbulenceForecast | null> {
  if (!dep || !arr || !dateISO) return null;
  const a = AIRPORT_COORD[dep.toUpperCase()];
  const b = AIRPORT_COORD[arr.toUpperCase()];
  if (!a || !b) return null;

  const mid = midpoint(a, b);
  const hour = midHour(depUtc, arrUtc);
  const key = `${dep}-${arr}-${dateISO}-${hour}`;
  if (cache.has(key)) return cache.get(key)!;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${mid.lat.toFixed(3)}&longitude=${mid.lon.toFixed(3)}` +
    `&hourly=cape,wind_speed_500hPa,wind_speed_300hPa,wind_speed_250hPa,wind_speed_200hPa` +
    `&start_date=${dateISO}&end_date=${dateISO}&timezone=UTC`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const times: string[] = data?.hourly?.time ?? [];
    const target = `${dateISO}T${hour}`;
    let idx = times.indexOf(target);
    if (idx < 0) idx = parseInt(hour, 10); // fall back to the hour index
    if (idx < 0 || idx >= times.length) return null;

    const h = data.hourly;
    const cape = num(h.cape?.[idx]);
    const w500 = num(h.wind_speed_500hPa?.[idx]);
    const w300 = num(h.wind_speed_300hPa?.[idx]);
    const w250 = num(h.wind_speed_250hPa?.[idx]);
    const w200 = num(h.wind_speed_200hPa?.[idx]);
    const shear = Math.max(Math.abs(w300 - w500), Math.abs(w250 - w300), Math.abs(w200 - w250));

    const forecast: TurbulenceForecast = {
      level: computeRisk(shear, cape),
      shearKmh: Math.round(shear),
      capeJkg: Math.round(cape),
    };
    cache.set(key, forecast);
    return forecast;
  } catch {
    return null;
  }
}

// A Windy embed URL centred on the route midpoint, wind overlay at ~FL340 (250 hPa).
// The dedicated turbulence overlay is Windy Premium and not available in the free
// embed, so we show wind at cruise level as the visual proxy.
export function windyEmbedUrl(dep: string | null, arr: string | null): string | null {
  const a = dep ? AIRPORT_COORD[dep.toUpperCase()] : undefined;
  const b = arr ? AIRPORT_COORD[arr.toUpperCase()] : undefined;
  if (!a || !b) return null;
  const mid = midpoint(a, b);
  const p = new URLSearchParams({
    lat: mid.lat.toFixed(3),
    lon: mid.lon.toFixed(3),
    detailLat: mid.lat.toFixed(3),
    detailLon: mid.lon.toFixed(3),
    zoom: '5',
    level: '250h',
    overlay: 'wind',
    menu: '',
    message: '',
    marker: 'true',
    calendar: 'now',
    type: 'map',
    location: 'coordinates',
    metricWind: 'default',
    metricTemp: 'default',
  });
  return `https://embed.windy.com/embed2.html?${p.toString()}`;
}
