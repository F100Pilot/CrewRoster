import { useMemo, useState } from 'react';
import { Box, ButtonBase, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Button, Stack, Switch, Typography } from '@mui/material';
import { format, isSameMonth, parseISO } from 'date-fns';
import { useRoster } from '../state/useRoster';
import { baseOf } from '../domain/dutyStats';
import { MEAL_LABEL, raacoDays, type MealLine, type RaacoDay } from '../domain/raaco';
import { dayLabel } from '../utils/dates';
import { passOverline } from './PassCard';
import { MEAL_ICON } from './MealIcon';
import { euro } from '../utils/money';
import { todayISO } from '../domain/rosterWindow';

// The crew's word on the meals the Meal Plan is about (user, Nov 2026): on a past flight day, each meal the app
// counts as loaded — or pays because nothing carried it — can be marked "Havia a bordo" / "Não havia", and the abonos
// follow it (raaco.ts). Only those meals, never every flight: the calendar shows 🍽 on such days.


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
  m.meal === 'supper'
    ? m.crew === true ? 'retirada do abono (marcado por ti)' : `paga ${m.value !== null ? euro(m.value) : '—'}${m.how === 'stay' ? ' (pernoita)' : ''}`
    : m.how === 'onboard'
    ? `a bordo${m.where && m.where !== 'a bordo' ? ` · ${m.where}` : ''}${m.crew === true ? ' (marcado por ti)' : ' (previsto)'}`
    : `paga ${m.value !== null ? euro(m.value) : '—'}${m.how === 'ground' ? ' (em terra)' : ''}${m.crew === false ? ' (marcado por ti)' : ''}`;

/** One switch per askable meal of a day (user, Nov 2026: "um botão para cada uma delas, por defeito ligado se previstas
 *  embarcar"): on = on board (0 €), off = not loaded, paid. The abonos follow it; "Repor" goes back to the plan. */
export function MealConfirmList({ day, why = false }: { day: RaacoDay; why?: boolean }) {
  const { setMealOnboard } = useRoster();
  const meals = day.meals.filter((m) => m.askable);
  return (
    <Stack spacing={0.25}>
      {meals.map((m) => {
        const Icon = MEAL_ICON[m.meal];
        return (
          <Box key={m.key} display="flex" alignItems="center" gap={1}>
            <Icon sx={{ fontSize: 20, color: (m.meal === 'supper' ? m.crew !== true : m.how === 'onboard') ? '#0F766E' : 'text.disabled', flexShrink: 0 }} />
            <Box flexGrow={1} minWidth={0}>
              <Typography variant="body2" fontWeight={800} lineHeight={1.2}>{MEAL_LABEL[m.meal]}</Typography>
              <Typography variant="caption" color="text.secondary" display="block">{appSays(m)}</Typography>
              {why && <Typography variant="caption" color="text.secondary" display="block" sx={{ opacity: 0.8 }}>{m.why}</Typography>}
            </Box>
            {m.crew !== undefined && <Button size="small" onClick={() => setMealOnboard(m.key, null)}>Repor</Button>}
            {m.meal === 'supper' ? (
              // The supper's switch = paid (never loaded): on by default, off takes it off the statement.
              <Switch checked={m.crew !== true} onChange={(e) => setMealOnboard(m.key, !e.target.checked)}
                slotProps={{ input: { 'aria-label': 'Ceia paga' } }} />
            ) : (
              <Switch checked={m.how === 'onboard'} onChange={(e) => setMealOnboard(m.key, e.target.checked)}
                slotProps={{ input: { 'aria-label': `${MEAL_LABEL[m.meal]} a bordo` } }} />
            )}
          </Box>
        );
      })}
    </Stack>
  );
}

/** The calendar's banner: the month's flown days with meals to confirm; a tap opens that day's list. */
export function MealConfirmBanner({ month }: { month: Date }) {
  const { setMealOnboard } = useRoster();
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
          Liga ou desliga cada refeição conforme estava a bordo (“Está certo” se foi como previsto) — os abonos seguem o que marcares.
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
        <DialogActions>
          {day && day.meals.some((m) => m.askable && m.crew === undefined) && (
            <Button onClick={() => { for (const m of day.meals) if (m.askable && m.crew === undefined) setMealOnboard(m.key, m.meal !== 'supper' && m.how === 'onboard'); setOpen(null); }}>
              Está certo
            </Button>
          )}
          <Button onClick={() => setOpen(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
