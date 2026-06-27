import { AIRPORT_COORD, midpoint, type Coord } from '../domain/airports';

// Route turbulence estimate — a free, browser-only approximation, NOT an official turbulence
// product. It samples SEVERAL points along the great-circle route (not just the midpoint) at a
// typical short-haul cruise (~FL340) and, at each, combines three public proxies from Open-Meteo
// (no API key, CORS-enabled):
//   • Ellrod Turbulence Index (TI1 = vertical-shear × horizontal-deformation) → clear-air
//     turbulence at jet-stream edges, the physics behind operational CAT diagnostics;
//   • vertical wind shear across cruise levels → a robust shear floor;
//   • CAPE (convective available potential energy) → thunderstorm turbulence.
// The whole route's level is the WORST of the sampled points.

export type TurbulenceLevel = 'low' | 'moderate' | 'high';

export interface TurbulenceForecast {
  level: TurbulenceLevel;
  ellrod: number; // Ellrod TI1 at the worst point, ×1e7 s⁻² (rounded)
  shearKmh: number; // vertical wind shear at the worst point, km/h
  capeJkg: number; // CAPE at the worst point, J/kg
}

// Combine the three proxies into a level — the worst one wins. Ellrod TI1 in ×1e7 s⁻²; shear in
// km/h; CAPE in J/kg.
//
// Thresholds are calibrated against EDR-based products (e.g. Windy's CAT layer): on this coarse
// Open-Meteo grid a normal jet-stream crossing routinely yields Ellrod ~15–30 and vertical shear
// ~60–80 km/h, which those products show as *light* turbulence. Earlier thresholds (Ellrod ≥ 9,
// shear ≥ 45) flagged that as "high", which over-called badly — so the bars are now well above
// the everyday-jet range and only genuinely strong deformation/shear/convection escalate.
export function computeRisk(ellrod: number, shearKmh: number, capeJkg: number): TurbulenceLevel {
  const e = ellrod >= 80 ? 2 : ellrod >= 40 ? 1 : 0;
  const s = shearKmh >= 150 ? 2 : shearKmh >= 100 ? 1 : 0;
  const c = capeJkg >= 2000 ? 2 : capeJkg >= 800 ? 1 : 0;
  const score = Math.max(e, s, c);
  return score >= 2 ? 'high' : score >= 1 ? 'moderate' : 'low';
}

const RAD = Math.PI / 180;
const M_PER_DEG = 111_320; // metres per degree of latitude
const DZ = 2600; // ~thickness 300→200 hPa, metres (vertical shear per metre)
const DELTA = 0.6; // stencil half-spacing in degrees, for horizontal gradients

// A point at fraction f along the great circle from a to b (spherical interpolation).
function gcPoint(a: Coord, b: Coord, f: number): Coord {
  const p1 = a.lat * RAD, l1 = a.lon * RAD, p2 = b.lat * RAD, l2 = b.lon * RAD;
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d === 0) return { lat: a.lat, lon: a.lon };
  const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const z = A * Math.sin(p1) + B * Math.sin(p2);
  return { lat: Math.atan2(z, Math.hypot(x, y)) / RAD, lon: Math.atan2(y, x) / RAD };
}

