import { useEffect, useMemo, useState } from 'react';
import { Box, Card, CardContent, Divider, LinearProgress, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { CalendarMonth } from '@mui/icons-material';
import { ExperimentalChip } from './AeDisclaimer';
import InfoCollapse from './InfoCollapse';
import { ANNUAL_BLOCK_MIN, ANNUAL_DUTY_MIN, annualPlafond } from '../domain/annualPlafond';
import { getPaySettingsFor } from '../storage/settings';
import { todayISO } from '../domain/rosterWindow';
import { formatDuration } from '../utils/duration';
import type { ParsedDuty } from '../domain/types';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const EUR = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The yearly plafonds (RRRGS cl. 2.2 b / 2.4) beside the monthly ones: the year's credited duty and block against 1136:40 /
// 624:00, the value above them at 3% of the VB, less what the months already paid — the balance the March pay would bring
// (a tester, Nov 2026: "também se podia arranjar uma solução para as horas anuais"; user: "avança").
export default function AnnualPlafondCard({ duties, base, userId }: { duties: ParsedDuty[]; base: string; userId: string }) {
  const years = useMemo(() => [...new Set(duties.map((d) => Number(d.date.slice(0, 4))))].sort((a, b) => b - a), [duties]);
  const thisYear = new Date().getFullYear();
  const [picked, setPicked] = useState<number | null>(null);
  const year = picked && years.includes(picked) ? picked : years.includes(thisYear) ? thisYear : years[0];
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const bump = () => setRev((v) => v + 1);
    window.addEventListener('pay-settings-updated', bump);
    return () => window.removeEventListener('pay-settings-updated', bump);
  }, []);
  const a = useMemo(
    () => (year ? annualPlafond(duties, year, (m) => getPaySettingsFor(userId, m), todayISO(), base) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [duties, year, userId, base, rev],
  );
  if (!a || !a.months.length) return null;

  const bar = (label: string, credited: number, limit: number, chosen: boolean) => (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="baseline">
        <Typography variant="body2" fontWeight={chosen ? 700 : 500}>{label}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatDuration(credited)} / {formatDuration(limit)}
        </Typography>
      </Box>
      <LinearProgress variant="determinate" color={credited > limit ? 'warning' : 'primary'} value={Math.min(100, (credited / limit) * 100)} />
    </Box>
  );
  const row = (label: string, value: number, strong = false) => (
    <Box display="flex" justifyContent="space-between" gap={1}>
      <Typography variant="body2" fontWeight={strong ? 700 : 400}>{label}</Typography>
      <Typography variant="body2" fontWeight={strong ? 700 : 400} sx={{ fontVariantNumeric: 'tabular-nums' }}>{EUR.format(value)}</Typography>
    </Box>
  );

  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" gap={1} mb={1}>
          <CalendarMonth fontSize="small" color="action" />
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Plafond anual</Typography>
          <ExperimentalChip />
        </Box>
        {years.length > 1 && (
          <ToggleButtonGroup size="small" exclusive value={year} onChange={(_, v) => v && setPicked(v)} sx={{ mb: 1 }}>
            {years.slice(0, 3).map((y) => <ToggleButton key={y} value={y} sx={{ py: 0.25, px: 1 }}>{y}</ToggleButton>)}
          </ToggleButtonGroup>
        )}
        <Stack spacing={1}>
          {bar('Duty-pay', a.duty, ANNUAL_DUTY_MIN, a.best === 'duty')}
          {bar('Block-pay', a.block, ANNUAL_BLOCK_MIN, a.best === 'block')}
        </Stack>
        <Stack spacing={0.5} mt={1.5}>
          {row(`Acima do plafond anual (${a.best === 'block' ? 'block' : 'duty'}, 3% do VB)`, a.annualValue)}
          {row('Já pago nos meses', a.monthlyPaid)}
          {row(`Saldo com o vencimento de março de ${a.year + 1}`, a.balance, true)}
        </Stack>
        {/* Fixed-width columns so the months line up (user: "alinha sempre"). */}
        <Stack divider={<Divider flexItem />} spacing={0.25} mt={1.5}>
          <Box display="grid" gridTemplateColumns="40px repeat(3, minmax(0, 1fr))">
            <span />
            {['Duty', 'Block', 'Pago'].map((h) => <Typography key={h} variant="caption" align="right" color="text.secondary" fontWeight={700}>{h}</Typography>)}
          </Box>
          {a.months.map((m) => (
            <Box key={m.month} display="grid" gridTemplateColumns="40px repeat(3, minmax(0, 1fr))" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              <Typography variant="caption" fontWeight={600}>{MONTHS[Number(m.month.slice(5, 7)) - 1]}</Typography>
              <Typography variant="caption" align="right">{formatDuration(m.duty)}</Typography>
              <Typography variant="caption" align="right">{formatDuration(m.block)}</Typography>
              <Typography variant="caption" align="right">{EUR.format(m.paid)}</Typography>
            </Box>
          ))}
        </Stack>
        <Box mt={1}>
          <InfoCollapse card={false} title="Como se conta">
            <Typography variant="caption" color="text.secondary">
              RRRGS cl. 2.ª n.º 2 b) e n.º 4: no ano civil, 1136:40 de duty-pay ou 624:00 de block-pay — o que for mais
              favorável. As horas acima são pagas a 3% do VB (a tabela anual só tem um limite), com o VB do último mês com
              valores; tira-se o que os meses já pagaram acima dos seus plafonds e o saldo positivo vem com o vencimento de
              março. Só os meses com escala guardada; as férias não reduzem o plafond anual. As licenças parentais, a
              admissão a meio do ano e a diminuição de atividade (que o reduzem) não estão contadas.
            </Typography>
          </InfoCollapse>
        </Box>
      </CardContent>
    </Card>
  );
}
