import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, Divider, IconButton,
  ListItemIcon, ListItemText, Menu, MenuItem, Popover, Stack, Typography,
} from '@mui/material';
import {
  ChevronLeft, ChevronRight, Delete, Login, Today, CalendarMonth, MoreVert, InfoOutlined, EditCalendar,
} from '@mui/icons-material';
import { addMonths, format, isSameMonth, parseISO, subMonths } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import UploadDropzone from '../components/UploadDropzone';
import DutyChip from '../components/DutyChip';
import NextDutyCard from '../components/NextDutyCard';
import MonthStatsCard from '../components/MonthStatsCard';
import GoogleCalendarSync from '../components/GoogleCalendarSync';
import { downloadIcs } from '../utils/icsExport';
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

export default function RosterPage() {
  const { roster, loading, warnings, error, clear, dismissChanges, activeUser } = useRoster();
  const navigate = useNavigate();
  const [month, setMonth] = useState(new Date());
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [infoAnchor, setInfoAnchor] = useState<null | HTMLElement>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const changeByDate = useMemo(() => {
    const map = new Map<string, ChangeType>();
    for (const c of roster?.changes ?? []) map.set(c.date, c.type);
    return map;
  }, [roster]);

  const monthDuties = useMemo(
    () => (roster ? roster.duties.filter((d) => isSameMonth(parseISO(d.date), month)) : []),
    [roster, month]
  );

  const dutiesByDay = useMemo(() => {
    const map = new Map<string, ParsedDuty[]>();
    for (const d of monthDuties) {
      if (!matchesFilter(d, filter)) continue;
      if (!map.has(d.date)) map.set(d.date, []);
      map.get(d.date)!.push(d);
    }
    return new Map([...map.entries()].sort());
  }, [monthDuties, filter]);

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
        <Button size="small" startIcon={<Today />} onClick={() => setMonth(new Date())}>
          Hoje
        </Button>
      </Box>

      <MonthStatsCard duties={monthDuties} />

      <Box display="flex" alignItems="center" gap={1}>
        <IconButton size="small" onClick={(e) => setInfoAnchor(e.currentTarget)} title="Detalhes da escala">
          <InfoOutlined fontSize="small" />
        </IconButton>
        <Popover
          open={Boolean(infoAnchor)}
          anchorEl={infoAnchor}
          onClose={() => setInfoAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <Box sx={{ p: 1.5, maxWidth: 280 }}>
            <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
              {roster.fileName} · {roster.duties.length} dias · importado{' '}
              {format(parseISO(roster.importedAt), 'dd/MM/yyyy HH:mm')}
            </Typography>
          </Box>
        </Popover>

        <Box flexGrow={1} />

        {activeUser && (
          <GoogleCalendarSync
            roster={roster}
            userId={activeUser.id}
            variant="contained"
            label="Sincronizar"
          />
        )}

        <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)} title="Mais ações">
          <MoreVert />
        </IconButton>
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <MenuItem onClick={() => { downloadIcs(roster); setMenuAnchor(null); }}>
            <ListItemIcon><CalendarMonth fontSize="small" /></ListItemIcon>
            <ListItemText>Exportar .ics</ListItemText>
          </MenuItem>
          <Divider />
          <MenuItem onClick={() => { clear(); setMenuAnchor(null); }} sx={{ color: 'error.main' }}>
            <ListItemIcon><Delete fontSize="small" color="error" /></ListItemIcon>
            <ListItemText>Limpar escala</ListItemText>
          </MenuItem>
        </Menu>
      </Box>

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
        <Alert severity="info">Nenhum registo deste tipo neste mês.</Alert>
      )}

      {[...dutiesByDay.entries()].map(([date, duties]) => {
        const change = changeByDate.get(date);
        return (
        <Card
          key={date}
          variant="outlined"
          sx={{
            cursor: 'pointer',
            ...(change && {
              borderLeft: `4px solid ${CHANGE_STYLE[change].color}`,
            }),
          }}
          onClick={() => navigate(`/day/${date}`)}
        >
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
              <Box display="flex" alignItems="center" gap={1}>
                <Typography variant="subtitle2">{format(parseISO(date), 'EEE, dd MMM')}</Typography>
                {change && (
                  <Chip
                    size="small"
                    label={CHANGE_STYLE[change].label}
                    sx={{ bgcolor: CHANGE_STYLE[change].color, color: '#fff', height: 18, fontSize: '0.65rem' }}
                  />
                )}
              </Box>
              {duties[0]?.reportingTime && (
                <Chip size="small" variant="outlined" label={`Apres. ${duties[0].reportingTime}z`} />
              )}
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
