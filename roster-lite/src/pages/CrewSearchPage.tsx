import { useMemo } from 'react';
import { Autocomplete, Box, Card, CardActionArea, CardContent, Chip, IconButton, Stack, TextField, Typography } from '@mui/material';
import { ArrowBack, Groups } from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import { useNavigate, useParams } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { allColleagues, flightsWithColleague, type Colleague } from '../domain/crewSearch';

const ROLE_LABEL: Record<string, string> = { CP: 'Comandante', FO: 'Oficial Piloto', PU: 'Chefe de Cabine', ST: 'Tripulante' };

// "Com quem voo": every flight shared with a chosen colleague, plus a search to pick anyone in
// the roster. Reached by tapping a crew member in a flight's crew pop-up.
export default function CrewSearchPage() {
  const { login = '' } = useParams<{ login: string }>();
  const navigate = useNavigate();
  const { roster, activeUser } = useRoster();
  const duties = useMemo(() => roster?.duties ?? [], [roster]);

  const colleagues = useMemo(() => allColleagues(duties, activeUser?.crewCode), [duties, activeUser]);
  const flights = useMemo(() => flightsWithColleague(duties, login), [duties, login]);
  const current = useMemo(
    () => colleagues.find((c) => c.login === login.toUpperCase()) ?? null,
    [colleagues, login],
  );
  const name = current
    ? `${current.firstName ? current.firstName + ' ' : ''}${current.surname}`.trim()
    : login.toUpperCase();

  return (
    <Stack spacing={2}>
      <Box display="flex" alignItems="center" gap={0.5}>
        <IconButton onClick={() => navigate(-1)} aria-label="Voltar"><ArrowBack /></IconButton>
        <Groups color="action" />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>Com quem voo</Typography>
      </Box>

      <Autocomplete<Colleague>
        options={colleagues}
        value={current}
        onChange={(_, v) => v && navigate(`/crew/${v.login}`, { replace: true })}
        getOptionLabel={(o) => `${o.login} · ${o.surname}`}
        isOptionEqualToValue={(o, v) => o.login === v.login}
        renderOption={(props, o) => (
          <li {...props} key={o.login}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
              <Typography sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{o.login}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>{o.surname}</Typography>
              <Chip size="small" variant="outlined" label={`${o.count} voo${o.count > 1 ? 's' : ''}`} />
            </Box>
          </li>
        )}
        renderInput={(params) => <TextField {...params} label="Procurar colega (código ou apelido)" size="small" />}
        noOptionsText="Nenhum colega na escala"
      />

      {login && (
        <Typography variant="body2" color="text.secondary">
          {flights.length === 0
            ? `Sem voos com ${name} nesta escala.`
            : `Voaste ${flights.length} ${flights.length === 1 ? 'vez' : 'vezes'} com ${name}${current ? ` (${ROLE_LABEL[current.role] ?? current.role})` : ''}.`}
        </Typography>
      )}

      {flights.map((f, i) => (
        <Card key={`${f.date}-${f.flightNumber}-${i}`} variant="outlined">
          <CardActionArea onClick={() => navigate(`/day/${f.date}`)}>
            <CardContent sx={{ py: 1.5 }}>
              <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                <Typography variant="subtitle2" sx={{ minWidth: 92 }}>
                  {format(parseISO(f.date), 'EEE, dd MMM')}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{f.flightNumber ?? '—'}</Typography>
                <Typography variant="body2" color="text.secondary">{f.dep ?? '—'} → {f.arr ?? '—'}</Typography>
                <Box flexGrow={1} />
                <Chip size="small" variant="outlined" label={ROLE_LABEL[f.role] ?? f.role} />
              </Box>
            </CardContent>
          </CardActionArea>
        </Card>
      ))}
    </Stack>
  );
}
