// Approximate airport coordinates (decimal degrees) for the PGA / TAP Express
// network. Used to centre the route map and to sample the en-route weather at the
// great-circle midpoint. Keep this in sync with AIRPORT_TZ in utils/localTime.ts.
export interface Coord {
  lat: number;
  lon: number;
}

export const AIRPORT_COORD: Record<string, Coord> = {
  // Portugal (mainland + islands)
  LIS: { lat: 38.774, lon: -9.134 }, OPO: { lat: 41.248, lon: -8.681 }, FAO: { lat: 37.014, lon: -7.966 },
  FNC: { lat: 32.698, lon: -16.774 }, PXO: { lat: 33.073, lon: -16.350 },
  PDL: { lat: 37.741, lon: -25.698 }, TER: { lat: 38.762, lon: -27.091 },
  HOR: { lat: 38.520, lon: -28.716 }, PIX: { lat: 39.461, lon: -31.171 },
  // Spain (peninsula + Canaries)
  MAD: { lat: 40.498, lon: -3.568 }, BCN: { lat: 41.297, lon: 2.083 }, AGP: { lat: 36.675, lon: -4.499 },
  SVQ: { lat: 37.418, lon: -5.893 }, VLC: { lat: 39.489, lon: -0.482 }, BIO: { lat: 43.301, lon: -2.911 },
  VGO: { lat: 42.232, lon: -8.627 }, SCQ: { lat: 42.896, lon: -8.415 },
  PMI: { lat: 39.552, lon: 2.739 }, IBZ: { lat: 38.873, lon: 1.373 }, MAH: { lat: 39.863, lon: 4.219 },
  LPA: { lat: 27.932, lon: -15.387 }, TFN: { lat: 28.483, lon: -16.342 },
  TFS: { lat: 28.044, lon: -16.572 }, ACE: { lat: 28.945, lon: -13.605 },
  // France
  NCE: { lat: 43.658, lon: 7.216 }, CDG: { lat: 49.010, lon: 2.548 }, ORY: { lat: 48.723, lon: 2.380 },
  LYS: { lat: 45.726, lon: 5.081 }, TLS: { lat: 43.629, lon: 1.364 }, BOD: { lat: 44.828, lon: -0.716 },
  MRS: { lat: 43.439, lon: 5.221 }, NTE: { lat: 47.153, lon: -1.611 },
  // Italy
  BLQ: { lat: 44.535, lon: 11.289 }, FLR: { lat: 43.810, lon: 11.205 }, FCO: { lat: 41.800, lon: 12.239 },
  MXP: { lat: 45.631, lon: 8.728 }, LIN: { lat: 45.445, lon: 9.277 }, VCE: { lat: 45.505, lon: 12.352 },
  NAP: { lat: 40.886, lon: 14.291 }, TRN: { lat: 45.201, lon: 7.650 },
  // Germany
  FRA: { lat: 50.038, lon: 8.562 }, MUC: { lat: 48.354, lon: 11.786 }, DUS: { lat: 51.290, lon: 6.767 },
  HAM: { lat: 53.630, lon: 9.988 }, STR: { lat: 48.690, lon: 9.222 }, BER: { lat: 52.367, lon: 13.503 },
  CGN: { lat: 50.866, lon: 7.143 }, NUE: { lat: 49.499, lon: 11.078 },
  // Morocco
  RAK: { lat: 31.607, lon: -8.036 }, CMN: { lat: 33.368, lon: -7.590 },
  RBA: { lat: 34.052, lon: -6.752 }, TNG: { lat: 35.727, lon: -5.917 },
  // Rest of Europe
  LHR: { lat: 51.470, lon: -0.454 }, LGW: { lat: 51.154, lon: -0.182 }, MAN: { lat: 53.354, lon: -2.275 },
  DUB: { lat: 53.426, lon: -6.250 }, AMS: { lat: 52.311, lon: 4.768 }, BRU: { lat: 50.901, lon: 4.484 },
  LUX: { lat: 49.627, lon: 6.212 }, GVA: { lat: 46.238, lon: 6.109 }, ZRH: { lat: 47.458, lon: 8.556 },
  VIE: { lat: 48.110, lon: 16.570 },
};

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

// Great-circle midpoint between two coordinates. More accurate than averaging
// lat/lon, which matters for the longer trans-European sectors.
export function midpoint(a: Coord, b: Coord): Coord {
  const lat1 = toRad(a.lat), lon1 = toRad(a.lon), lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const bx = Math.cos(lat2) * Math.cos(dLon);
  const by = Math.cos(lat2) * Math.sin(dLon);
  const lat3 = Math.atan2(
    Math.sin(lat1) + Math.sin(lat2),
    Math.sqrt((Math.cos(lat1) + bx) ** 2 + by ** 2)
  );
  const lon3 = lon1 + Math.atan2(by, Math.cos(lat1) + bx);
  return { lat: toDeg(lat3), lon: toDeg(lon3) };
}
