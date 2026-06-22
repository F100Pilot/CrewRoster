import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, Divider, IconButton, InputAdornment,
  Popover, Stack, TextField, Typography,
} from '@mui/material';
import {
  ChevronLeft, ChevronRight, Login, Today, InfoOutlined,
  EditCalendar, Search, Clear,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { addMonths, format, isSameMonth, parseISO, subMonths } from 'date-fns';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import UploadDropzone from '../components/UploadDropzone';
import DutyChip from '../components/DutyChip';
import NextDutyCard from '../components/NextDutyCard';
import MonthStatsCard from '../components/MonthStatsCard';
import FtlCard from '../components/FtlCard';
import { autoCaptureRecent } from '../domain/aircraftRegs';
import { getAeroDataBoxKey } from '../storage/settings';
import { toLocalTime } from '../utils/localTime';
import type { ParsedDuty, ChangeType } from '../domain/types';

const CHANGE_STYLE: Record<ChangeType, { color: string; label: string }> = {
  added: { color: '#2e7d32', label: 'Novo' },
  modified: { color: '#ed6c02', label: 'Alterado' },
  removed: { color: '#c62828', label: 'Removido' },
};

// Tier 2 — coarse buckets the list can be filtered by.
type Filter = 'all' | 'flights' | 'standby' | 'off';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tudo' },
  { key: 'flights', label: 'Voos' },
  { key: 'standby', label: 'Standby' },
  { key: 'off', label: 'Folgas' },
];

// Tracks which users have an auto-capture run in flight, so a quick remount can't fire a
// second one before the first resolves (module-level: survives component remounts).
const autoRegInFlight = new Set<string>();

function matchesFilter(d: ParsedDuty, f: Filter): boolean {
  switch (f) {
    case 'flights':
      return d.dutyType === 'Flight Duty' || d.dutyType === 'Positioning';
    case 'standby':
      return d.dutyType.startsWith('Standby') || d.dutyType === 'Reserve';
    case 'off':
      return d.dutyType === 'Day Off' || d.dutyType === 'Vacation';
    default:
      return true;
  }
}

