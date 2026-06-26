import { Fragment, useCallback, useEffect, useState } from 'react';
import { Box, CircularProgress, Link, Typography } from '@mui/material';
import { LocalParking } from '@mui/icons-material';
import { fetchFlicStands, flicEnabled, flicLegsFor, type FlicLeg, type FlicStandInfo } from '../domain/flic';

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// One minimal stand card: just the parking icon and the stand number, side by side, sized to
// line up with the sunrise/sunset cards. Tapping it re-fetches (stands change). The flight's
// status/times live on the board itself — here we keep it to the essential: which stand.
function StandCard({
  leg,
  info,
  onRefresh,
}: {
  leg: FlicLeg;
  info: FlicStandInfo | null;
  onRefresh: () => void;
}) {
  return (
    <Box
      onClick={onRefresh}
      title={`${leg.kind === 'dep' ? 'Partida' : 'Chegada'} ${leg.hub} — toque para atualizar`}
      sx={{
        px: 1.5,
        py: 0.5,
        borderRadius: 2,
        bgcolor: 'action.hover',
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        cursor: 'pointer',
        minHeight: 44,
      }}
    >
      <LocalParking sx={{ fontSize: 20, color: 'text.secondary' }} />
      {info?.found && info.stand ? (
        <Typography variant="h6" fontWeight={800} lineHeight={1}>
          {info.stand}
        </Typography>
      ) : info?.found ? (
        <Typography variant="body2" color="text.secondary">
          n/d
        </Typography>
      ) : info ? (
        <Link href={leg.boardUrl} target="_blank" rel="noopener" variant="body2" onClick={(e) => e.stopPropagation()}>
          n/d
        </Link>
      ) : (
        <CircularProgress size={16} />
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
  const isToday = date === todayISO();
  const legs = flicLegsFor(dep, arr);

  const load = useCallback((force = false) => {
    if (!flicEnabled() || !isToday || legs.length === 0) return;
    fetchFlicStands(flightNumber, dep, arr, { force }).then((r) => setResults(r));
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
        <StandCard key={leg.boardId} leg={leg} info={infoFor(leg)} onRefresh={() => load(true)} />
      ))}
    </Fragment>
  );
}
