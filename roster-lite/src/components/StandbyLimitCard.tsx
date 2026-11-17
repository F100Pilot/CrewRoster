import { useMemo } from 'react';
import { Box, Card, CardContent, Divider, LinearProgress, Stack, Typography } from '@mui/material';
import { NotificationsActive } from '@mui/icons-material';
import { ExperimentalChip } from './AeDisclaimer';
import InfoCollapse from './InfoCollapse';
import { limitLevel } from '../domain/limitRows';
import { STANDBY_MONTH_LIMIT, STANDBY_YEAR_LIMIT, standbyByMonth, standbyDays } from '../domain/standbyLimit';
import type { ParsedDuty } from '../domain/types';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Standbys and R24 reserves of the year against the AE's 24 (RUPT cl. 19.24), counted as planned — one used to fly still
// counts — and each month against its 6 (cl. 19.16). A tester's request (Nov 2026): "o piloto saber às quantas anda".
export default function StandbyLimitCard({ duties }: { duties: ParsedDuty[] }) {
  const year = String(new Date().getFullYear());
  const days = useMemo(() => standbyDays(duties, year), [duties, year]);
  const months = useMemo(() => standbyByMonth(days), [days]);
  const level = limitLevel(days.length, STANDBY_YEAR_LIMIT);

  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box display="flex" alignItems="center" gap={1} mb={0.75}>
          <NotificationsActive fontSize="small" color="action" />
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Assistências {year}</Typography>
          <ExperimentalChip />
        </Box>
        <Box display="flex" justifyContent="space-between" mb={0.25}>
          <Typography variant="caption" color="text.secondary">Assistências e reservas planeadas (ano civil)</Typography>
          <Typography variant="caption" fontWeight={600}>{days.length} / {STANDBY_YEAR_LIMIT}</Typography>
        </Box>
        <LinearProgress variant="determinate" color={level} value={Math.min(100, Math.round((days.length / STANDBY_YEAR_LIMIT) * 100))} />
        <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
          {days.length >= STANDBY_YEAR_LIMIT
            ? `Limite anual atingido${days.length > STANDBY_YEAR_LIMIT ? ` (+${days.length - STANDBY_YEAR_LIMIT})` : ''}.`
            : `Faltam ${STANDBY_YEAR_LIMIT - days.length} para o limite anual.`}
          {days.some((d) => d.used) ? ` ${days.filter((d) => d.used).length} foram usadas (contam na mesma).` : ''}
        </Typography>

        {months.length > 0 && (
          <Stack divider={<Divider flexItem />} spacing={0.5} mt={1}>
            {months.map((m) => {
              const over = m.days.length > STANDBY_MONTH_LIMIT || m.reserves > 2 || m.airport > 2;
              return (
                // Fixed-width month and count columns, so the dates start at the same x on every row (user: "alinha sempre").
                <Box key={m.month} display="grid" gridTemplateColumns="40px 44px minmax(0, 1fr)" alignItems="baseline" columnGap={1}>
                  <Typography variant="body2" fontWeight={600}>{MONTHS[Number(m.month.slice(5, 7)) - 1]}</Typography>
                  <Typography variant="body2" fontWeight={700} color={over ? 'error.main' : 'text.primary'}>
                    {m.days.length}/{STANDBY_MONTH_LIMIT}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    {m.days.map((d) => `${ddmm(d.date)} ${d.code}${d.used ? ' (usada)' : ''}`).join(' · ')}
                  </Typography>
                </Box>
              );
            })}
          </Stack>
        )}

        <Box mt={1}>
          <InfoCollapse card={false} title="Como se conta">
            <Typography variant="caption" color="text.secondary">
              RUPT cl. 19.ª n.º 24: até 24 assistências e reservas (R24) por ano civil, publicadas no planeamento — por isso
              conta a assistência planeada, mesmo que tenha sido usada para voar ou trocada por outro serviço. N.º 16: até 6
              dias por mês no planeamento mensal, no máximo 2 reservas e 2 assistências no aeroporto (as do aeroporto dadas em
              operação também contam, n.º 23). A app só sabe que uma assistência foi planeada se guardou uma escala impressa
              antes de ela mudar: descarrega a escala do mês logo que sai. Não separa as assistências acrescentadas a meio do
              mês nem as excluídas pelo n.º 22 (voo anulado) e pelo n.º 18 (regresso de baixa) — confirma na escala oficial,
              que traz a numeração mensal e anual (cl. 11.ª n.º 2 d).
            </Typography>
          </InfoCollapse>
        </Box>
      </CardContent>
    </Card>
  );
}
