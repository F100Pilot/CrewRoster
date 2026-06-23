import { AIRPORT_COORD } from '../domain/airports';

// Expected surface weather at an airport for a given date/hour (UTC), from Open-Meteo
// (free, no API key, CORS-enabled). This is a forecast for planning context — it does
// NOT replace the official METAR/TAF briefing. Forecast horizon is ~16 days; beyond
// that the API has no data and we return null.

export interface AirportWeather {
  tempC: number;
  windKt: number;
  gustKt: number;
  windDir: number; // degrees
  weatherCode: number;
  precipMm: number;
  visibilityKm: number | null;
  cloudPct: number;
}

// WMO weather interpretation codes → short PT label + emoji.
export function describeWeatherCode(code: number): { label: string; emoji: string } {
  const m: Record<number, { label: string; emoji: string }> = {
    0: { label: 'Céu limpo', emoji: '☀️' },
    1: { label: 'Pouco nublado', emoji: '🌤️' },
    2: { label: 'P. nublado', emoji: '⛅' },
    3: { label: 'Nublado', emoji: '☁️' },
    45: { label: 'Nevoeiro', emoji: '🌫️' },
    48: { label: 'Nevoeiro gelado', emoji: '🌫️' },
    51: { label: 'Chuvisco fraco', emoji: '🌦️' },
    53: { label: 'Chuvisco', emoji: '🌦️' },
    55: { label: 'Chuvisco forte', emoji: '🌦️' },
    56: { label: 'Chuvisco gelado', emoji: '🌧️' },
    57: { label: 'Chuvisco gelado', emoji: '🌧️' },
    61: { label: 'Chuva fraca', emoji: '🌧️' },
    63: { label: 'Chuva', emoji: '🌧️' },
    65: { label: 'Chuva forte', emoji: '🌧️' },
    66: { label: 'Chuva gelada', emoji: '🌧️' },
    67: { label: 'Chuva gelada', emoji: '🌧️' },
    71: { label: 'Neve fraca', emoji: '🌨️' },
    73: { label: 'Neve', emoji: '🌨️' },
    75: { label: 'Neve forte', emoji: '❄️' },
    77: { label: 'Grãos de neve', emoji: '🌨️' },
    80: { label: 'Aguaceiros fracos', emoji: '🌦️' },
    81: { label: 'Aguaceiros', emoji: '🌦️' },
    82: { label: 'Aguaceiros fortes', emoji: '⛈️' },
    85: { label: 'Aguaceiros de neve', emoji: '🌨️' },
    86: { label: 'Aguaceiros de neve', emoji: '🌨️' },
    95: { label: 'Trovoada', emoji: '⛈️' },
    96: { label: 'Trovoada com granizo', emoji: '⛈️' },
    99: { label: 'Trovoada com granizo', emoji: '⛈️' },
  };
  return m[code] ?? { label: '—', emoji: '🌡️' };
}

// 16-point compass abbreviation for a wind direction in degrees.
export function windCardinal(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function nearestHour(hhmm: string | null): string {
  if (!hhmm) return '12:00';
  const [h, m] = hhmm.split(':').map(Number);
  const hr = (h + (m >= 30 ? 1 : 0)) % 24;
  return `${String(hr).padStart(2, '0')}:00`;
}

const cache = new Map<string, AirportWeather | null>();

export async function fetchAirportWeather(
  icao: string | null,
  dateISO: string | null,
  hhmm: string | null,
): Promise<AirportWeather | null> {
  if (!icao || !dateISO) return null;
  const coord = AIRPORT_COORD[icao.toUpperCase()];
  if (!coord) return null;

  const hour = nearestHour(hhmm);
  const key = `${icao}-${dateISO}-${hour}`;
  if (cache.has(key)) return cache.get(key)!;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${coord.lat.toFixed(3)}&longitude=${coord.lon.toFixed(3)}` +
    `&hourly=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,visibility,cloud_cover` +
    `&wind_speed_unit=kn&start_date=${dateISO}&end_date=${dateISO}&timezone=UTC`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      cache.set(key, null);
      return null;
    }
    const data = await res.json();
    const times: string[] = data?.hourly?.time ?? [];
    const target = `${dateISO}T${hour}`;
    let idx = times.indexOf(target);
    if (idx < 0) idx = parseInt(hour, 10);
    if (idx < 0 || idx >= times.length) {
      cache.set(key, null);
      return null;
    }

    const h = data.hourly;
    const visM = h.visibility?.[idx];
    const weather: AirportWeather = {
      tempC: Math.round(num(h.temperature_2m?.[idx])),
      windKt: Math.round(num(h.wind_speed_10m?.[idx])),
      gustKt: Math.round(num(h.wind_gusts_10m?.[idx])),
      windDir: Math.round(num(h.wind_direction_10m?.[idx])),
      weatherCode: Math.round(num(h.weather_code?.[idx])),
      precipMm: num(h.precipitation?.[idx]),
      visibilityKm: typeof visM === 'number' ? Math.round(visM / 100) / 10 : null,
      cloudPct: Math.round(num(h.cloud_cover?.[idx])),
    };
    cache.set(key, weather);
    return weather;
  } catch {
    return null;
  }
}
