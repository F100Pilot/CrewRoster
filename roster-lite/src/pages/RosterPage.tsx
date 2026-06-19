import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, Divider, IconButton,
  ListItemIcon, ListItemText, Menu, MenuItem, Stack, Typography,
} from '@mui/material';
import { ChevronLeft, ChevronRight, Delete, Login, Today, CalendarMonth, MoreVert } from '@mui/icons-material';
import { addMonths, format, isSameMonth, parseISO, subMonths } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import UploadDropzone from '../components/UploadDropzone';
import DutyChip from '../components/DutyChip';
import NextDutyCard from '../components/NextDutyCard';
import GoogleCalendarSync from '../components/GoogleCalendarSync';
import { downloadIcs } from '../utils/icsExport';
import type { ParsedDuty } from '../domain/types';

export default function RosterPage() {
  const { roster, loading, warnings, error, clear, activeUser } = useRoster();
  const navigate = useNavigate();
  const [month, setMonth] = useState(new Date());
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  const dutiesByDay = useMemo(() => {
    const map = new Map<string, ParsedDuty[]>();
    if (!roster) return map;
    for (const d of roster.duties) {
      if (!isSameMonth(parseISO(d.date), month)) continue;
      if (!map.has(d.date)) map.set(d.date, []);
      map.get(d.date)!.push(d);
    }
    return new Map([...map.entries()].sort());
  }, [roster, month]);

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

  const monthDuties = roster.duties.filter((d) => isSameMonth(parseISO(d.date), month));

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {warnings.map((w, i) => (
        <Alert key={i} severity="warning">
          {w}
        </Alert>
      ))}

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

      <Box display="flex" alignItems="center" gap={1}>
        <Box flexGrow={1} minWidth={0}>
          <Typography variant="caption" color="text.secondary" noWrap display="block">
            {roster.duties.length} dias · {roster.fileName}
          </Typography>
        </Box>

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

      {monthDuties.length === 0 && (
        <Alert severity="info">Sem registos para este mês. Usa as setas para navegar.</Alert>
      )}

      {[...dutiesByDay.entries()].map(([date, duties]) => (
        <Card key={date} variant="outlined" sx={{ cursor: 'pointer' }} onClick={() => navigate(`/day/${date}`)}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography variant="subtitle2">{format(parseISO(date), 'EEE, dd MMM')}</Typography>
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
      ))}
    </Stack>
  );
}
