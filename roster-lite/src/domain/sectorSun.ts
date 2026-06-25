import { addDays, format, parseISO } from 'date-fns';
import { AIRPORT_COORD, type Coord } from './airports';
import { sunTimes, isDaylight, type SunTimes } from '../utils/sun';

// Daylight / night info for a flight sector: sun times at each airport and how much of the
// block is flown at night — estimated by sampling positions (great-circle) AND times along the
// route, so it accounts for the aircraft chasing or outrunning the terminator. Everything in UTC
// ("z") to match the roster's flight times. Uses the curated AIRPORT_COORD (the PGA/TAP network).

export interface SectorSun {
  blockMin: number;
  nightMin: number; // minutes of the sector flown in darkness
  depDay: boolean | null; // daylight at departure (null = polar/unknown)
  arrDay: boolean | null; // daylight at arrival
  depSun: SunTimes;
  arrSun: SunTimes;
}

const RAD = Math.PI / 180;

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function shiftDate(dateISO: string, days: number): string {
  return days ? format(addDays(parseISO(dateISO), days), 'yyyy-MM-dd') : dateISO;
}

// A date/time `min` minutes after midnight of dateISO, rolling past midnight into later days.
function atMinutes(dateISO: string, min: number): { dateISO: string; hhmm: string } {
  const days = Math.floor(min / 1440);
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return { dateISO: shiftDate(dateISO, days), hhmm: `${hh}:${mm}` };
}

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

export function sectorSun(
  dep: string | null,
  arr: string | null,
  dateISO: string | null,
  depHHmm: string | null,
  arrHHmm: string | null,
): SectorSun | null {
  const a = dep ? AIRPORT_COORD[dep.toUpperCase()] : undefined;
  const b = arr ? AIRPORT_COORD[arr.toUpperCase()] : undefined;
  if (!a || !b || !dateISO || !depHHmm || !arrHHmm) return null;

  const depMin = toMin(depHHmm);
  const arrRaw = toMin(arrHHmm);
  const overnight = arrRaw < depMin; // arrival the next day
  const blockMin = (overnight ? arrRaw + 1440 : arrRaw) - depMin;
  const arrDateISO = shiftDate(dateISO, overnight ? 1 : 0);

  // Sample the route in position AND time, counting night samples.
  const N = 16;
  let night = 0, counted = 0;
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const pt = gcPoint(a, b, f);
    const { dateISO: dISO, hhmm } = atMinutes(dateISO, depMin + f * blockMin);
    const dl = isDaylight(pt.lat, pt.lon, dISO, hhmm);
    if (dl !== null) { counted++; if (!dl) night++; }
  }
  const nightMin = counted ? Math.round((blockMin * night) / counted) : 0;

  return {
    blockMin,
    nightMin,
    depDay: isDaylight(a.lat, a.lon, dateISO, depHHmm),
    arrDay: isDaylight(b.lat, b.lon, arrDateISO, arrHHmm),
    depSun: sunTimes(a.lat, a.lon, dateISO),
    arrSun: sunTimes(b.lat, b.lon, arrDateISO),
  };
}
