import { useCallback, useEffect, useState } from 'react';
import { Box, Chip, CircularProgress, IconButton, Link, Typography } from '@mui/material';
import { LocalParking, Refresh, OpenInNew, FlightTakeoff, FlightLand } from '@mui/icons-material';
import { fetchFlicStands, flicEnabled, type FlicStandInfo } from '../domain/flic';

// Colour the operational status the way the FLIC board does (green = gone, blue = boarding,
// red = delayed/cancelled), so a glance conveys the state.
function statusColor(s: string | null): string {
  const u = (s || '').toUpperCase();
  if (u.includes('DELAY') || u.includes('CANCEL')) return '#c62828';
  if (u.includes('BOARDING')) return '#1565c0';
  if (u.includes('DEPART') || u.includes('AIRBORNE') || u.includes('ARRIV') || u.includes('LAND')) return '#2e7d32';
  if (u) return '#5c6bc0';
  return '#757575';
}

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function StandLeg({ info }: { info: FlicStandInfo }) {
  const dep = info.kind === 'dep';
  const Icon = dep ? FlightTakeoff : FlightLand;
  const title = `${dep ? 'Partida' : 'Chegada'} ${info.hub}`;
  return (
    <Box
      sx={{
        px: 1.25,
        py: 1,
        borderRadius: 2,
        bgcolor: 'rgba(128,128,128,0.10)',
        minWidth: 140,
        textAlign: 'center',
      }}
    >
      <Box display="flex" alignItems="center" justifyContent="center" gap={0.5} mb={0.5}>
        <Icon sx={{ fontSize: 16, color: 'text.secondary' }} />
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          {title}
        </Typography>
      </Box>

      {info.found && info.stand ? (
        <Typography variant="h5" fontWeight={800} lineHeight={1.1}>
          {info.stand}
        </Typography>
      ) : info.found ? (
        <Typography variant="body2" color="text.secondary">
          Stand por atribuir
        </Typography>
      ) : (
        <Typography variant="caption" color="text.secondary">
          Ainda não publicado
        </Typography>
      )}

      {info.found && info.status && (
        <Chip
          size="small"
          label={info.status}
          sx={{ mt: 0.5, height: 18, fontSize: 10, fontWeight: 700, color: '#fff', bgcolor: statusColor(info.status) }}
        />
      )}

      {info.found && (info.act || info.est || info.sched) && (
        <Typography variant="caption" color="text.secondary" display="block" mt={0.25}>
          {dep ? 'STD' : 'STA'} {info.sched || '—'}
          {info.act ? ` · A ${info.act}` : info.est ? ` · E ${info.est}` : ''} UTC
        </Typography>
      )}

      {!info.found && (
        <Link
          href={info.boardUrl}
          target="_blank"
          rel="noopener"
          variant="caption"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, mt: 0.25 }}
        >
          Abrir board <OpenInNew sx={{ fontSize: 12 }} />
        </Link>
      )}
    </Box>
  );
}

// Live stand from FLIC for a flight touching LIS/OPO. The board only carries the current
// operational window, so we only fetch on the day of the flight; on other days there is no
// stand to show and the section stays hidden.
export default function FlicStand({
  flightNumber,
  dep,
  arr,
  date,
}: {
  flightNumber: string | null;
  dep: string | null;
  arr: string | null;
  date: string | null;
}) {
  const [legs, setLegs] = useState<FlicStandInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const isToday = date === todayISO();

  const load = useCallback(() => {
    if (!flicEnabled() || !isToday) return;
    setLoading(true);
    fetchFlicStands(flightNumber, dep, arr)
      .then((r) => setLegs(r))
      .finally(() => setLoading(false));
  }, [flightNumber, dep, arr, isToday]);

  useEffect(() => {
    load();
  }, [load]);

  // Nothing to show: feature off, not the flight day, or this flight doesn't touch a hub.
  if (!flicEnabled() || !isToday || (legs && legs.length === 0)) return null;

  const updated = legs?.find((l) => l.updated)?.updated || null;

  return (
    <Box sx={{ mt: 1.25 }}>
      <Box display="flex" alignItems="center" justifyContent="center" gap={0.5} mb={0.5}>
        <LocalParking sx={{ fontSize: 16, color: 'text.secondary' }} />
        <Typography variant="caption" color="text.secondary">
          Stand (FLIC TAP)
        </Typography>
        <IconButton size="small" onClick={load} disabled={loading} sx={{ p: 0.25 }} aria-label="Atualizar stand">
          {loading ? <CircularProgress size={12} /> : <Refresh sx={{ fontSize: 14 }} />}
        </IconButton>
      </Box>

      {legs && legs.length > 0 ? (
        <Box display="flex" gap={1} justifyContent="center" flexWrap="wrap">
          {legs.map((l) => (
            <StandLeg key={l.boardId} info={l} />
          ))}
        </Box>
      ) : loading ? (
        <Typography variant="caption" color="text.secondary" align="center" display="block">
          A obter stand…
        </Typography>
      ) : null}

      {updated && (
        <Typography variant="caption" color="text.secondary" display="block" align="center" mt={0.25} sx={{ opacity: 0.7 }}>
          Fonte: FLIC TAP · {updated}
        </Typography>
      )}
    </Box>
  );
}
