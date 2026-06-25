import { useEffect, useState } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import { fetchAirportWx, categoryColor, type AirportWx } from '../services/metarTaf';

function AirportBlock({ iata, label }: { iata: string | null; label: string }) {
  const [wx, setWx] = useState<AirportWx | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchAirportWx(iata).then((w) => { if (alive) { setWx(w); setLoaded(true); } });
    return () => { alive = false; };
  }, [iata]);
  if (!loaded || !wx) return null;
  return (
    <Box sx={{ mb: 1 }}>
      <Box display="flex" alignItems="center" gap={1} mb={0.25} flexWrap="wrap">
        <Typography variant="subtitle2">{label} · {iata} ({wx.icao})</Typography>
        {wx.category && (
          <Chip size="small" label={wx.category} sx={{ bgcolor: categoryColor(wx.category), color: '#fff', fontWeight: 600 }} />
        )}
      </Box>
      {wx.metarRaw && (
        <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', wordBreak: 'break-word' }}>
          {wx.metarRaw}
        </Typography>
      )}
      {wx.tafRaw && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontFamily: 'monospace', wordBreak: 'break-word', mt: 0.25 }}>
          {wx.tafRaw}
        </Typography>
      )}
    </Box>
  );
}

// METAR/TAF for the flight's airports (via the worker → NOAA AWC). Renders nothing until data
// arrives, so it's silent when the proxy/endpoint isn't available.
export default function MetarTaf({ dep, arr }: { dep: string | null; arr: string | null }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <AirportBlock iata={dep} label="Partida" />
      <AirportBlock iata={arr} label="Chegada" />
    </Box>
  );
}
