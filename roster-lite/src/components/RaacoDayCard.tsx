import { useMemo } from 'react';
import { Box, ButtonBase, Card, CardContent, Stack, Typography } from '@mui/material';
import { ChevronRight } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { baseOf } from '../domain/dutyStats';
import { MEAL_LABEL, raacoDays, type MealHow } from '../domain/raaco';
import { TimelineRow, passOverline } from './PassCard';

// The day's meals under the RAACO (ROV-PGA 4.5): which are due, how each is met — loaded on a
// flight, on ground, as an allowance or in the stay — and what goes on the Abonos statement.

const HOW: Record<MealHow, { label: string; color: string }> = {
  onboard: { label: 'a bordo', color: '#1F63B5' },
  dhc: { label: 'a bordo (DHC)', color: '#546e7a' },
  ground: { label: 'em terra (O/G)', color: '#B45309' },
  allowance: { label: 'ajuda de custo', color: '#B45309' },
  stay: { label: 'estadia', color: '#0F766E' },
};

const euro = (v: number) => v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export default function RaacoDayCard({ date }: { date: string }) {
  const { roster, activeUser } = useRoster();
  const navigate = useNavigate();
  const base = baseOf(activeUser);
  const day = useMemo(() => (roster ? raacoDays(roster.duties, base).get(date) ?? null : null), [roster, base, date]);
  if (!day || (day.meals.length === 0 && day.nights.length === 0)) return null;
  return (
    <Card variant="outlined">
      <CardContent>
        <Box display="flex" alignItems="baseline" mb={1}>
          <Typography sx={{ ...passOverline, flexGrow: 1 }}>REFEIÇÕES · RAACO</Typography>
          <ButtonBase onClick={() => navigate('/abonos')} sx={{ ...passOverline, color: 'primary.main', borderRadius: 1, px: 0.5, minHeight: 28 }}>
            {day.total > 0 ? euro(day.total) : 'Abonos'} <ChevronRight sx={{ fontSize: 16 }} />
          </ButtonBase>
        </Box>
        <Stack spacing={0.75}>
          {day.meals.map((m, i) => (
            <TimelineRow key={i} wrapSub color={HOW[m.how].color} title={MEAL_LABEL[m.meal]}
              sub={m.why} right={m.value ? euro(m.value) : m.value === null ? 'sem valor' : HOW[m.how].label}
              rightSub={m.value ? HOW[m.how].label : m.where} />
          ))}
          {day.nights.map((n, i) => (
            <TimelineRow key={`n${i}`} color={HOW.stay.color} title="Pernoita" sub={`Estadia em ${n.where} (Tabela 34)`}
              right={n.value !== null ? euro(n.value) : 'sem valor'} />
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" mt={1}>
          Estimativa experimental pela escala (o Meal Plan e as irregularidades não estão nela).
        </Typography>
      </CardContent>
    </Card>
  );
}