// Meteorological wind (direction it blows FROM, speed m/s) → u,v components (m/s).
function uv(speedMs: number, dirDeg: number): [number, number] {
  return [-speedMs * Math.sin(dirDeg * RAD), -speedMs * Math.cos(dirDeg * RAD)];
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// The whole hour nearest the middle of the flight, as "HH:00".
function midHour(depUtc: string | null, arrUtc: string | null): string {
  if (!depUtc) return '12:00';
  const d = toMin(depUtc);
  const a = arrUtc ? toMin(arrUtc) : d;
  const h = Math.floor(Math.round((d + a) / 2) / 60) % 24;
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
  arrUtc: string | null,
): Promise<TurbulenceForecast | null> {
  if (!dep || !arr || !dateISO) return null;
  const a = AIRPORT_COORD[dep.toUpperCase()];
  const b = AIRPORT_COORD[arr.toUpperCase()];
  if (!a || !b) return null;

  const hour = midHour(depUtc, arrUtc);
  const key = `${dep}-${arr}-${dateISO}-${hour}`;
  if (cache.has(key)) return cache.get(key)!;

  // Sample a few points along the route (avoiding the airports themselves); each needs a
  // 5-point stencil (centre + N/S/E/W) to compute horizontal deformation.
  const centres = [0.25, 0.5, 0.75].map((f) => gcPoint(a, b, f));
  const locs: Coord[] = [];
  for (const c of centres) {
    locs.push(
      c,
      { lat: c.lat + DELTA, lon: c.lon },
      { lat: c.lat - DELTA, lon: c.lon },
      { lat: c.lat, lon: c.lon + DELTA },
      { lat: c.lat, lon: c.lon - DELTA },
    );
  }

  const lat = locs.map((l) => l.lat.toFixed(3)).join(',');
  const lon = locs.map((l) => l.lon.toFixed(3)).join(',');
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=cape,wind_speed_200hPa,wind_direction_200hPa,wind_speed_250hPa,wind_direction_250hPa,` +
    `wind_speed_300hPa,wind_direction_300hPa&wind_speed_unit=ms` +
    `&start_date=${dateISO}&end_date=${dateISO}&timezone=UTC`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const arrData = Array.isArray(data) ? data : [data];
    const times: string[] = arrData[0]?.hourly?.time ?? [];
    let idx = times.indexOf(`${dateISO}T${hour}`);
    if (idx < 0) idx = parseInt(hour, 10);
    if (idx < 0 || idx >= times.length) return null;

    const at = (loc: number, v: string): number => num(arrData[loc]?.hourly?.[v]?.[idx]);
    const rank = { low: 0, moderate: 1, high: 2 } as const;

    let worst: TurbulenceForecast | null = null;
    for (let k = 0; k < centres.length; k++) {
      const c = k * 5; // centre index; neighbours are c+1..c+4 (N, S, E, W)
      const dy = DELTA * M_PER_DEG;
      const dx = DELTA * M_PER_DEG * Math.cos(centres[k].lat * RAD) || 1;

      // Horizontal deformation at 250 hPa from the stencil.
      const [uN, vN] = uv(at(c + 1, 'wind_speed_250hPa'), at(c + 1, 'wind_direction_250hPa'));
      const [uS, vS] = uv(at(c + 2, 'wind_speed_250hPa'), at(c + 2, 'wind_direction_250hPa'));
      const [uE, vE] = uv(at(c + 3, 'wind_speed_250hPa'), at(c + 3, 'wind_direction_250hPa'));
      const [uW, vW] = uv(at(c + 4, 'wind_speed_250hPa'), at(c + 4, 'wind_direction_250hPa'));
      const dudx = (uE - uW) / (2 * dx), dvdx = (vE - vW) / (2 * dx);
      const dudy = (uN - uS) / (2 * dy), dvdy = (vN - vS) / (2 * dy);
      const def = Math.hypot(dudx - dvdy, dvdx + dudy); // stretching + shearing deformation

      // Vertical wind shear (vector) across 300→200 hPa at the centre.
      const [u200, v200] = uv(at(c, 'wind_speed_200hPa'), at(c, 'wind_direction_200hPa'));
      const [u300, v300] = uv(at(c, 'wind_speed_300hPa'), at(c, 'wind_direction_300hPa'));
      const shearMs = Math.hypot(u200 - u300, v200 - v300); // m/s across the layer
      const ellrod = (shearMs / DZ) * def * 1e7; // Ellrod TI1, scaled to readable units
      const shearKmh = shearMs * 3.6;
      const cape = at(c, 'cape');

      const level = computeRisk(ellrod, shearKmh, cape);
      if (!worst || rank[level] > rank[worst.level]) {
        worst = { level, ellrod: Math.round(ellrod), shearKmh: Math.round(shearKmh), capeJkg: Math.round(cape) };
      }
    }

    cache.set(key, worst);
    return worst;
  } catch {
    return null;
  }
}

// A Windy embed URL centred on the route midpoint, showing Windy's CAT/turbulence overlay at
// ~FL340 (250 hPa) — the clear-air-turbulence layer the user asked for. (Windy's turbulence
// overlay may require a Windy account/Premium to render in full; it falls back gracefully.)
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
    overlay: 'turbulence',
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
