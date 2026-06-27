import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Card, CardContent, Chip, IconButton, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ArrowBack } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { geoMercator, geoPath } from 'd3-geo';
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

  // Fit a Mercator projection to the airports flown (with padding), then use it for BOTH
  // the country backdrop and the route overlay so everything lines up. Falls back to the
  // PGA region when there are no flights yet.
  const { projection, landPath } = useMemo(() => {
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
    return { projection: proj, landPath: path(WORLD) ?? '' };
  }, [net.airports]);

  const point = (lon: number, lat: number): [number, number] | null => {
    const p = projection([lon, lat]);
    return p ? [p[0], p[1]] : null;
  };

  const maxVisits = Math.max(1, ...net.airports.map((a) => a.visits));
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
          <CardContent>
            <Box
              component="svg"
              viewBox={`0 0 ${W} ${H}`}
              sx={{ width: '100%', height: 'auto', display: 'block', borderRadius: 1 }}
            >
              {/* Sea + land backdrop */}
              <rect x={0} y={0} width={W} height={H} fill={sea} />
              <path d={landPath} fill={landFill} stroke={landStroke} strokeWidth={0.2} />

              {/* Routes */}
              {net.routes.map((r) => {
                const a = net.airports.find((x) => x.code === r.from);
                const b = net.airports.find((x) => x.code === r.to);
                if (!a || !b) return null;
                const pa = point(a.lon, a.lat);
                const pb = point(b.lon, b.lat);
                if (!pa || !pb) return null;
                return (
                  <line
                    key={`${r.from}-${r.to}`}
                    x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]}
                    stroke={route}
                    strokeOpacity={0.45}
                    strokeWidth={Math.min(1.2, 0.25 + r.count * 0.1)}
                    strokeLinecap="round"
                  />
                );
              })}

              {/* Airports */}
              {net.airports.map((a) => {
                const p = point(a.lon, a.lat);
                if (!p) return null;
                const radius = 0.7 + (a.visits / maxVisits) * 1.5;
                return (
                  <g key={a.code}>
                    <circle cx={p[0]} cy={p[1]} r={radius} fill={dot} stroke="#0008" strokeWidth={0.12} />
                    <text x={p[0]} y={p[1] - radius - 0.5} fontSize={1.9} textAnchor="middle"
                      fill={theme.palette.text.secondary}>
                      {a.code}
                    </text>
                  </g>
                );
              })}
            </Box>
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
