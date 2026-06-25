import { Fragment, useCallback, useEffect, useState } from 'react';
import { Box, Chip, CircularProgress, IconButton, Link, Typography } from '@mui/material';
import { Refresh, OpenInNew, LocalParking } from '@mui/icons-material';
import { fetchFlicStands, flicEnabled, flicLegsFor, type FlicLeg, type FlicStandInfo } from '../domain/flic';

// Colour the operational status the way the FLIC board does (green = gone/arrived, blue =
// boarding, red = delayed/cancelled), so a glance conveys the state.
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

// One compact stand card, styled to line up beside the sunrise/sunset cards in the same row.
function StandCard({
  leg,
  info,
  loading,
  onRefresh,
}: {
  leg: FlicLeg;
  info: FlicStandInfo | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const dep = leg.kind === 'dep';
  return (
    <Box sx={{ px: 1.25, py: 0.5, borderRadius: 2, bgcolor: 'action.hover', textAlign: 'center', minWidth: 118 }}>
      <Box display="flex" alignItems="center" justifyContent="center" gap={0.25}>
        <LocalParking sx={{ fontSize: 14, color: 'text.secondary' }} />
        <Typography variant="caption" fontWeight={700}>
          {dep ? 'Partida' : 'Chegada'} {leg.hub}
        </Typography>
        <IconButton size="small" onClick={onRefresh} disabled={loading} sx={{ p: 0 }} aria-label="Atualizar stand">
          {loading ? <CircularProgress size={11} /> : <Refresh sx={{ fontSize: 13 }} />}
        </IconButton>
      </Box>

      {info?.found && info.stand ? (
        <Typography variant="h6" fontWeight={800} lineHeight={1.15}>
          {info.stand}
        </Typography>
      ) : info?.found ? (
        <Typography variant="caption" color="text.secondary" display="block">
          stand n/d
        </Typography>
      ) : info ? (
        <Link
          href={leg.boardUrl}
          target="_blank"
          rel="noopener"
          variant="caption"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}
        >
          n/d <OpenInNew sx={{ fontSize: 11 }} />
        </Link>
      ) : (
        <CircularProgress size={14} sx={{ my: 0.25 }} />
      )}

      {info?.found && info.status && (
        <Chip
          size="small"
          label={info.status}
          sx={{ height: 16, fontSize: 9.5, fontWeight: 700, color: '#fff', bgcolor: statusColor(info.status), '& .MuiChip-label': { px: 0.75 } }}
        />
      )}

      {info?.found && (info.act || info.est || info.sched) && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 10, lineHeight: 1.3 }}>
          {dep ? 'STD' : 'STA'} {info.sched || '—'}
          {info.act ? ` · A ${info.act}` : info.est ? ` · E ${info.est}` : ''}
        </Typography>
      )}
    </Box>
  );
}

// Live stand from FLIC for a flight touching LIS/OPO. The board only carries the current
// operational window, so we only fetch on the day of the flight; on other days there is no
// stand to show and the cards stay hidden. Rendered inline beside the sunrise/sunset cards.
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
  const [results, setResults] = useState<FlicStandInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const isToday = date === todayISO();
  const legs = flicLegsFor(dep, arr);

  const load = useCallback(() => {
    if (!flicEnabled() || !isToday || legs.length === 0) return;
    setLoading(true);
    fetchFlicStands(flightNumber, dep, arr)
      .then((r) => setResults(r))
      .finally(() => setLoading(false));
    // legs is derived from dep/arr, so those deps cover it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightNumber, dep, arr, isToday]);

  useEffect(() => {
    load();
  }, [load]);

  // Nothing to show: feature off, not the flight day, or this flight doesn't touch a hub.
  if (!flicEnabled() || !isToday || legs.length === 0) return null;

  // Match each leg's result by board id (fetchFlicStands preserves leg order/ids).
  const infoFor = (leg: FlicLeg) => results?.find((r) => r.boardId === leg.boardId) ?? null;

  return (
    <Fragment>
      {legs.map((leg) => (
        <StandCard key={leg.boardId} leg={leg} info={infoFor(leg)} loading={loading} onRefresh={load} />
      ))}
    </Fragment>
  );
}
