import { Box, Tooltip } from '@mui/material';
import { DinnerDining, FreeBreakfast, LunchDining, NightsStay } from '@mui/icons-material';
import type { SvgIconComponent } from '@mui/icons-material';
import { MEAL_LABEL, type Meal } from '../domain/raaco';

// One icon per meal (user, Nov 2026: the flights' card shows the meals the Meal Plan puts on board; the legend lives in
// the codes page). Used in the Lista card, the day's RAACO card and the calendar's meal banner.
export const MEAL_ICON: Record<Meal, SvgIconComponent> = {
  breakfast: FreeBreakfast,
  lunch: LunchDining,
  dinner: DinnerDining,
  supper: NightsStay,
};
export const MEAL_SHORT: Record<Meal, string> = { breakfast: 'PA', lunch: 'AL', dinner: 'JA', supper: 'CE' };

/** The meals loaded on board that day, as small icons (each with its name on hover / long press). */
export function MealIcons({ meals, color = '#0F766E' }: { meals: Meal[]; color?: string }) {
  if (!meals.length) return null;
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, color }} aria-label={`Refeições: ${meals.map((m) => (m === 'supper' ? 'ceia paga' : `${MEAL_LABEL[m]} a bordo`)).join(', ')}`}>
      {meals.map((m) => {
        const Icon = MEAL_ICON[m];
        return <Tooltip key={m} title={m === 'supper' ? 'Ceia paga' : `${MEAL_LABEL[m]} a bordo`}><Icon sx={{ fontSize: 18 }} /></Tooltip>;
      })}
    </Box>
  );
}
