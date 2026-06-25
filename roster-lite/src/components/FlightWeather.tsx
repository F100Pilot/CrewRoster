import { useEffect, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle,
  IconButton, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { Air, Close } from '@mui/icons-material';
import { fetchTurbulence, windyEmbedUrl, type TurbulenceForecast, type TurbulenceLevel } from '../utils/turbulence';
import AirportWeather from './AirportWeather';
import type { ParsedDuty } from '../domain/types';

const LEVEL: Record<TurbulenceLevel, { label: string; color: string }> = {
  low: { label: 'Turbulência baixa', color: '#2e7d32' },
  moderate: { label: 'Turbulência moderada', color: '#ed6c02' },
  high: { label: 'Turbulência elevada', color: '#c62828' },
};

// Route weather for a single flight: a compact trigger chip in the day view that opens a
// modal with the full content (per-airport forecast, a large Windy map at ~FL340, and a
// turbulence-risk estimate). Everything is best-effort and clearly labelled — it never
// replaces the official meteo briefing.
export default function FlightWeather({ duty, date }: { duty: ParsedDuty; date: string }) {
  const mapUrl = windyEmbedUrl(duty.departureAirport, duty.arrivalAirport);
  const [fc, setFc] = useState<TurbulenceForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchTurbulence(duty.departureAirport, duty.arrivalAirport, date, duty.departureTime, duty.arrivalTime)
      .then((f) => alive && (setFc(f), setLoading(false)))
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [duty.departureAirport, duty.arrivalAirport, date, duty.departureTime, duty.arrivalTime]);

  // Unknown airports — we can't centre a map or sample weather, so show nothing.
  if (!mapUrl) return null;

  const levelChip = loading ? (
    <CircularProgress size={14} />
  ) : fc ? (
    <Chip size="small" label={LEVEL[fc.level].label} sx={{ bgcolor: LEVEL[fc.level].color, color: '#fff', fontWeight: 600 }} />
  ) : (
    <Chip size="small" variant="outlined" label="Estimativa indisponível" />
  );

  return (
    <Box sx={{ mt: 1.5 }}>
      <Button
        onClick={() => setOpen(true)}
        startIcon={<Air />}
        variant="outlined"
        size="small"
        sx={{ textTransform: 'none' }}
      >
        Meteo da rota
        <Box component="span" sx={{ ml: 1 }}>{levelChip}</Box>
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} fullScreen={fullScreen} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
          <Air color="primary" />
          <Box flexGrow={1}>
            Meteo {duty.departureAirport}–{duty.arrivalAirport}
          </Box>
          {!loading && fc && (
            <Chip size="small" label={LEVEL[fc.level].label} sx={{ bgcolor: LEVEL[fc.level].color, color: '#fff', fontWeight: 600 }} />
          )}
          <IconButton onClick={() => setOpen(false)} size="small" aria-label="Fechar"><Close fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {/* Expected surface weather at each airport, at its scheduled time. */}
          <Box display="flex" gap={1} mb={1.5} flexWrap="wrap">
            <AirportWeather icao={duty.departureAirport} label="Partida" dateISO={date} timeUtc={duty.departureTime} />
            <AirportWeather icao={duty.arrivalAirport} label="Chegada" dateISO={date} timeUtc={duty.arrivalTime} />
          </Box>

          <Box sx={{ borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
            {open && (
              <iframe
                title="Mapa meteorológico da rota"
                src={mapUrl}
                width="100%"
                height={fullScreen ? 420 : 360}
                loading="lazy"
                style={{ display: 'block', border: 0 }}
              />
            )}
          </Box>

          <Typography variant="caption" color="text.secondary" display="block" mt={1}>
            {fc ? `Estimativa de turbulência a ~FL340 ao longo da rota (índice Ellrod ${fc.ellrod} · shear ${fc.shearKmh} km/h · CAPE ${fc.capeJkg} J/kg). ` : ''}
            Não substitui o briefing meteorológico oficial.
          </Typography>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
