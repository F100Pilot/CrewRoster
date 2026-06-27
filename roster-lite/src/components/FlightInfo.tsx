import { useCallback, useEffect, useState } from 'react';
import { Box, Chip, CircularProgress, IconButton, List, ListItem, ListItemButton, ListItemText, Popover, Tooltip, Typography } from '@mui/material';
import { AirplaneTicket, Groups, Refresh } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { fetchFlightInfo, type FlightInfo as FlightInfoData } from '../services/crewlinkApi';
import { matchLeg, recordReg, recordRegValue, regMapKey, resolveRegs } from '../domain/aircraftRegs';
import { fetchFlicReg } from '../domain/flic';
import { loadRegs } from '../storage/rosterStore';
import { utcDateTime } from '../utils/duration';
import { useRoster } from '../state/useRoster';
import type { AircraftReg, ParsedDuty } from '../domain/types';

// Friendly labels for the crew roles printed in the PDF.
const ROLE_LABEL: Record<string, string> = { CP: 'Comandante', FO: 'Oficial Piloto', PU: 'Chefe de Cabine', ST: 'Tripulante' };
const ROLE_SHORT: Record<string, string> = { CP: 'CMD', FO: 'OPL', PU: 'CC', ST: 'TC' };

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
  const navigate = useNavigate();
  const [leg, setLeg] = useState<FlightInfoData | null>(null);
  const [savedReg, setSavedReg] = useState<string | null>(null);
  const [savedRegInferred, setSavedRegInferred] = useState(false);
  // Registration scraped from the FLIC board — the most current source on the day of the flight.
  const [flicReg, setFlicReg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [crewAnchor, setCrewAnchor] = useState<HTMLElement | null>(null);
  // The rostered crew, minus the user themselves — they already know they're on the flight.
  // Matched by the user's own crew code (login); when it isn't set, show everyone.
  const myCode = activeUser?.crewCode?.trim().toUpperCase() || null;
  const crew = (duty.crew ?? []).filter((c) => !myCode || c.login.toUpperCase() !== myCode);
  // Full-crew composition (INCLUDING the user) so the count and categories can be verified at
  // a glance against the official roster — e.g. "5 · 2 CMD · 1 CC · 2 TC".
  const composition = (['CP', 'FO', 'PU', 'ST'] as const)
    .map((r) => ({ r, n: (duty.crew ?? []).filter((c) => c.role === r).length }))
    .filter((x) => x.n > 0);
  const flightNumber = duty.flightNumber;
  const dep = duty.departureAirport;
  const arr = duty.arrivalAirport;
  const userId = activeUser?.id;
  const duties = roster?.duties;
  // FLIC only carries the current operational window, so its tail is only meaningful on the day.
  const isToday = (() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return date === `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  })();

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
        const m = matchLeg(r.flights, dep, arr, date);
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

  // On the day of the flight, take the registration from the FLIC board — it's the operational
  // source and the most current (it reflects last-minute aircraft swaps before AeroDataBox does,
  // and works with no API key). Record it to the logbook store too.
  useEffect(() => {
    let alive = true;
    if (!isToday || !flightNumber) return;
    fetchFlicReg(flightNumber, dep, arr).then((r) => {
      if (!alive || !r) return;
      setFlicReg(r.reg);
      if (userId) {
        recordRegValue(userId, { date, flightNumber, departureAirport: dep, arrivalAirport: arr }, r.reg, r.eqt)
          .then(() => { if (alive) setSavedReg((prev) => prev ?? r.reg); });
      }
    });
    return () => { alive = false; };
  }, [isToday, flightNumber, dep, arr, date, userId]);

  // Feature off (no API key) and nothing recorded → stay out of the way, UNLESS there's
  // crew to show (the crew "i" lives in this banner) or a FLIC tail for today.
  if (!configured && !savedReg && !flicReg && !crew.length) return null;

  // The tail to show: FLIC wins on the day (most current), then a live AeroDataBox leg, then a
  // previously-recorded/inferred tail.
  const displayReg = flicReg ?? leg?.reg ?? savedReg ?? null;
  const displayRegInferred = !flicReg && !leg?.reg && savedRegInferred;

  // A flight that hasn't reached its scheduled departure can't have departed/arrived. AeroDataBox
  // sometimes returns a stale (previous-day) operation, so suppress impossible "completed" states
  // until the flight is actually due.
  const stdUtc = duty.departureTime ? utcDateTime(date, duty.departureTime) : null;
  const notDepartedYet = stdUtc ? Date.now() < stdUtc.getTime() : false;
  const COMPLETED_STATUS = /arriv|depart|land|en[\s-]?route|airborne|in\s*air|active/i;
  const showLegStatus = !!leg?.status && !(notDepartedYet && COMPLETED_STATUS.test(leg.status));

  // Whether the matched leg actually carries something worth showing. AeroDataBox can return a
  // bare scheduled record (no tail, no gate, status suppressed) for a flight whose aircraft isn't
  // assigned yet — render the clean "no data yet" line for that, not an empty block of dashes.
  const legHasData =
    !!leg &&
    (!!leg.reg || showLegStatus ||
      !!leg.departure.terminal || !!leg.departure.gate ||
      !!leg.arrival.terminal || !!leg.arrival.gate);

  return (
    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider' }}>
      <Box display="flex" alignItems="center" gap={0.75} mb={0.5}>
        <AirplaneTicket fontSize="small" sx={{ color: 'text.secondary' }} />
        <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
          Aeronave e portas
        </Typography>
        {crew.length > 0 && (
          <Tooltip title="Tripulação">
            <IconButton size="small" onClick={(e) => setCrewAnchor(e.currentTarget)} sx={{ p: 0.25 }} aria-label="Ver tripulação">
              <Groups sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        )}
        {loading ? (
          <CircularProgress size={14} />
        ) : (
          <Tooltip title="Atualizar dados do voo">
            <IconButton size="small" onClick={load} sx={{ p: 0.25 }}>
              <Refresh sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Crew pop-up, opened from the "i" above. */}
      <Popover
        open={!!crewAnchor}
        anchorEl={crewAnchor}
        onClose={() => setCrewAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ px: 1.5, pt: 1, pb: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Groups fontSize="small" color="action" />
            <Typography variant="subtitle2">Tripulação</Typography>
          </Box>
          {composition.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
              {(duty.crew?.length ?? 0)} tripulantes · {composition.map(({ r, n }) => `${n} ${ROLE_SHORT[r] ?? r}`).join(' · ')}
            </Typography>
          )}
        </Box>
        <List dense sx={{ pt: 0, minWidth: 200 }}>
          {crew.map((c) => (
            <ListItem
              key={c.login}
              disablePadding
              secondaryAction={<Chip size="small" variant="outlined" label={ROLE_SHORT[c.role] ?? c.role} />}
            >
              <ListItemButton sx={{ py: 0.1 }} onClick={() => { setCrewAnchor(null); navigate(`/crew/${c.login}`); }}>
                <ListItemText
                  primary={c.login}
                  secondary={`${ROLE_LABEL[c.role] ?? c.role}${c.surname ? ' · ' + c.surname : ''}`}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: 700, sx: { fontFamily: 'monospace' } }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Popover>

      {/* No operational leg data, but we have a tail (FLIC today, recorded, or inferred). */}
      {!legHasData && displayReg && (
        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
          <Chip size="small" label={displayReg + (displayRegInferred ? ' *' : '')} sx={{ fontWeight: 700 }} />
          {flicReg && <Typography variant="caption" color="text.secondary">via FLIC (atualizada no dia)</Typography>}
        </Box>
      )}

      {!loading && !legHasData && !displayReg && (
        <Typography variant="caption" color="text.secondary">
          Sem dados ainda (ficam disponíveis perto do voo).
        </Typography>
      )}

      {legHasData && leg && (
        <>
          <Box display="flex" alignItems="center" gap={1} flexWrap="wrap" mb={0.5}>
            {displayReg ? (
              <Chip size="small" label={displayReg + (displayRegInferred ? ' *' : '')} sx={{ fontWeight: 700 }} />
            ) : (
              <Chip size="small" variant="outlined" label="Matrícula —" />
            )}
            {leg.model && (
              <Typography variant="caption" color="text.secondary">{leg.model}</Typography>
            )}
            <Box flexGrow={1} />
            {showLegStatus && leg.status && (
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
            {flicReg && ' Matrícula via FLIC (atualizada no dia).'}
            {!flicReg && !leg.reg && savedReg && savedRegInferred && ' Matrícula (*) inferida da rotação do dia.'}
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
