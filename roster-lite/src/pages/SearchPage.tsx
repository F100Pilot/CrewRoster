import { useMemo, useState } from 'react';
import { Box, Card, CardActionArea, CardContent, Chip, IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { ArrowBack, FlightTakeoff, Search } from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { searchRoster } from '../domain/rosterSearch';

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
      <Box display="flex" alignItems="center" gap={0.5}>
        <IconButton onClick={() => navigate(-1)} aria-label="Voltar"><ArrowBack /></IconButton>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>Pesquisar</Typography>
      </Box>

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
        <Card key={`${h.date}-${h.flightNumber}-${i}`} variant="outlined">
          <CardActionArea
            onClick={() => navigate(`/day/${h.date}`, h.isFlight ? { state: { flightNumber: h.flightNumber, dep: h.dep, arr: h.arr } } : undefined)}
          >
            <CardContent sx={{ py: 1.25 }}>
              <Box display="flex" alignItems="center" gap={1}>
                {h.isFlight && <FlightTakeoff fontSize="small" color="action" />}
                <Box flexGrow={1}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{h.title}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {format(parseISO(h.date), 'EEE, dd MMM yyyy')}
                  </Typography>
                </Box>
                {!h.isFlight && <Chip size="small" variant="outlined" label={h.title} />}
              </Box>
            </CardContent>
          </CardActionArea>
        </Card>
      ))}
    </Stack>
  );
}
