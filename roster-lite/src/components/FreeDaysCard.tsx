import { useMemo, useState } from 'react';
import { Box, Card, CardContent, Divider, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import InfoCollapse from './InfoCollapse';
import { freeDayCounts, type FreeDayCounts } from '../domain/dutyStats';
import type { ParsedDuty } from '../domain/types';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const COLS: { key: keyof FreeDayCounts; label: string }[] = [
  { key: 'folga', label: 'Folgas' },
  { key: 'x', label: 'X' },
  { key: 'pls', label: 'PLS' },
  { key: 'ferias', label: 'Férias' },
];

// Folgas, X (days off away from base), PLS and holidays apart, month by month and for the year (a tester, Nov 2026: "separar e mostrar o que é férias /
// folgas / PLS"). Only the months the stored roster covers; by day, as the calendar's tiles count them.
export default function FreeDaysCard({ duties }: { duties: ParsedDuty[] }) {
  const years = useMemo(() => [...new Set(duties.map((d) => d.date.slice(0, 4)))].sort().reverse(), [duties]);
  const thisYear = new Date().getFullYear().toString();
  const [picked, setPicked] = useState<string | null>(null);
  const year = picked && years.includes(picked) ? picked : years.includes(thisYear) ? thisYear : years[0];
  const rows = useMemo(() => {
    const out: { month: number; c: FreeDayCounts }[] = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      const inMonth = duties.filter((d) => d.date.startsWith(key));
      if (inMonth.length) out.push({ month: m, c: freeDayCounts(inMonth) });
    }
    return out;
  }, [duties, year]);
  const total = rows.reduce<FreeDayCounts>((a, r) => ({ folga: a.folga + r.c.folga, x: a.x + r.c.x, pls: a.pls + r.c.pls, ferias: a.ferias + r.c.ferias }), { folga: 0, x: 0, pls: 0, ferias: 0 });
  if (!year) return null;

  // Fixed-width columns so the figures line up from row to row (user: "alinha sempre").
  const line = (label: string, c: FreeDayCounts, strong = false) => (
    <Box key={label} display="grid" gridTemplateColumns="56px repeat(4, minmax(0, 1fr))" alignItems="center">
      <Typography variant="body2" fontWeight={strong ? 700 : 600}>{label}</Typography>
      {COLS.map((col) => (
        <Typography key={col.key} variant="body2" align="right" fontWeight={strong ? 700 : 400}
          color={c[col.key] ? 'text.primary' : 'text.disabled'}>
          {c[col.key]}
        </Typography>
      ))}
    </Box>
  );

  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box display="flex" alignItems="center" gap={1} mb={1}>
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Folgas, PLS e férias</Typography>
          {years.length > 1 && (
            <ToggleButtonGroup size="small" exclusive value={year} onChange={(_, v) => v && setPicked(v)}>
              {years.slice(0, 3).map((y) => <ToggleButton key={y} value={y} sx={{ py: 0.25, px: 1 }}>{y}</ToggleButton>)}
            </ToggleButtonGroup>
          )}
        </Box>
        <Box display="grid" gridTemplateColumns="56px repeat(4, minmax(0, 1fr))" mb={0.5}>
          <span />
          {COLS.map((col) => (
            <Typography key={col.key} variant="caption" align="right" color="text.secondary" fontWeight={700}>{col.label}</Typography>
          ))}
        </Box>
        <Stack divider={<Divider flexItem />} spacing={0.5}>
          {rows.map((r) => line(MONTHS[r.month - 1], r.c))}
          {line(year, total, true)}
        </Stack>
        <Box mt={0.75}>
          <InfoCollapse card={false} title="O que conta">
            <Typography variant="caption" color="text.secondary">
              Por dia, só nos meses com escala guardada. Folgas: W_OFF, OFF e as pedidas. X: folga fora da base — não conta
              como dia de folga, que é gozado na base (RUPT cl. 6.ª n.º 11). PLS: períodos livres de serviço (PLS_…). Férias:
              F, PLIC, SLIC, RLIC.
            </Typography>
          </InfoCollapse>
        </Box>
      </CardContent>
    </Card>
  );
}
