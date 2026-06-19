import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, Divider, IconButton, Stack, Typography,
} from '@mui/material';
import { ChevronLeft, ChevronRight, Delete, Login, Today, ExpandMore, ExpandLess } from '@mui/icons-material';
import { addMonths, format, isSameMonth, parseISO, subMonths } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import UploadDropzone from '../components/UploadDropzone';
import DutyChip from '../components/DutyChip';
import type { ParsedDuty } from '../domain/types';

export default function RosterPage() {
  const { roster, loading, warnings, error, clear } = useRoster();
  const navigate = useNavigate();
  const [month, setMonth] = useState(new Date());
  const [showRaw, setShowRaw] = useState(false);

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
            onClick={() => {
              // Navigate to home which will show LoginPage (reset showUpload state).
              // We reload to reset the App-level showUpload state.
              window.location.hash = '#/';
              window.location.reload();
            }}
          >
            Login CrewLink
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

      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Typography variant="caption" color="text.secondary">
          {roster.fileName} · {roster.duties.length} dias · importado{' '}
          {format(parseISO(roster.importedAt), 'dd/MM/yyyy HH:mm')}
        </Typography>
        <Button size="small" color="error" startIcon={<Delete />} onClick={clear}>
          Limpar
        </Button>
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
                <Chip size="small" variant="outlined" label={`Report ${duties[0].reportingTime}`} />
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

      {roster.sourceType === 'pdf' && (
        <Box>
          <Divider sx={{ my: 1 }} />
          <Button
            size="small"
            startIcon={showRaw ? <ExpandLess /> : <ExpandMore />}
            onClick={() => setShowRaw((s) => !s)}
          >
            Texto extraído do PDF
          </Button>
          {showRaw && (
            <Box
              component="pre"
              sx={{
                mt: 1, p: 1.5, bgcolor: 'grey.100', borderRadius: 1, fontSize: '0.7rem',
                whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto',
              }}
            >
              {roster.rawText}
            </Box>
          )}
        </Box>
      )}
    </Stack>
  );
}
