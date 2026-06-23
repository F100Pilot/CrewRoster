import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Card, CardContent, Chip, IconButton, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ArrowBack } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { loadLogbook } from '../storage/rosterStore';
import { buildFlightNetwork } from '../domain/flightMap';
import type { LogbookRow } from '../domain/types';

// Pad around the projected extent so dots/labels near the edge aren't clipped.
const PAD = 6;

export default function MapPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const { activeUser } = useRoster();
  const userId = activeUser?.id;

  const [rows, setRows] = useState<LogbookRow[]>([]);
  const reload = useCallback(async () => {
    setRows(userId ? await loadLogbook(userId) : []);
  }, [userId]);
  useEffect(() => { reload(); }, [reload]);

  const net = useMemo(
    () => buildFlightNetwork(rows.map((r) => ({ from: r.from, to: r.to }))),
    [rows],
  );

  // Equirectangular projection with a cos(meanLat) correction so the regional map keeps a
  // sensible aspect ratio. Normalised into a 0..100 (x) box; y scaled to match.
  const projected = useMemo(() => {
    if (net.airports.length === 0) return null;
    const meanLat = net.airports.reduce((s, a) => s + a.lat, 0) / net.airports.length;
    const k = Math.cos((meanLat * Math.PI) / 180);
    const pts = net.airports.map((a) => ({ ...a, px: a.lon * k, py: -a.lat }));
    const xs = pts.map((p) => p.px), ys = pts.map((p) => p.py);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanX = maxX - minX || 1, spanY = maxY - minY || 1;
    const W = 100;
    const H = (spanY / spanX) * W;
    const sx = (px: number) => PAD + ((px - minX) / spanX) * (W - 2 * PAD);
    const sy = (py: number) => PAD + ((py - minY) / spanY) * (H - 2 * PAD);
    const byCode = new Map(pts.map((p) => [p.code, { x: sx(p.px), y: sy(p.py), visits: p.visits, code: p.code }]));
    return { W, H, byCode: byCode };
  }, [net]);

  const maxVisits = Math.max(1, ...net.airports.map((a) => a.visits));
  const stroke = theme.palette.primary.main;
  const labelColor = theme.palette.text.secondary;

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

      {!projected ? (
        <Alert severity="info">
          Sem voos no diário ainda. Importa a escala (preenche o diário) e o mapa aparece aqui.
        </Alert>
      ) : (
        <Card variant="outlined">
          <CardContent>
            <Box
              component="svg"
              viewBox={`0 0 ${projected.W} ${projected.H}`}
              sx={{ width: '100%', height: 'auto', display: 'block' }}
            >
              {/* Routes */}
              {net.routes.map((r) => {
                const a = projected.byCode.get(r.from);
                const b = projected.byCode.get(r.to);
                if (!a || !b) return null;
                return (
                  <line
                    key={`${r.from}-${r.to}`}
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={stroke}
                    strokeOpacity={0.35}
                    strokeWidth={Math.min(1.4, 0.3 + r.count * 0.12)}
                    strokeLinecap="round"
                  />
                );
              })}
              {/* Airports */}
              {[...projected.byCode.values()].map((p) => {
                const radius = 0.8 + (p.visits / maxVisits) * 1.8;
                return (
                  <g key={p.code}>
                    <circle cx={p.x} cy={p.y} r={radius} fill={stroke} />
                    <text
                      x={p.x} y={p.y - radius - 0.6}
                      fontSize={2.2} textAnchor="middle" fill={labelColor}
                    >
                      {p.code}
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
