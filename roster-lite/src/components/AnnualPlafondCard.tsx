import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Divider, LinearProgress, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { CalendarMonth, ExpandLess, ExpandMore } from '@mui/icons-material';
import { ExperimentalChip } from './AeDisclaimer';
import InfoCollapse from './InfoCollapse';
import { annualPlafond, type AnnualCuts } from '../domain/annualPlafond';
import { getAnnualCuts, getPaySettingsFor, setAnnualCuts } from '../storage/settings';
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
  // Worked out only when opened: twelve monthly estimates are too much for every visit to the page (a tester, 0.9.3.99:
  // "a app está lenta após esta versão").
  const [open, setOpen] = useState(false);
  const [allCuts, setAllCuts] = useState<Record<string, AnnualCuts>>(() => getAnnualCuts(userId));
  useEffect(() => { setAllCuts(getAnnualCuts(userId)); }, [userId]);
  const [showCuts, setShowCuts] = useState(false);
  const cuts: AnnualCuts = (year && allCuts[year]) || {};
  const patchCuts = (p: AnnualCuts) => { if (year) setAllCuts(setAnnualCuts(userId, year, { ...cuts, ...p })); };
  useEffect(() => {
    const bump = () => setRev((v) => v + 1);
    window.addEventListener('pay-settings-updated', bump);
    return () => window.removeEventListener('pay-settings-updated', bump);
  }, []);
  // Worked out after a paint, so "A calcular…" shows instead of the button freezing (twelve monthly estimates).
  const [a, setA] = useState<ReturnType<typeof annualPlafond> | null>(null);
  useEffect(() => {
    if (!open || !year) { setA(null); return; }
    const t = window.setTimeout(() => setA(annualPlafond(duties, year, (m) => getPaySettingsFor(userId, m), todayISO(), base, cuts)), 30);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, duties, year, userId, base, rev, cuts.fromMonth, cuts.parentalDays, cuts.reducedPct]);
  if (!year) return null;
  const header = (
    <Box display="flex" alignItems="center" gap={1}>
      <CalendarMonth fontSize="small" color="action" />
      <Typography variant="subtitle2" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>Plafond anual</Typography>
      <ExperimentalChip />
      <Button size="small" sx={{ minWidth: 0, whiteSpace: 'nowrap' }} onClick={() => setOpen((v) => !v)} endIcon={open ? <ExpandLess /> : <ExpandMore />}>
        {open ? 'Fechar' : 'Ver'}
      </Button>
    </Box>
  );
  if (!open || !a || !a.months.length) {
    return (
      <Card>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          {header}
          {open && !a && <Typography variant="caption" color="text.secondary" display="block" mt={1}>A calcular o ano…</Typography>}
          {open && a && !a.months.length && (
            <Typography variant="caption" color="text.secondary" display="block" mt={1}>Sem escala guardada em {year}.</Typography>
          )}
        </CardContent>
      </Card>
    );
  }

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
        <Box mb={1}>{header}</Box>
        {years.length > 1 && (
          <ToggleButtonGroup size="small" exclusive value={year} onChange={(_, v) => v && setPicked(v)} sx={{ mb: 1 }}>
            {years.slice(0, 3).map((y) => <ToggleButton key={y} value={y} sx={{ py: 0.25, px: 1 }}>{y}</ToggleButton>)}
          </ToggleButtonGroup>
        )}
        <Stack spacing={1}>
          {bar('Duty-pay', a.duty, a.limits.duty, a.best === 'duty')}
          {bar('Block-pay', a.block, a.limits.block, a.best === 'block')}
        </Stack>
        {/* What cuts the year's credits (cl. 2.2 c): admission year, parental leave, reduced activity — typed by the pilot. */}
        <Button size="small" sx={{ mt: 0.5, px: 0 }} onClick={() => setShowCuts((v) => !v)} endIcon={showCuts ? <ExpandLess /> : <ExpandMore />}>
          Reduções do plafond{cuts.fromMonth || cuts.parentalDays || cuts.reducedPct ? ' (aplicadas)' : ''}
        </Button>
        {showCuts && (
          <Stack spacing={1.25} mt={1}>
            <TextField select size="small" label="Mês de largada (ano de admissão)" value={cuts.fromMonth ?? ''}
              onChange={(e) => patchCuts({ fromMonth: e.target.value === '' ? undefined : Number(e.target.value) })}>
              <MenuItem value="">Ano todo</MenuItem>
              {MONTHS.map((m, i) => <MenuItem key={m} value={i + 1}>{m}</MenuItem>)}
            </TextField>
            <TextField size="small" type="number" label="Licença parental (dias)" value={cuts.parentalDays ?? ''}
              slotProps={{ htmlInput: { min: 0, inputMode: 'numeric' } }}
              onChange={(e) => patchCuts({ parentalDays: e.target.value === '' ? undefined : Math.max(0, Math.round(Number(e.target.value))) })} />
            <TextField size="small" type="number" label="Diminuição de atividade (%)" value={cuts.reducedPct ?? ''}
              slotProps={{ htmlInput: { min: 0, max: 100, inputMode: 'decimal' } }}
              onChange={(e) => patchCuts({ reducedPct: e.target.value === '' ? undefined : Math.min(100, Math.max(0, Number(e.target.value))) })} />
          </Stack>
        )}
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
              admissão a meio do ano (Tabela 2.3, a partir do mês de largada) e a diminuição de atividade reduzem-no — escreve-as em «Reduções do plafond» (licença parental: 3:37 de duty e 2:00 de block por dia, Tabela 2.4). As faltas justificadas não o reduzem (cl. 2.2 c ii).
            </Typography>
          </InfoCollapse>
        </Box>
      </CardContent>
    </Card>
  );
}
