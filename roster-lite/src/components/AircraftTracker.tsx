import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { FlightLand, FlightTakeoff, Refresh } from '@mui/icons-material';
import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import worldTopo from 'world-atlas/countries-110m.json';
import type { FeatureCollection } from 'geojson';
import { fetchAircraftPosition, type AircraftPosition } from '../domain/aircraftPosition';
import { airportCoord } from '../domain/airportCoords';

// A small offline map (same D3 + bundled world TopoJSON as the Map page — no tiles) showing where
// the aircraft that will operate this flight currently is, while it's still airborne. Lazy-loaded,
// so the world data / d3 only load when a live aircraft is actually shown. Renders nothing when the
// aircraft isn't being tracked (on the ground / out of coverage), keeping it opportunistic.

const WORLD = feature(worldTopo as any, (worldTopo as any).objects.countries) as unknown as FeatureCollection;
const W = 320;
const H = 172;
const PAD = 10;
const REFRESH_MS = 30_000;

// Great-circle distance in nautical miles between two lat/lon points.
function distanceNm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 3440.065; // Earth radius in NM
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(s))));
}

export default function AircraftTracker({ reg, dep }: { reg: string; dep: string | null }) {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const [pos, setPos] = useState<AircraftPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const aliveRef = useRef(true);

  const load = useCallback((force = false) => {
    setLoading(true);
    fetchAircraftPosition(reg, { force })
      .then((p) => { if (aliveRef.current) setPos(p); })
      .finally(() => { if (aliveRef.current) setLoading(false); });
  }, [reg]);

  useEffect(() => {
    aliveRef.current = true;
    load();
    const t = setInterval(() => load(true), REFRESH_MS); // keep the position fresh while open
    return () => { aliveRef.current = false; clearInterval(t); };
  }, [load]);

  const depCoord = useMemo(() => airportCoord(dep), [dep]);

  const geo = useMemo(() => {
    if (!pos) return null;
    const pts: [number, number][] = [[pos.lon, pos.lat]];
    if (depCoord) pts.push([depCoord.lon, depCoord.lat]);
    const lons = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    // Pad the bounding box so a lone point (or two close ones) isn't over-zoomed.
    const margin = Math.max(1.5, (Math.max(...lons) - Math.min(...lons)) * 0.35, (Math.max(...lats) - Math.min(...lats)) * 0.35);
    const region: GeoJSON.GeoJSON = {
      type: 'MultiPoint',
      coordinates: [[Math.min(...lons) - margin, Math.min(...lats) - margin], [Math.max(...lons) + margin, Math.max(...lats) + margin]],
    };
    const proj = geoMercator().fitExtent([[PAD, PAD], [W - PAD, H - PAD]], region);
    const path = geoPath(proj);
    const acXY = proj([pos.lon, pos.lat]);
    const depXY = depCoord ? proj([depCoord.lon, depCoord.lat]) : null;
    return { landPath: path(WORLD) ?? '', acXY, depXY };
  }, [pos, depCoord]);

  // Opportunistic: only show when the aircraft is actually being tracked (airborne OR on the
  // ground — the user wants to know it has landed too). Nothing to show when it isn't located.
  if (!loading && !pos) return null;

  const landFill = dark ? '#2a2f38' : '#e6e8ec';
  const landStroke = dark ? '#3a4150' : '#c7ccd4';
  const onGround = !!pos?.onGround;
  const flLevel = !onGround && pos?.altFt != null ? Math.round(pos.altFt / 100) : null;
  const distNm = pos && depCoord ? distanceNm(pos, depCoord) : null;
  // On the ground within a few NM of your departure airport → it has arrived where you'll board.
  const atDep = onGround && distNm != null && distNm <= 4;

  return (
    <Box sx={{ mt: 1.25 }}>
      <Box display="flex" alignItems="center" gap={0.75} mb={0.5}>
        {onGround ? <FlightLand fontSize="small" sx={{ color: 'text.secondary' }} /> : <FlightTakeoff fontSize="small" sx={{ color: 'text.secondary' }} />}
        <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
          {onGround ? (atDep ? `Aeronave já em ${dep}` : 'Aeronave no solo') : 'Aeronave a caminho'}
          {pos?.reg ? ` · ${pos.reg}` : ''}
        </Typography>
        {loading && !pos ? (
          <CircularProgress size={14} />
        ) : (
          <Tooltip title="Atualizar posição">
            <IconButton size="small" onClick={() => load(true)} sx={{ p: 0.25 }} aria-label="Atualizar posição da aeronave">
              <Refresh sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {pos && geo && (
        <>
          <Box
            component="svg"
            viewBox={`0 0 ${W} ${H}`}
            sx={{ width: '100%', height: 'auto', display: 'block', borderRadius: 2, bgcolor: dark ? '#12151b' : '#f2f5fb', border: '1px solid', borderColor: 'divider' }}
          >
            <path d={geo.landPath} fill={landFill} stroke={landStroke} strokeWidth={0.3} />
            {/* line from the aircraft to your departure airport */}
            {geo.acXY && geo.depXY && (
              <line
                x1={geo.acXY[0]} y1={geo.acXY[1]} x2={geo.depXY[0]} y2={geo.depXY[1]}
                stroke={theme.palette.primary.main} strokeWidth={0.8} strokeDasharray="3 2" opacity={0.7}
              />
            )}
            {/* your departure airport */}
            {geo.depXY && (
              <>
                <circle cx={geo.depXY[0]} cy={geo.depXY[1]} r={3} fill={theme.palette.primary.main} stroke="#fff" strokeWidth={0.6} />
                <text x={geo.depXY[0]} y={geo.depXY[1] - 5} textAnchor="middle" fontSize={8} fill={dark ? '#cfd6e2' : '#3a4150'} fontWeight={700}>
                  {dep}
                </text>
              </>
            )}
            {/* the aircraft, pointing along its track (orange once on the ground) */}
            {geo.acXY && (
              <g transform={`translate(${geo.acXY[0]} ${geo.acXY[1]}) rotate(${pos.track ?? 0})`}>
                <path d="M0,-7 L5,6 L0,3 L-5,6 Z" fill={onGround ? '#fb8c00' : '#e53935'} stroke="#fff" strokeWidth={0.7} />
              </g>
            )}
          </Box>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5, lineHeight: 1.4 }}>
            {[
              pos.flight ? `Voo ${pos.flight}` : null,
              onGround ? (atDep ? `no solo em ${dep}` : 'no solo') : (flLevel != null ? `FL${flLevel}` : null),
              !onGround && pos.gsKt != null ? `${pos.gsKt} kt` : null,
              !atDep && distNm != null ? `~${distNm} NM de ${dep}` : null,
            ].filter(Boolean).join(' · ')}
            {pos.seenSec != null && (
              <Box component="span" sx={{ opacity: 0.7 }}> · há {Math.round(pos.seenSec)}s</Box>
            )}
          </Typography>
        </>
      )}
    </Box>
  );
}
