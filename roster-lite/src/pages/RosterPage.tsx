import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, IconButton, InputAdornment,
  Popover, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import {
  ChevronLeft, ChevronRight, Login, Today, InfoOutlined,
  EditCalendar, Search, Clear, ViewAgenda, DepartureBoard as BoardIcon,
} from '@mui/icons-material';
import { addMonths, format, isSameMonth, parseISO, subMonths } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { useViewedMonth } from '../state/viewedMonth';
import UploadDropzone from '../components/UploadDropzone';
import DepartureBoard from '../components/DepartureBoard';
import MonthStatsCard from '../components/MonthStatsCard';
import LimitsSummaryCard from '../components/LimitsSummaryCard';
import DocumentAlertCard from '../components/DocumentAlertCard';
import { autoCaptureRecent } from '../domain/aircraftRegs';
import { getAeroDataBoxKey } from '../storage/settings';
import type { ParsedDuty, ChangeType } from '../domain/types';
import { todayISO } from '../domain/rosterWindow';
import { monthLabel } from '../utils/dates';
import PageHero from '../components/PageHero';
import DayPass, { CHANGE_STYLE } from '../components/DayPass';
import { baseOf } from '../domain/dutyStats';



// Tier 2 — coarse buckets the list can be filtered by.
type Filter = 'all' | 'flights' | 'standby' | 'off';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tudo' },
  { key: 'flights', label: 'Voos' },
  { key: 'standby', label: 'Standby' },
  { key: 'off', label: 'Folgas' },
];

// The list as cards (default) or as a departures board; remembered on this device.
type ListView = 'cards' | 'board';
const VIEW_KEY = 'crewroster.listView';
function readView(): ListView {
  try { return localStorage.getItem(VIEW_KEY) === 'board' ? 'board' : 'cards'; } catch { return 'cards'; }
}

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
  const [month, setMonth] = useViewedMonth();
  const [infoAnchor, setInfoAnchor] = useState<null | HTMLElement>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ListView>(readView);
  const chooseView = (v: ListView) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* not remembered — harmless */ }
  };
  const today = todayISO();

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
    if (localStorage.getItem(stampKey) === today) return;
    // Guard against duplicate concurrent runs on remount, but only mark "done for today"
    // once it actually resolves — a transient failure should be retried, not skipped.
    if (autoRegInFlight.has(userId)) return;
    autoRegInFlight.add(userId);
    autoCaptureRecent(userId, roster.duties)
      .then(() => localStorage.setItem(stampKey, today))
      .catch(() => {})
      .finally(() => autoRegInFlight.delete(userId));
  }, [activeUser, roster, today]);

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
      <PageHero
        label="Escala"
        title={monthLabel(month)}
        subtitle={`${monthDuties.length ? new Set(monthDuties.map((d) => d.date)).size : 0} dias na escala`}
        actions={
          <>
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
            <Button size="small" variant="outlined" startIcon={<Today />} onClick={() => setMonth(new Date())}>Hoje</Button>
          </>
        }
      >
        <Box display="flex" gap={1} mt={1}>
          <IconButton size="small" onClick={() => setMonth((m) => subMonths(m, 1))} aria-label="Mês anterior" sx={{ bgcolor: 'rgba(255,255,255,0.12)' }}>
            <ChevronLeft />
          </IconButton>
          <IconButton size="small" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Mês seguinte" sx={{ bgcolor: 'rgba(255,255,255,0.12)' }}>
            <ChevronRight />
          </IconButton>
        </Box>
      </PageHero>

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

      <MonthStatsCard duties={monthDuties} />

      {/* Status lines: a document about to expire (only when one is — Documents is a pilot
          page), then the limits summary. */}
      {activeUser && activeUser.role !== 'cabin' && <DocumentAlertCard userId={activeUser.id} />}

      {/* Limits and the agreement checks live on their own page; one line here leads to it. */}
      <LimitsSummaryCard duties={roster.duties} role={activeUser?.role ?? 'pilot'} />

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

      <Box display="flex" gap={1} flexWrap="wrap" alignItems="center">
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
        <Box flexGrow={1} />
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v: ListView | null) => v && chooseView(v)} aria-label="Vista da lista">
          <ToggleButton value="cards" aria-label="Cartões" sx={{ py: 0.25 }}><ViewAgenda fontSize="small" /></ToggleButton>
          <ToggleButton value="board" aria-label="Painel de partidas" sx={{ py: 0.25 }}><BoardIcon fontSize="small" /></ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {monthDuties.length === 0 && (
        <Alert severity="info">Sem registos para este mês. Usa as setas para navegar.</Alert>
      )}
      {monthDuties.length > 0 && dutiesByDay.size === 0 && (
        <Alert severity="info">Nenhum registo corresponde ao filtro ou pesquisa.</Alert>
      )}

      {view === 'board' && dutiesByDay.size > 0 && (
        <DepartureBoard days={[...dutiesByDay.entries()]} changes={changeByDate} today={today} onOpen={(d) => navigate(`/day/${d}`)} />
      )}

      {view === 'cards' && [...dutiesByDay.entries()].map(([date, duties]) => (
        <DayPass key={date} date={date} duties={duties} change={changeByDate.get(date)} isToday={date === today}
          base={baseOf(activeUser)} onOpen={() => navigate(`/day/${date}`)} />
      ))}
    </Stack>
  );
}
