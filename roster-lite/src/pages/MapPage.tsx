import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Card, CardContent, Chip, IconButton, Stack, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Add, ArrowBack, CenterFocusStrong, Remove } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { geoDistance, geoGraticule10, geoMercator, geoOrthographic, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import worldTopo from 'world-atlas/countries-110m.json';
import type { FeatureCollection } from 'geojson';
import { useRoster } from '../state/useRoster';
import { loadLogbook } from '../storage/rosterStore';
import { buildFlightNetwork } from '../domain/flightMap';
import type { LogbookRow } from '../domain/types';

const W = 100;
const H = 100;
const PAD = 8;

// World land/borders, decoded once from the bundled TopoJSON (offline, no map tiles).
const WORLD = feature(worldTopo as any, (worldTopo as any).objects.countries) as unknown as FeatureCollection;
const GRATICULE = geoGraticule10();
const SPHERE = { type: 'Sphere' } as const;

// The two ways to draw the network. "Plano" is the Mercator fitted to the airports flown —
// the right default for a regional network, where it uses the whole card. "Globo" is an
// orthographic globe the user can rotate: routes follow the great circle, at the cost of
// the network occupying a small patch of the sphere.
type MapMode = 'flat' | 'globe';
const MODE_KEY = 'crewroster.mapMode';
const GLOBE_ZOOM_MAX = 4;

function loadMode(): MapMode {
  try { return localStorage.getItem(MODE_KEY) === 'globe' ? 'globe' : 'flat'; } catch { return 'flat'; }
}

export default function MapPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const { activeUser } = useRoster();
  const userId = activeUser?.id;
  const dark = theme.palette.mode === 'dark';

  const [rows, setRows] = useState<LogbookRow[]>([]);
  const reload = useCallback(async () => {
    setRows(userId ? await loadLogbook(userId) : []);
  }, [userId]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    window.addEventListener('logbook-updated', reload);
    return () => window.removeEventListener('logbook-updated', reload);
  }, [reload]);

  const net = useMemo(
    () => buildFlightNetwork(rows.map((r) => ({ from: r.from, to: r.to }))),
    [rows],
  );

  const [mode, setMode] = useState<MapMode>(loadMode);
  const changeMode = (m: MapMode | null) => {
    if (!m) return; // ToggleButtonGroup sends null when the active button is pressed again
    setMode(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ }
  };

  // Globe view state. It opens facing the middle of the network; the user drags to turn it.
  const centre = useMemo<[number, number]>(() => {
    if (!net.airports.length) return [-9, 39]; // Lisbon
    const lon = net.airports.reduce((s, a) => s + a.lon, 0) / net.airports.length;
    const lat = net.airports.reduce((s, a) => s + a.lat, 0) / net.airports.length;
    return [lon, lat];
  }, [net.airports]);
  const [rotate, setRotate] = useState<[number, number]>([-centre[0], -centre[1]]);
  const [zoom, setZoom] = useState(1);
  useEffect(() => { setRotate([-centre[0], -centre[1]]); }, [centre]);

  // Drag to rotate: horizontal turns the globe about its axis, vertical tilts it (clamped so
  // it can't flip over the pole). A full-width swipe turns it 120° — enough to cross the
  // network in one go without overshooting — and less when zoomed in, so the spot under the
  // finger roughly follows it.
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ x: number; y: number; r: [number, number] } | null>(null);
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (mode !== 'globe') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, r: rotate };
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || !svgRef.current) return;
    const k = 120 / (svgRef.current.getBoundingClientRect().width * zoom);
    const lambda = d.r[0] + (e.clientX - d.x) * k;
    const phi = Math.max(-90, Math.min(90, d.r[1] - (e.clientY - d.y) * k));
    setRotate([lambda, phi]);
  };
  const onPointerUp = () => { drag.current = null; };

  // Plano: fit a Mercator projection to the airports flown (with padding), then use it for
  // BOTH the country backdrop and the route overlay so everything lines up. Falls back to
  // the PGA region when there are no flights yet.
  // Globo: an orthographic projection fitted to the whole sphere, turned to `rotate` and
  // scaled by `zoom`. Its default clip angle (90°) hides whatever is on the far side.
  const { projection, landPath, spherePath, gratPath } = useMemo(() => {
    if (mode === 'globe') {
      const proj = geoOrthographic().fitExtent([[PAD / 2, PAD / 2], [W - PAD / 2, H - PAD / 2]], SPHERE);
      proj.scale(proj.scale() * zoom).rotate([rotate[0], rotate[1], 0]);
      const path = geoPath(proj);
      return {
        projection: proj,
        landPath: path(WORLD) ?? '',
        spherePath: path(SPHERE) ?? '',
        gratPath: path(GRATICULE) ?? '',
      };
    }
    const lons = net.airports.map((a) => a.lon);
    const lats = net.airports.map((a) => a.lat);
    const bounds: [[number, number], [number, number]] = net.airports.length
      ? [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]]
      : [[-32, 27], [18, 56]]; // Azores → Central Europe / North Africa
    const region: GeoJSON.GeoJSON = {
      type: 'MultiPoint',
      coordinates: [bounds[0], bounds[1]],
    };
    const proj = geoMercator().fitExtent([[PAD, PAD], [W - PAD, H - PAD]], region);
    const path = geoPath(proj);
    return { projection: proj, landPath: path(WORLD) ?? '', spherePath: '', gratPath: '' };
  }, [mode, net.airports, rotate, zoom]);
  const routePath = useMemo(() => geoPath(projection), [projection]);

  // On the globe, a point is visible only on the hemisphere facing the viewer — within 90° of
  // the centre of view. (The flat map shows everything it was fitted to.)
  const facing = (lon: number, lat: number): boolean =>
    mode !== 'globe' || geoDistance([lon, lat], [-rotate[0], -rotate[1]]) < Math.PI / 2;

  const point = (lon: number, lat: number): [number, number] | null => {
    if (!facing(lon, lat)) return null;
    const p = projection([lon, lat]);
    return p ? [p[0], p[1]] : null;
  };

  const maxVisits = Math.max(1, ...net.airports.map((a) => a.visits));
  // Zoomed out, the globe packs a regional network into a few millimetres: codes would pile
  // on top of each other, so they appear only once zoomed in, and the dots shrink to match.
  const compact = mode === 'globe' && zoom < 2;
  const route = theme.palette.primary.main;
  const dot = dark ? '#ffd54f' : theme.palette.primary.main;
  const landFill = dark ? '#2b3a4a' : '#dfe6ec';
  const landStroke = dark ? '#3f5266' : '#c2ccd6';
  const sea = dark ? '#16202b' : '#eef3f7';

  return (
    <Stack spacing={2}>
      <Box display="flex" alignItems="center" gap={1}>
        <IconButton onClick={() => navigate(-1)}><ArrowBack /></IconButton>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>Mapa de voos</Typography>
        <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, m) => changeMode(m)}>
          <ToggleButton value="flat" sx={{ px: 1.25, py: 0.25 }}>Plano</ToggleButton>
          <ToggleButton value="globe" sx={{ px: 1.25, py: 0.25 }}>Globo</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Card variant="outlined">
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Box display="flex" flexWrap="wrap" gap={1}>
            <Chip size="small" variant="outlined" label={`${net.airports.length} aeroportos`} />
            <Chip size="small" variant="outlined" label={`${net.routes.length} rotas`} />
            <Chip size="small" variant="outlined" label={`${rows.length} setores`} />
          </Box>
        </CardContent>
      </Card>

      {net.airports.length === 0 ? (
        <Alert severity="info">
          Sem voos no diário ainda. Importa a escala (preenche o diário) e o mapa aparece aqui.
        </Alert>
      ) : (
        <Card variant="outlined">
          <CardContent sx={{ position: 'relative' }}>
            <Box
              component="svg"
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              sx={{
                width: '100%', height: 'auto', display: 'block', borderRadius: 1,
                // On the globe a drag turns it, so the page mustn't scroll under the finger.
                ...(mode === 'globe' && { touchAction: 'none', cursor: 'grab', '&:active': { cursor: 'grabbing' } }),
              }}
            >
              {mode === 'globe' ? (
                <>
                  {/* Space, then the sphere's sea, a light lat/lon grid, and land on top */}
                  <rect x={0} y={0} width={W} height={H} fill={dark ? '#0b1118' : '#f7f9fb'} />
                  <path d={spherePath} fill={sea} stroke={landStroke} strokeWidth={0.3} />
                  <path d={gratPath} fill="none" stroke={landStroke} strokeOpacity={0.5} strokeWidth={0.1} />
                  <path d={landPath} fill={landFill} stroke={landStroke} strokeWidth={0.15} />
                </>
              ) : (
                <>
                  {/* Sea + land backdrop */}
                  <rect x={0} y={0} width={W} height={H} fill={sea} />
                  <path d={landPath} fill={landFill} stroke={landStroke} strokeWidth={0.2} />
                </>
              )}

              {/* Routes */}
              {net.routes.map((r) => {
                const a = net.airports.find((x) => x.code === r.from);
                const b = net.airports.find((x) => x.code === r.to);
                if (!a || !b) return null;
                const width = Math.min(1.2, 0.25 + r.count * 0.1);
                // On the globe the route is drawn as a geodesic, so it bends along the great
                // circle and the projection's clipping trims any part that turns out of view.
                if (mode === 'globe') {
                  const d = routePath({ type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] });
                  return d ? (
                    <path key={`${r.from}-${r.to}`} d={d} fill="none" stroke={route}
                      strokeOpacity={0.6} strokeWidth={width} strokeLinecap="round" />
                  ) : null;
                }
                const pa = point(a.lon, a.lat);
                const pb = point(b.lon, b.lat);
                if (!pa || !pb) return null;
                return (
                  <line
                    key={`${r.from}-${r.to}`}
                    x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]}
                    stroke={route}
                    strokeOpacity={0.45}
                    strokeWidth={width}
                    strokeLinecap="round"
                  />
                );
              })}

              {/* Airports */}
              {net.airports.map((a) => {
                const p = point(a.lon, a.lat);
                if (!p) return null;
                const radius = compact ? 0.45 + (a.visits / maxVisits) * 0.9 : 0.7 + (a.visits / maxVisits) * 1.5;
                return (
                  <g key={a.code}>
                    <circle cx={p[0]} cy={p[1]} r={radius} fill={dot} stroke="#0008" strokeWidth={0.12} />
                    {!compact && (
                      <text x={p[0]} y={p[1] - radius - 0.5} fontSize={1.9} textAnchor="middle"
                        fill={theme.palette.text.secondary}>
                        {a.code}
                      </text>
                    )}
                  </g>
                );
              })}
            </Box>
            {mode === 'globe' && (
              <Stack
                spacing={0.5}
                sx={{ position: 'absolute', right: 24, bottom: 24, bgcolor: 'background.paper', borderRadius: 2, boxShadow: 1 }}
              >
                <IconButton size="small" aria-label="Aproximar" disabled={zoom >= GLOBE_ZOOM_MAX}
                  onClick={() => setZoom((z) => Math.min(GLOBE_ZOOM_MAX, z * 1.5))}>
                  <Add fontSize="small" />
                </IconButton>
                <IconButton size="small" aria-label="Afastar" disabled={zoom <= 1}
                  onClick={() => setZoom((z) => Math.max(1, z / 1.5))}>
                  <Remove fontSize="small" />
                </IconButton>
                <IconButton size="small" aria-label="Centrar na rede"
                  onClick={() => setRotate([-centre[0], -centre[1]])}>
                  <CenterFocusStrong fontSize="small" />
                </IconButton>
              </Stack>
            )}
          </CardContent>
        </Card>
      )}

      {net.unknown.length > 0 && (
        <Typography variant="caption" color="text.secondary">
          Sem coordenadas (não desenhados): {net.unknown.join(', ')}.
        </Typography>
      )}
    </Stack>
  );
}
