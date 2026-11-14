import { useMemo, useState } from 'react';
import { Box, ButtonBase, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Button, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { format, isSameMonth, parseISO } from 'date-fns';
import { useRoster } from '../state/useRoster';
import { baseOf } from '../domain/dutyStats';
import { MEAL_LABEL, raacoDays, type MealLine, type RaacoDay } from '../domain/raaco';
import { dayLabel } from '../utils/dates';
import { passOverline } from './PassCard';

// The crew's word on the meals the Meal Plan is about (user, Nov 2026): on a past flight day, each meal the app
// counts as loaded — or pays because nothing carried it — can be marked "Havia a bordo" / "Não havia", and the abonos
// follow it (raaco.ts). Only those meals, never every flight: the calendar shows 🍽 on such days.

const euro = (v: number) => v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const todayISO = () => format(new Date(), 'yyyy-MM-dd');

/** The RAACO days with meals to confirm (askable, already flown). */
export function useMealsToConfirm(): Map<string, RaacoDay> {
  const { roster, activeUser } = useRoster();
  const base = baseOf(activeUser);
  return useMemo(() => {
    const out = new Map<string, RaacoDay>();
    if (!roster) return out;
    const today = todayISO();
    for (const d of raacoDays(roster.duties, base).values()) {
      if (d.date <= today && d.meals.some((m) => m.askable)) out.set(d.date, d);
    }
    return out;
  }, [roster, base]);
}

const appSays = (m: MealLine) =>
  m.crew === true ? 'a bordo (marcado por ti)'
    : m.crew === false ? `não havia (marcado por ti) · ${m.value !== null ? euro(m.value) : 'sem valor'}`
    : m.how === 'onboard' ? `a app conta a bordo · ${m.where}`
    : `a app paga ${m.value !== null ? euro(m.value) : '—'}${m.how === 'ground' ? ' (em terra)' : ''}`;

/** One row per askable meal of a day: what the app counts, and the crew's answer. */
export function MealConfirmList({ day }: { day: RaacoDay }) {
  const { setMealOnboard } = useRoster();
  const meals = day.meals.filter((m) => m.askable);
  return (
    <Stack spacing={1.25}>
      {meals.map((m) => (
        <Box key={m.key}>
          <Box display="flex" alignItems="baseline" gap={1} flexWrap="wrap">
            <Typography variant="body2" fontWeight={800}>{MEAL_LABEL[m.meal]}</Typography>
            <Typography variant="caption" color="text.secondary">{appSays(m)}</Typography>
          </Box>
          <ToggleButtonGroup exclusive size="small" sx={{ mt: 0.5 }}
            value={m.crew === undefined ? null : m.crew ? 'yes' : 'no'}
            onChange={(_, v: 'yes' | 'no' | null) => setMealOnboard(m.key, v === null ? null : v === 'yes')}>
            <ToggleButton value="yes">Havia a bordo</ToggleButton>
            <ToggleButton value="no">Não havia</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      ))}
    </Stack>
  );
}

/** The calendar's banner: the month's flown days with meals to confirm; a tap opens that day's list. */
export function MealConfirmBanner({ month }: { month: Date }) {
  const days = useMealsToConfirm();
  const [open, setOpen] = useState<string | null>(null);
  const list = [...days.values()].filter((d) => isSameMonth(parseISO(d.date), month)).sort((a, b) => a.date.localeCompare(b.date));
  if (!list.length) return null;
  const pending = list.filter((d) => d.meals.some((m) => m.askable && m.crew === undefined)).length;
  const day = open ? days.get(open) ?? null : null;
  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
        <Typography sx={passOverline}>🍽 REFEIÇÕES A BORDO · ABONOS (EM TESTES)</Typography>
        <Typography variant="body2" color="text.secondary" mt={0.5}>
          {pending ? `${pending} ${pending === 1 ? 'dia' : 'dias'} por confirmar. ` : 'Tudo confirmado. '}
          Diz se a refeição estava a bordo — os abonos passam a seguir o que marcares.
        </Typography>
        <Box display="flex" flexWrap="wrap" gap={0.75} mt={1}>
          {list.map((d) => {
            const todo = d.meals.some((m) => m.askable && m.crew === undefined);
            return (
              <ButtonBase key={d.date} onClick={() => setOpen(d.date)}
                sx={{ px: 1, py: 0.5, borderRadius: 2, fontWeight: 800, fontSize: '0.8rem', border: 1,
                  borderColor: todo ? '#F59E0B' : 'divider', bgcolor: todo ? 'rgba(245,158,11,0.12)' : 'transparent' }}>
                {format(parseISO(d.date), 'dd/MM')} {todo ? '🍽' : '✓'}
              </ButtonBase>
            );
          })}
        </Box>
      </CardContent>
      <Dialog open={!!day} onClose={() => setOpen(null)} fullWidth maxWidth="xs">
        <DialogTitle>Refeições · {day ? dayLabel(day.date) : ''}</DialogTitle>
        <DialogContent>{day && <MealConfirmList day={day} />}</DialogContent>
        <DialogActions><Button onClick={() => setOpen(null)}>Fechar</Button></DialogActions>
      </Dialog>
    </Card>
  );
}
