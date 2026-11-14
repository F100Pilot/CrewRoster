import { useMemo } from 'react';
import { Alert, Box, ButtonBase, Card, CardContent, Stack, Typography } from '@mui/material';
import { ChevronRight } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { baseOf } from '../domain/dutyStats';
import { MEAL_LABEL, raacoDays, type MealHow } from '../domain/raaco';
import { TimelineRow, passOverline } from './PassCard';
import { MealConfirmList } from './MealConfirm';
import InfoCollapse from './InfoCollapse';

// The day's meals under the RAACO (ROV-PGA 4.5): which are due, how each is met — loaded on a
// flight, on ground, as an allowance or in the stay — and what goes on the Abonos statement.

const HOW: Record<MealHow, { label: string; color: string }> = {
  onboard: { label: 'a bordo', color: '#1F63B5' },
  dhc: { label: 'DHC', color: '#546e7a' },
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
          <Box component="span" sx={{ mr: 1, px: 0.9, height: 20, display: 'inline-flex', alignItems: 'center', borderRadius: 10, bgcolor: '#F59E0B', color: '#1A1206', fontSize: '0.62rem', fontWeight: 900, letterSpacing: '0.05em' }}>
            EM TESTES
          </Box>
          <ButtonBase onClick={() => navigate('/abonos')} sx={{ ...passOverline, color: 'primary.main', borderRadius: 1, px: 0.5, minHeight: 28 }}>
            {day.total > 0 ? euro(day.total) : 'Abonos'} <ChevronRight sx={{ fontSize: 16 }} />
          </ButtonBase>
        </Box>
        {day.noPlan && (
          <Alert severity="warning" sx={{ mb: 1 }}>
            Sem a escala original deste dia: a app só tem as horas voadas, e as refeições embarcadas seguem o planeamento —
            estes abonos podem estar errados. Importa o PDF da escala impresso antes do voo.
          </Alert>
        )}
        <Stack spacing={0.75}>
          {/* Meals the crew can switch (on board / not) are in the list below, once. */}
          {day.meals.filter((m) => !m.askable).map((m, i) => (
            <TimelineRow key={i} wrapSub color={HOW[m.how].color} title={MEAL_LABEL[m.meal]}
              sub={m.why} right={m.value ? euro(m.value) : m.value === null ? 'sem valor' : HOW[m.how].label}
              rightSub={m.value ? HOW[m.how].label : m.where} />
          ))}
          {day.nights.map((n, i) => (
            <TimelineRow key={`n${i}`} color={HOW.stay.color} title="Pernoita" sub={`Estadia em ${n.where} (Tabela 34)`}
              right={n.value !== null ? euro(n.value) : 'sem valor'} />
          ))}
        </Stack>
        {day.meals.some((m) => m.askable) && (
          <Box mt={day.meals.some((m) => !m.askable) || day.nights.length ? 1.5 : 0} pt={day.meals.some((m) => !m.askable) || day.nights.length ? 1.25 : 0}
            sx={{ borderTop: day.meals.some((m) => !m.askable) || day.nights.length ? 1 : 0, borderColor: 'divider' }}>
            <Typography sx={passOverline}>A BORDO · LIGADO = EMBARCADA</Typography>
            {day.meals.some((m) => m.askable && m.meal === 'supper') && (
              <Typography sx={{ ...passOverline, mb: 0.5 }}>CEIA · LIGADO = PAGA</Typography>
            )}
            <MealConfirmList day={day} why />

          </Box>
        )}
        {/* Help text, closed (user, Nov 2026: "este último texto também pode ser colapsado"); the EM TESTES badge stays. */}
        <Box mt={1}>
          <InfoCollapse card={false} title="Como funciona">
            <Typography variant="caption" color="text.secondary" display="block">
              Os botões começam como no plano de refeições. Desliga uma refeição se não houve a bordo (irregularidade): passa a
              ser paga. A ceia nunca é embarcada — o botão diz se é paga (em pernoita, com a pernoita).
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
              Em fase experimental: estimativa pela escala (o Meal Plan e as irregularidades não estão nela). Confirma no extrato
              e envia feedback na página Abonos.
            </Typography>
          </InfoCollapse>
        </Box>
      </CardContent>
    </Card>
  );
}