// Free-text search over the fields a crew member looks things up by: destination/
// origin airport, flight number, aircraft type, and the raw duty code.
function matchesQuery(d: ParsedDuty, q: string): boolean {
  if (!q) return true;
  const hay = [
    d.flightNumber, d.departureAirport, d.arrivalAirport, d.aircraftType, d.dutyCode,
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
  return hay.includes(q.toUpperCase());
}

export default function RosterPage() {
  const { roster, loading, warnings, error, dismissChanges, activeUser } = useRoster();
  const navigate = useNavigate();
  const location = useLocation();
  // Restore the month the user was viewing when they return from a day detail page.
  const [month, setMonth] = useState<Date>(() => {
    const s = (location.state as { month?: string } | null)?.month;
    return s ? parseISO(s) : new Date();
  });
  const [infoAnchor, setInfoAnchor] = useState<null | HTMLElement>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const todayISO = format(new Date(), 'yyyy-MM-dd');

  const changeByDate = useMemo(() => {
    const map = new Map<string, ChangeType>();
    for (const c of roster?.changes ?? []) map.set(c.date, c.type);
    return map;
  }, [roster]);

  const monthDuties = useMemo(
    () => (roster ? roster.duties.filter((d) => isSameMonth(parseISO(d.date), month)) : []),
    [roster, month]
  );

  // "Going forward": once a day, silently record the registrations of recent flights (the
  // window the free API covers), so the logbook fills itself without opening each day.
  useEffect(() => {
    if (!activeUser || !roster || !getAeroDataBoxKey()) return;
    const userId = activeUser.id;
    const stampKey = `crewroster.autoreg.${userId}`;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(stampKey) === today) return;
    // Guard against duplicate concurrent runs on remount, but only mark "done for today"
    // once it actually resolves — a transient failure should be retried, not skipped.
    if (autoRegInFlight.has(userId)) return;
    autoRegInFlight.add(userId);
    autoCaptureRecent(userId, roster.duties)
      .then(() => localStorage.setItem(stampKey, today))
      .catch(() => {})
      .finally(() => autoRegInFlight.delete(userId));
  }, [activeUser, roster]);

  const dutiesByDay = useMemo(() => {
    const map = new Map<string, ParsedDuty[]>();
    for (const d of monthDuties) {
      if (!matchesFilter(d, filter)) continue;
      if (!matchesQuery(d, query)) continue;
      if (!map.has(d.date)) map.set(d.date, []);
      map.get(d.date)!.push(d);
    }
    return new Map([...map.entries()].sort());
  }, [monthDuties, filter, query]);

  if (loading) return <Typography color="text.secondary">A carregar…</Typography>;

  if (!roster) {
    return (
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <UploadDropzone />
        <Divider>
          <Typography variant="caption" color="text.secondary">ou</Typography>
        </Divider>
        <Box textAlign="center">
          <Button
            variant="outlined"
            startIcon={<Login />}
            onClick={() => navigate('/import')}
          >
            Importar escala
          </Button>
        </Box>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {warnings.map((w, i) => (
        <Alert key={i} severity="warning">
          {w}
        </Alert>
      ))}

      {roster.changes && roster.changes.length > 0 && (
        <Alert
          severity="info"
          onClose={() => dismissChanges()}
          icon={<EditCalendar fontSize="inherit" />}
        >
          <Typography variant="body2" fontWeight={600}>
            {roster.changes.length === 1
              ? '1 dia mudou desde a última escala'
              : `${roster.changes.length} dias mudaram desde a última escala`}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {roster.changes
              .map((c) => `${format(parseISO(c.date), 'dd/MM')} (${CHANGE_STYLE[c.type].label.toLowerCase()})`)
              .join(' · ')}
          </Typography>
        </Alert>
      )}

      <NextDutyCard duties={roster.duties} />

      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Box display="flex" alignItems="center" gap={1}>
          <IconButton size="small" onClick={() => setMonth((m) => subMonths(m, 1))}>
            <ChevronLeft />
          </IconButton>
          <Typography variant="h6">{format(month, 'MMMM yyyy')}</Typography>
          <IconButton size="small" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight />
          </IconButton>
        </Box>
        <Box display="flex" alignItems="center" gap={0.5}>
          <IconButton size="small" onClick={(e) => setInfoAnchor(e.currentTarget)} title="Detalhes da escala">
            <InfoOutlined fontSize="small" />
          </IconButton>
          <Popover
            open={Boolean(infoAnchor)}
            anchorEl={infoAnchor}
            onClose={() => setInfoAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <Box sx={{ p: 1.5, maxWidth: 280 }}>
              <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                {roster.fileName} · {roster.duties.length} dias · importado{' '}
                {format(parseISO(roster.importedAt), 'dd/MM/yyyy HH:mm')}
              </Typography>
            </Box>
          </Popover>
          <Button size="small" startIcon={<Today />} onClick={() => setMonth(new Date())}>
            Hoje
          </Button>
        </Box>
      </Box>

      <MonthStatsCard duties={monthDuties} />

      <FtlCard duties={roster.duties} />

      <TextField
        size="small"
        fullWidth
        placeholder="Pesquisar destino, voo, aeronave…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search fontSize="small" color="action" />
            </InputAdornment>
          ),
          endAdornment: query ? (
            <InputAdornment position="end">
              <IconButton size="small" onClick={() => setQuery('')}>
                <Clear fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : null,
        }}
      />

      <Box display="flex" gap={1} flexWrap="wrap">
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            size="small"
            color={filter === f.key ? 'primary' : 'default'}
            variant={filter === f.key ? 'filled' : 'outlined'}
            onClick={() => setFilter(f.key)}
          />
        ))}
      </Box>

      {monthDuties.length === 0 && (
        <Alert severity="info">Sem registos para este mês. Usa as setas para navegar.</Alert>
      )}
      {monthDuties.length > 0 && dutiesByDay.size === 0 && (
        <Alert severity="info">Nenhum registo corresponde ao filtro ou pesquisa.</Alert>
      )}

      {[...dutiesByDay.entries()].map(([date, duties]) => {
        const change = changeByDate.get(date);
        const isToday = date === todayISO;
        return (
        <Card
          key={date}
          variant="outlined"
          sx={{
            cursor: 'pointer',
            ...(change && {
              borderLeft: `4px solid ${CHANGE_STYLE[change].color}`,
            }),
            ...(isToday && {
              borderColor: 'primary.main',
              borderWidth: 2,
              bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
            }),
          }}
          onClick={() => navigate(`/day/${date}`, { state: { month: format(month, 'yyyy-MM-dd') } })}
        >
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
              <Box display="flex" alignItems="center" gap={1}>
                <Typography variant="subtitle2" fontWeight={isToday ? 700 : 600} color={isToday ? 'primary.main' : 'text.primary'}>
                  {format(parseISO(date), 'EEE, dd MMM')}
                </Typography>
                {isToday && (
                  <Chip
                    size="small"
                    color="primary"
                    label="Hoje"
                    sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
                  />
                )}
                {change && (
                  <Chip
                    size="small"
                    label={CHANGE_STYLE[change].label}
                    sx={{ bgcolor: CHANGE_STYLE[change].color, color: '#fff', height: 18, fontSize: '0.65rem' }}
                  />
                )}
              </Box>
              {duties[0]?.reportingTime && (() => {
                const lt = toLocalTime(date, duties[0].reportingTime, duties[0].departureAirport);
                return (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={lt ? `Apres. ${lt} LT` : `Apres. ${duties[0].reportingTime}z`}
                  />
                );
              })()}
            </Box>
            <Box display="flex" flexWrap="wrap" gap={0.5}>
              {duties.map((d, i) => (
                <DutyChip key={i} duty={d} />
              ))}
            </Box>
          </CardContent>
        </Card>
        );
      })}
    </Stack>
  );
}
