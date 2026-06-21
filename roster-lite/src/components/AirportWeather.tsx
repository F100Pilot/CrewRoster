import { useEffect, useState } from 'react';
import { Box, CircularProgress, Tooltip, Typography } from '@mui/material';
import { fetchAirportWeather, describeWeatherCode, windCardinal, type AirportWeather as AW } from '../utils/airportWeather';

// Compact expected-weather block for one airport at a given time. Forecast only —
// shown alongside the route map; never a substitute for the official METAR/TAF.
export default function AirportWeather({
  icao, label, dateISO, timeUtc,
}: {
  icao: string | null;
  label: string;
  dateISO: string;
  timeUtc: string | null;
}) {
  const [wx, setWx] = useState<AW | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchAirportWeather(icao, dateISO, timeUtc)
      .then((w) => alive && (setWx(w), setLoading(false)))
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [icao, dateISO, timeUtc]);

  const desc = wx ? describeWeatherCode(wx.weatherCode) : null;
  const gust = wx && wx.gustKt >= wx.windKt + 8 ? ` G${wx.gustKt}` : '';

  return (
    <Box
      sx={{
        flex: 1, minWidth: 0, p: 1, borderRadius: 1.5,
        bgcolor: 'action.hover', display: 'flex', flexDirection: 'column', gap: 0.25,
      }}
    >
      <Box display="flex" alignItems="center" gap={0.75}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
          {label}
        </Typography>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {icao ?? '—'}
        </Typography>
        {timeUtc && (
          <Typography variant="caption" color="text.secondary">{timeUtc}z</Typography>
        )}
      </Box>

      {loading ? (
        <CircularProgress size={14} sx={{ my: 0.5 }} />
      ) : wx && desc ? (
        <>
          <Box display="flex" alignItems="center" gap={0.75}>
            <Typography component="span" sx={{ fontSize: 18, lineHeight: 1 }}>{desc.emoji}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{wx.tempC}°C</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>{desc.label}</Typography>
          </Box>
          <Tooltip title={`Vento ${wx.windDir}° (${windCardinal(wx.windDir)}) ${wx.windKt}kt${gust ? `, rajadas ${wx.gustKt}kt` : ''}`}>
            <Typography variant="caption" color="text.secondary" noWrap>
              💨 {windCardinal(wx.windDir)} {wx.windKt}{gust}kt
              {wx.visibilityKm !== null && wx.visibilityKm < 10 ? ` · vis ${wx.visibilityKm}km` : ''}
              {wx.precipMm >= 0.1 ? ` · ${wx.precipMm.toFixed(1)}mm` : ''}
            </Typography>
          </Tooltip>
        </>
      ) : (
        <Typography variant="caption" color="text.secondary">
          Previsão indisponível (&gt;16 dias ou aeroporto desconhecido).
        </Typography>
      )}
    </Box>
  );
}
