import { useEffect, useState } from 'react';
import { AIRPORT_COORD } from '../domain/airports';
import { conditionOf, type Condition } from '../domain/skyWeather';
import { describeWeatherCode } from '../utils/airportWeather';

// The weather right now over an airport, for the banners' sky. From Open-Meteo's current
// conditions (keyless, CORS, already in the CSP) — a model value for ambience, not a METAR.

export interface CurrentWeather {
  condition: Condition;
  label: string;
  tempC: number;
}

const TTL = 15 * 60_000;
const cache = new Map<string, { at: number; wx: CurrentWeather | null }>();
const inflight = new Map<string, Promise<CurrentWeather | null>>();

async function fetchCurrent(airport: string): Promise<CurrentWeather | null> {
  const hit = cache.get(airport);
  if (hit && Date.now() - hit.at < TTL) return hit.wx;
  const pending = inflight.get(airport);
  if (pending) return pending;
  const c = AIRPORT_COORD[airport];
  if (!c) return null;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${c.lat.toFixed(3)}&longitude=${c.lon.toFixed(3)}` +
    `&current=temperature_2m,weather_code,cloud_cover&timezone=UTC`;
  const p = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const cur = (await res.json())?.current;
      if (typeof cur?.weather_code !== 'number') return null;
      return {
        condition: conditionOf(cur.weather_code, cur.cloud_cover),
        label: describeWeatherCode(cur.weather_code).label,
        tempC: Math.round(Number(cur.temperature_2m) || 0),
      };
    } catch {
      return null; // offline: the sky just shows the time of day
    }
  })().then((wx) => {
    // A failure is remembered for a shorter while, so a reconnect picks it up soon.
    cache.set(airport, { at: wx ? Date.now() : Date.now() - TTL + 2 * 60_000, wx });
    inflight.delete(airport);
    return wx;
  });
  inflight.set(airport, p);
  return p;
}

export function useCurrentWeather(airport: string | null | undefined): CurrentWeather | null {
  const key = airport?.toUpperCase() ?? '';
  const [wx, setWx] = useState<{ key: string; wx: CurrentWeather | null } | null>(null);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const load = () => fetchCurrent(key).then((w) => { if (alive) setWx({ key, wx: w }); });
    load();
    const t = setInterval(load, TTL);
    return () => { alive = false; clearInterval(t); };
  }, [key]);
  return wx && wx.key === key ? wx.wx : null;
}
