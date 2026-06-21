import { useMemo } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, Divider, IconButton, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { ArrowBack, Download, FlightTakeoff } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { logbookEntries, logbookCsv, landingsInWindow } from '../domain/logbook';
import { flightMinutes } from '../domain/flightTime';
import { formatDuration } from '../utils/duration';
import { downloadBlob } from '../utils/download';
import { format, parseISO } from 'date-fns';

// Recency requirement: 3 take-offs and landings in the preceding 90 days.
const RECENCY_REQUIRED = 3;
const RECENCY_DAYS = 90;

export default function LogbookPage() {
  const navigate = useNavigate();
  const { roster, activeUser } = useRoster();

  const duties = roster?.duties ?? [];
  const entries = useMemo(() => logbookEntries(duties), [duties]);
  const totalBlock = useMemo(() => flightMinutes(duties), [duties]);
  const landings90 = useMemo(
    () => landingsInWindow(duties, new Date().toISOString().slice(0, 10), RECENCY_DAYS),
    [duties]
  );
  const recencyOk = landings90 >= RECENCY_REQUIRED;

  function exportCsv() {
    const csv = logbookCsv(entries);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const who = activeUser?.name?.replace(/\s+/g, '-').toLowerCase() ?? 'crew';
    downloadBlob(blob, `logbook-${who}.csv`);
  }

  return (
    <Stack spacing={2}>
      <Box display="flex" alignItems="center" gap={1}>
        <IconButton onClick={() => navigate(-1)}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>Diário de bordo</Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Download />}
          onClick={exportCsv}
          disabled={entries.length === 0}
        >
          CSV
        </Button>
      </Box>

      <Card variant="outlined">
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Box display="flex" flexWrap="wrap" gap={1} alignItems="center">
            <FlightTakeoff fontSize="small" color="action" />
            <Chip size="small" variant="outlined" label={`${entries.length} setores`} />
            <Chip size="small" variant="outlined" label={`Bloco ${formatDuration(totalBlock)}`} />
            <Chip
              size="small"
              label={`Recência: ${landings90}/${RECENCY_REQUIRED} em ${RECENCY_DAYS}d`}
              color={recencyOk ? 'success' : 'warning'}
              sx={{ color: '#fff' }}
            />
          </Box>
          {!recencyOk && (
            <Typography variant="caption" color="warning.main" display="block" mt={1}>
              Abaixo de {RECENCY_REQUIRED} aterragens nos últimos {RECENCY_DAYS} dias (indicativo).
            </Typography>
          )}
        </CardContent>
      </Card>

      {entries.length === 0 ? (
        <Alert severity="info">Sem setores voados na escala importada.</Alert>
      ) : (
        <Card variant="outlined">
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ '& td, & th': { px: 1, whiteSpace: 'nowrap' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Data</TableCell>
                  <TableCell>Voo</TableCell>
                  <TableCell>Rota</TableCell>
                  <TableCell align="right">Bloco</TableCell>
                  <TableCell>Avião</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell>{format(parseISO(e.date), 'dd/MM')}</TableCell>
                    <TableCell>{e.flightNumber}</TableCell>
                    <TableCell>{e.from}–{e.to}</TableCell>
                    <TableCell align="right">{formatDuration(e.blockMinutes)}</TableCell>
                    <TableCell>{e.aircraft}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <Divider />
      <Typography variant="caption" color="text.secondary">
        Gerado a partir da escala importada. Não substitui o teu logbook oficial.
      </Typography>
    </Stack>
  );
}
