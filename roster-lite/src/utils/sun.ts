// Sunrise/sunset computed locally (no API) so it works for any date — including
// rosters months ahead, beyond the weather forecast horizon. Times are returned in
// UTC ("z") to compare directly with the roster's flight times.
//
// Implementation: the Almanac for Computers / NOAA sunrise equation, official zenith
// 90.833° (accounts for refraction + the sun's disc). Accurate to ~1 minute.

const ZENITH = 90.833;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function dayOfYear(y: number, m: number, d: number): number {
  const n1 = Math.floor((275 * m) / 9);
  const n2 = Math.floor((m + 9) / 12);
  const n3 = 1 + Math.floor((y - 4 * Math.floor(y / 4) + 2) / 3);
  return n1 - n2 * n3 + d - 30;
}

function norm(v: number, max: number): number {
  return ((v % max) + max) % max;
}

// Returns the event time in UTC hours [0,24), or null if the sun doesn't rise/set
// that day at that latitude (polar day/night).
function sunEventUtcHours(lat: number, lon: number, N: number, rising: boolean): number | null {
  const lngHour = lon / 15;
  const t = N + ((rising ? 6 : 18) - lngHour) / 24;

  const M = 0.9856 * t - 3.289;
  let L = M + 1.916 * Math.sin(M * D2R) + 0.02 * Math.sin(2 * M * D2R) + 282.634;
  L = norm(L, 360);

  let RA = R2D * Math.atan(0.91764 * Math.tan(L * D2R));
  RA = norm(RA, 360);
  // Put RA in the same quadrant as L.
  const Lq = Math.floor(L / 90) * 90;
  const RAq = Math.floor(RA / 90) * 90;
  RA = (RA + (Lq - RAq)) / 15;

  const sinDec = 0.39782 * Math.sin(L * D2R);
  const cosDec = Math.cos(Math.asin(sinDec));

  const cosH = (Math.cos(ZENITH * D2R) - sinDec * Math.sin(lat * D2R)) / (cosDec * Math.cos(lat * D2R));
  if (cosH > 1 || cosH < -1) return null; // never rises / never sets

  const H = (rising ? 360 - R2D * Math.acos(cosH) : R2D * Math.acos(cosH)) / 15;
  const T = H + RA - 0.06571 * t - 6.622;
  return norm(T - lngHour, 24);
}

function toHhmm(hours: number): string {
  let h = Math.floor(hours);
  let m = Math.round((hours - h) * 60);
  if (m === 60) { m = 0; h = (h + 1) % 24; }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface SunTimes {
  sunriseUtc: string | null; // "HH:MM" z, or null on polar day/night
  sunsetUtc: string | null;
  polarDay: boolean;
  polarNight: boolean;
}

export function sunTimes(lat: number, lon: number, dateISO: string): SunTimes {
  const [y, m, d] = dateISO.split('-').map(Number);
  const N = dayOfYear(y, m, d);
  const rise = sunEventUtcHours(lat, lon, N, true);
  const set = sunEventUtcHours(lat, lon, N, false);
  // When neither event occurs, decide polar day vs night from the sun's noon altitude.
  let polarDay = false;
  let polarNight = false;
  if (rise === null && set === null) {
    const decl = R2D * Math.asin(0.39782 * Math.sin(((0.9856 * N - 3.289 + 282.634) % 360) * D2R));
    const noonAltitude = 90 - Math.abs(lat - decl);
    polarDay = noonAltitude > 0;
    polarNight = !polarDay;
  }
  return {
    sunriseUtc: rise === null ? null : toHhmm(rise),
    sunsetUtc: set === null ? null : toHhmm(set),
    polarDay,
    polarNight,
  };
}

// Is the given "HH:MM" UTC time during daylight at this location/date?
export function isDaylight(lat: number, lon: number, dateISO: string, hhmm: string): boolean | null {
  const { sunriseUtc, sunsetUtc, polarDay, polarNight } = sunTimes(lat, lon, dateISO);
  if (polarDay) return true;
  if (polarNight) return false;
  if (!sunriseUtc || !sunsetUtc) return null;
  const mins = (s: string) => { const [h, mm] = s.split(':').map(Number); return h * 60 + mm; };
  const t = mins(hhmm);
  const sr = mins(sunriseUtc);
  const ss = mins(sunsetUtc);
  // Handles the usual case where sunrise < sunset in UTC for the day.
  if (sr <= ss) return t >= sr && t <= ss;
  // Rare wrap-around (high latitudes): daylight spans midnight UTC.
  return t >= sr || t <= ss;
}
