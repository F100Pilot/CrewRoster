import { useCallback, useEffect, useState } from 'react';
import { Box, Chip, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import { AirplaneTicket, Refresh } from '@mui/icons-material';
import { fetchFlightInfo, type FlightInfo as FlightInfoData } from '../services/crewlinkApi';
import { matchLeg, recordReg, regMapKey, resolveRegs } from '../domain/aircraftRegs';
import { loadRegs } from '../storage/rosterStore';
import { useRoster } from '../state/useRoster';
import type { AircraftReg, ParsedDuty } from '../domain/types';

// Colour the operational status so cancellations/diversions stand out at a glance.
function statusColor(status: string | null): string {
  const s = (status ?? '').toLowerCase();
  if (/cancel|divert/.test(s)) return '#c62828';
  if (/arriv|depart|enroute|landed/.test(s)) return '#2e7d32';
  if (/delay/.test(s)) return '#ed6c02';
  return '#5c6bc0';
}

// Live operational data for a flight — aircraft registration, terminal/gate and status —
// pulled from AeroDataBox through the proxy. It refreshes every time the day is opened
// (no API caching) and offers a manual refresh. A successful registration lookup is
// saved to the logbook store. Silent when the feature isn't configured or there's simply
// no data yet (normal for flights not near their date).
export default function FlightInfo({ duty, date }: { duty: ParsedDuty; date: string }) {
  const { activeUser, roster } = useRoster();
  const [leg, setLeg] = useState<FlightInfoData | null>(null);
  const [savedReg, setSavedReg] = useState<string | null>(null);
  const [savedRegInferred, setSavedRegInferred] = useState(false);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const flightNumber = duty.flightNumber;
  const dep = duty.departureAirport;
  const arr = duty.arrivalAirport;
  const userId = activeUser?.id;
  const duties = roster?.duties;

  // Show any previously-recorded registration immediately (even with no live data),
  // resolving across the day's rotation so a tail captured on the sibling leg shows here
  // too (same airframe). Inferred tails are flagged.
  useEffect(() => {
    let alive = true;
    if (!userId || !flightNumber) return;
    loadRegs(userId).then((regs) => {
      if (!alive) return;
      const confirmed = new Map<string, AircraftReg>(
        regs.map((r) => [regMapKey(r.date, r.flightNumber, r.dep, r.arr), r]),
      );
      const hit = resolveRegs(duties ?? [], confirmed).get(regMapKey(date, flightNumber, dep, arr));
      setSavedReg(hit?.reg ?? null);
      setSavedRegInferred(hit?.inferred ?? false);
    });
    return () => { alive = false; };
  }, [userId, flightNumber, date, dep, arr, duties]);

  const load = useCallback(() => {
    if (!flightNumber) return;
    setLoading(true);
    fetchFlightInfo(flightNumber, date)
      .then((r) => {
        setConfigured(r.configured);
        const m = matchLeg(r.flights, dep, arr);
        setLeg(m);
        if (m?.reg && userId) {
          recordReg(userId, { date, flightNumber, departureAirport: dep, arrivalAirport: arr }, m)
            .then(() => setSavedReg(m.reg));
        }
      })
      .catch(() => setLeg(null))
      .finally(() => setLoading(false));
  }, [flightNumber, date, dep, arr, userId]);

  useEffect(() => { load(); }, [load]);

  // Re-fetch when the AeroDataBox key is added/changed in Settings while this day is open.
  useEffect(() => {
    window.addEventListener('aerodatabox-key-changed', load);
    return () => window.removeEventListener('aerodatabox-key-changed', load);
  }, [load]);

  // Feature off (no API key) → render nothing, so the banner stays clean.
  // Feature off and nothing recorded → stay out of the way entirely.
  if (!configured && !savedReg) return null;

  return (
    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider' }}>
      <Box display="flex" alignItems="center" gap={0.75} mb={0.5}>
        <AirplaneTicket fontSize="small" sx={{ color: 'text.secondary' }} />
        <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
          Aeronave e portas
        </Typography>
        {loading ? (
          <CircularProgress size={14} />
        ) : configured ? (
          <Tooltip title="Atualizar">
            <IconButton size="small" onClick={load} sx={{ p: 0.25 }}>
              <Refresh sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        ) : null}
      </Box>

      {/* No live leg but we have the tail (recorded, or inferred from the day's rotation). */}
      {!leg && savedReg && (
        <Chip size="small" label={savedReg + (savedRegInferred ? ' *' : '')} sx={{ fontWeight: 700 }} />
      )}

      {!loading && !leg && !savedReg && (
        <Typography variant="caption" color="text.secondary">
          Sem dados ainda (ficam disponíveis perto do voo).
        </Typography>
      )}

      {leg && (
        <>
          <Box display="flex" alignItems="center" gap={1} flexWrap="wrap" mb={0.5}>
            {leg.reg ? (
              <Chip size="small" label={leg.reg} sx={{ fontWeight: 700 }} />
            ) : savedReg ? (
              // This leg's own lookup had no tail, but the rotation sibling did.
              <Chip size="small" label={savedReg + (savedRegInferred ? ' *' : '')} sx={{ fontWeight: 700 }} />
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
            {((!leg.reg && savedReg && savedRegInferred)) && ' Matrícula (*) inferida da rotação do dia.'}
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
