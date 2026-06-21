import { useEffect, useState } from 'react';
import { Box, Chip, CircularProgress, Typography } from '@mui/material';
import { Air } from '@mui/icons-material';
import { fetchTurbulence, windyEmbedUrl, type TurbulenceForecast, type TurbulenceLevel } from '../utils/turbulence';
import AirportWeather from './AirportWeather';
import type { ParsedDuty } from '../domain/types';

const LEVEL: Record<TurbulenceLevel, { label: string; color: string }> = {
  low: { label: 'Turbulência baixa', color: '#2e7d32' },
  moderate: { label: 'Turbulência moderada', color: '#ed6c02' },
  high: { label: 'Turbulência elevada', color: '#c62828' },
};

// Route weather for a single flight duty: an embedded Windy map (wind at ~FL300)
// plus a coarse turbulence-risk estimate. Both are best-effort and clearly labelled
// as estimates — they never replace the official meteo briefing.
export default function FlightWeather({ duty, date }: { duty: ParsedDuty; date: string }) {
  const mapUrl = windyEmbedUrl(duty.departureAirport, duty.arrivalAirport);
  const [fc, setFc] = useState<TurbulenceForecast | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchTurbulence(duty.departureAirport, duty.arrivalAirport, date, duty.departureTime, duty.arrivalTime)
      .then((f) => alive && (setFc(f), setLoading(false)))
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [duty.departureAirport, duty.arrivalAirport, date, duty.departureTime, duty.arrivalTime]);

  // Unknown airports — we can't centre a map or sample weather, so show nothing.
  if (!mapUrl) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <Box display="flex" alignItems="center" gap={1} mb={1} flexWrap="wrap">
        <Air fontSize="small" color="action" />
        <Typography variant="subtitle2">Meteo da rota</Typography>
        {loading ? (
          <CircularProgress size={14} />
        ) : fc ? (
          <Chip
            size="small"
            label={LEVEL[fc.level].label}
            sx={{ bgcolor: LEVEL[fc.level].color, color: '#fff', fontWeight: 600 }}
          />
        ) : (
          <Chip size="small" variant="outlined" label="Estimativa indisponível" />
        )}
      </Box>

      {/* Expected surface weather at each airport, at its scheduled time. */}
      <Box display="flex" gap={1} mb={1} flexWrap="wrap">
        <AirportWeather icao={duty.departureAirport} label="Partida" dateISO={date} timeUtc={duty.departureTime} />
        <AirportWeather icao={duty.arrivalAirport} label="Chegada" dateISO={date} timeUtc={duty.arrivalTime} />
      </Box>

      <Box sx={{ borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
        <iframe
          title="Mapa meteorológico da rota"
          src={mapUrl}
          width="100%"
          height="240"
          loading="lazy"
          style={{ display: 'block', border: 0 }}
        />
      </Box>

      <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
        {fc
          ? `Estimativa a ~FL340 (shear ${fc.shearKmh} km/h · CAPE ${fc.capeJkg} J/kg). `
          : ''}
        Não substitui o briefing meteorológico oficial.
      </Typography>
    </Box>
  );
}
