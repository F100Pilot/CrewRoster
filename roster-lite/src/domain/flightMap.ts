import { AIRPORT_COORD } from './airports';

// Aggregated flight network for the map: airports visited (with visit counts) and the
// undirected routes between them (LIS→GVA and GVA→LIS count as one edge).
export interface MapAirport { code: string; lat: number; lon: number; visits: number }
export interface MapRoute { from: string; to: string; count: number }
export interface FlightNetwork {
  airports: MapAirport[];
  routes: MapRoute[];
  unknown: string[]; // airport codes flown but without coordinates (skipped on the map)
}

export function buildFlightNetwork(legs: { from: string; to: string }[]): FlightNetwork {
  const visits = new Map<string, number>();
  const routes = new Map<string, MapRoute>();
  const unknown = new Set<string>();

  const known = (code: string) => {
    if (AIRPORT_COORD[code]) return true;
    if (code) unknown.add(code);
    return false;
  };

  for (const { from, to } of legs) {
    const a = from?.toUpperCase();
    const b = to?.toUpperCase();
    if (a && known(a)) visits.set(a, (visits.get(a) ?? 0) + 1);
    if (b && known(b)) visits.set(b, (visits.get(b) ?? 0) + 1);
    if (a && b && AIRPORT_COORD[a] && AIRPORT_COORD[b] && a !== b) {
      const key = [a, b].sort().join('-');
      const cur = routes.get(key);
      if (cur) cur.count += 1;
      else routes.set(key, { from: a < b ? a : b, to: a < b ? b : a, count: 1 });
    }
  }

  const airports: MapAirport[] = [...visits.entries()].map(([code, v]) => ({
    code, lat: AIRPORT_COORD[code].lat, lon: AIRPORT_COORD[code].lon, visits: v,
  }));
  return { airports, routes: [...routes.values()], unknown: [...unknown] };
}
