import { useMemo, useState } from 'react';
import { InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { Search } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { searchRoster } from '../domain/rosterSearch';
import { TimelineRow } from '../components/PassCard';
import { dutyColor } from '../theme';
import { dayLabel } from '../utils/dates';
import PageHero from '../components/PageHero';

// Global search across the roster: flights (number, airport, route, crew), duty types and dates.
// A hit jumps to its day, focusing the specific flight.
export default function SearchPage() {
  const navigate = useNavigate();
  const { roster } = useRoster();
  const duties = useMemo(() => roster?.duties ?? [], [roster]);
  const [q, setQ] = useState('');
  const hits = useMemo(() => searchRoster(duties, q), [duties, q]);

  return (
    <Stack spacing={2}>
      <PageHero back label="Pesquisa" title="Pesquisar" subtitle="Voos, aeroportos, rotas, colegas e datas da escala" />

      <TextField
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Voo, aeroporto, rota, colega, data…"
        size="small"
        fullWidth
        autoFocus
        InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
      />

      {q.trim().length >= 2 && (
        <Typography variant="caption" color="text.secondary">
          {hits.length === 0 ? 'Sem resultados.' : `${hits.length} resultado${hits.length === 1 ? '' : 's'}`}
        </Typography>
      )}

      {hits.map((h, i) => (
        <TimelineRow
          key={`${h.date}-${h.flightNumber}-${i}`}
          color={dutyColor(h.isFlight ? 'Flight Duty' : h.dutyType)}
          title={h.title}
          sub={dayLabel(h.date, true)}
          onClick={() => navigate(`/day/${h.date}`, h.isFlight ? { state: { flightNumber: h.flightNumber, dep: h.dep, arr: h.arr } } : undefined)}
        />
      ))}
    </Stack>
  );
}
