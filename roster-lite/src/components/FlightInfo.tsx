import { useCallback, useEffect, useState } from 'react';
import { Box, Chip, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import { AirplaneTicket, Refresh } from '@mui/icons-material';
import { fetchFlightInfo, type FlightInfo as FlightInfoData } from '../services/crewlinkApi';
import type { ParsedDuty } from '../domain/types';

// Colour the operational status so cancellations/diversions stand out at a glance.
function statusColor(status: string | null): string {
  const s = (status ?? '').toLowerCase();
  if (/cancel|divert/.test(s)) return '#c62828';
  if (/arriv|depart|enroute|landed/.test(s)) return '#2e7d32';
  if (/delay/.test(s)) return '#ed6c02';
  return '#5c6bc0';
}

// Pick the leg that matches this duty's route (same number can fly several sectors on a
// day); fall back to the departure match, then the first leg.
function matchLeg(flights: FlightInfoData[], dep: string | null, arr: string | null): FlightInfoData | null {
  if (flights.length === 0) return null;
  return (
    flights.find((f) => f.departure.iata === dep && f.arrival.iata === arr) ??
    flights.find((f) => f.departure.iata === dep) ??
    flights[0]
  );
}

// Live operational data for a flight — aircraft registration, terminal/gate and status —
// pulled from AeroDataBox through the proxy. It refreshes every time the day is opened
// (no API caching) and offers a manual refresh. Silent when the feature isn't configured
// or there's simply no data yet (normal for flights not near their date).
export default function FlightInfo({ duty, date }: { duty: ParsedDuty; date: string }) {
  const [leg, setLeg] = useState<FlightInfoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const flightNumber = duty.flightNumber;

  const load = useCallback(() => {
    if (!flightNumber) return;
    setLoading(true);
    fetchFlightInfo(flightNumber, date)
      .then((r) => {
        setConfigured(r.configured);
        setLeg(matchLeg(r.flights, duty.departureAirport, duty.arrivalAirport));
      })
      .catch(() => setLeg(null))
      .finally(() => setLoading(false));
  }, [flightNumber, date, duty.departureAirport, duty.arrivalAirport]);

  useEffect(() => { load(); }, [load]);

  // Feature off (no API key) → render nothing, so the banner stays clean.
  if (!configured) return null;

  return (
    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider' }}>
      <Box display="flex" alignItems="center" gap={0.75} mb={0.5}>
        <AirplaneTicket fontSize="small" sx={{ color: 'text.secondary' }} />
        <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
          Aeronave e portas
        </Typography>
        {loading ? (
          <CircularProgress size={14} />
        ) : (
          <Tooltip title="Atualizar">
            <IconButton size="small" onClick={load} sx={{ p: 0.25 }}>
              <Refresh sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {!loading && !leg && (
        <Typography variant="caption" color="text.secondary">
          Sem dados ainda (ficam disponíveis perto do voo).
        </Typography>
      )}

      {leg && (
        <>
          <Box display="flex" alignItems="center" gap={1} flexWrap="wrap" mb={0.5}>
            {leg.reg ? (
              <Chip size="small" label={leg.reg} sx={{ fontWeight: 700 }} />
            ) : (
              <Chip size="small" variant="outlined" label="Matrícula —" />
            )}
            {leg.model && (
              <Typography variant="caption" color="text.secondary">{leg.model}</Typography>
            )}
            <Box flexGrow={1} />
            {leg.status && (
              <Chip
                size="small"
                label={leg.status}
                sx={{ bgcolor: statusColor(leg.status), color: '#fff', fontWeight: 600 }}
              />
            )}
          </Box>
          <Box display="flex" justifyContent="space-between" gap={2}>
            <GateBox label={leg.departure.iata ?? duty.departureAirport} side={leg.departure} />
            <GateBox label={leg.arrival.iata ?? duty.arrivalAirport} side={leg.arrival} align="right" />
          </Box>
          <Typography variant="caption" color="text.secondary" display="block" mt={0.75}>
            Dados operacionais (AeroDataBox). O estacionamento (stand) pode não estar disponível.
          </Typography>
        </>
      )}
    </Box>
  );
}

function GateBox({
  label,
  side,
  align = 'left',
}: {
  label: string | null;
  side: { terminal: string | null; gate: string | null };
  align?: 'left' | 'right';
}) {
  const parts = [
    side.terminal ? `T${side.terminal}` : null,
    side.gate ? `Porta ${side.gate}` : null,
  ].filter(Boolean);
  return (
    <Box textAlign={align}>
      <Typography variant="subtitle2" fontWeight={700}>{label ?? '—'}</Typography>
      <Typography variant="body2" color={parts.length ? 'text.primary' : 'text.secondary'}>
        {parts.length ? parts.join(' · ') : 'porta —'}
      </Typography>
    </Box>
  );
}
