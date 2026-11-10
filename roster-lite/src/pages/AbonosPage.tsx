import { useMemo } from 'react';
import { Alert, Box, Button, ButtonBase, Card, CardContent, IconButton, Stack, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight, MailOutline, Science } from '@mui/icons-material';
import { addMonths, format, isSameMonth, parseISO, subMonths } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { useViewedMonth } from '../state/viewedMonth';
import { baseOf } from '../domain/dutyStats';
import { raacoDays, type RaacoDay } from '../domain/raaco';
import PageHero from '../components/PageHero';
import { passOverline } from '../components/PassCard';
import { monthLabel } from '../utils/dates';
import { APP_VERSION } from '../version';

// The same contact the app shows under Definições → Ajuda.
const FEEDBACK_TO = 'pflm.bet@gmail.com';

// The month's operational allowances (RAACO, ROV-PGA 4.5) as the company's "Abonos Operacionais"
// statement lays them out — one line per day, the same columns — so the two can be compared line
// by line. Paid apart from the salary, the month after.

export const euro = (v: number) => v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
// In rem, so the header (smaller type) and the rows share the same column widths.
const COLS = '2.4rem minmax(0, 1fr) 2.2rem repeat(4, 2.9rem)';

export default function AbonosPage() {
  const { roster, activeUser } = useRoster();
  const navigate = useNavigate();
  const [month, setMonth] = useViewedMonth();
  const base = baseOf(activeUser);
  const all = useMemo(() => (roster ? raacoDays(roster.duties, base) : new Map<string, RaacoDay>()), [roster, base]);
  const days = useMemo(
    () => [...all.values()].filter((d) => isSameMonth(parseISO(d.date), month) && (d.total > 0 || d.meals.length > 0 || d.nights.length > 0))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [all, month],
  );
  const paid = days.filter((d) => d.total > 0);
  const total = paid.reduce((s, d) => s + d.total, 0);
  const sum = (k: 'breakfast' | 'lunch' | 'dinner' | 'supperNight') => paid.reduce((s, d) => s + d[k], 0);
  const nights = days.reduce((s, d) => s + d.nights.length, 0);
  const onboard = days.reduce((s, d) => s + d.meals.filter((m) => m.how === 'onboard').length, 0);
  const unknown = days.some((d) => d.unknownRate);

  if (!roster) return <Typography color="text.secondary">Importa uma escala primeiro.</Typography>;

  return (
    <Stack spacing={2}>
      <PageHero
        back label="Abonos" pill="#FCD34D"
        title={euro(total)}
        subtitle={`${monthLabel(month)} · pagos à parte, com o vencimento de ${monthLabel(addMonths(month, 1)).split(' ')[0].toLowerCase()}`}
        stats={[
          { label: 'Dias com abono', value: String(paid.length) },
          { label: 'Pernoitas', value: String(nights) },
          { label: 'A bordo', value: String(onboard) },
        ]}
      >
        <Box display="flex" gap={1} mt={1}>
          <IconButton size="small" onClick={() => setMonth((m) => subMonths(m, 1))} aria-label="Mês anterior" sx={{ bgcolor: 'rgba(255,255,255,0.12)' }}><ChevronLeft /></IconButton>
          <IconButton size="small" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Mês seguinte" sx={{ bgcolor: 'rgba(255,255,255,0.12)' }}><ChevronRight /></IconButton>
        </Box>
      </PageHero>

      <ExperimentalBanner month={monthLabel(month)} total={euro(total)} />

      {days.length === 0 ? (
        <Alert severity="info">Sem abonos previstos para este mês.</Alert>
      ) : (
        <Card variant="outlined">
          <CardContent sx={{ px: 1.25, py: 1, '&:last-child': { pb: 1 } }}>
            {/* The statement's columns: Data · Início · Pernoita · Peq. almoço · Almoço · Jantar · Ceia/+Pernoita. */}
            <Box display="grid" gridTemplateColumns={COLS} gap={0.5} sx={{ ...passOverline, fontSize: '0.58rem', letterSpacing: 0, whiteSpace: 'nowrap', pb: 0.75, borderBottom: 1, borderColor: 'divider' }}>
              <span>DATA</span><span>INÍCIO</span><span>PERN.</span>
              <Box textAlign="right">P. ALM.</Box><Box textAlign="right">ALMOÇO</Box><Box textAlign="right">JANTAR</Box><Box textAlign="right" title="Ceia + pernoita">CEIA+P</Box>
            </Box>
            {days.map((d) => (
              <ButtonBase key={d.date} onClick={() => navigate(`/day/${d.date}`)}
                sx={{ display: 'grid', gridTemplateColumns: COLS, gap: 0.5, width: '100%', textAlign: 'left', py: 0.9, borderBottom: 1, borderColor: 'divider', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums', alignItems: 'center' }}>
                <Box fontWeight={700}>{format(parseISO(d.date), 'dd/MM')}</Box>
                <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 600 }}>{d.start ?? '—'}</Box>
                <Box sx={{ fontWeight: 700, color: 'primary.main' }}>{d.stay ?? ''}</Box>
                {[d.breakfast, d.lunch, d.dinner, d.supperNight].map((v, i) => (
                  <Box key={i} textAlign="right" sx={{ color: v ? 'text.primary' : 'text.disabled', fontWeight: v ? 700 : 400 }}>{v ? v.toFixed(2).replace('.', ',') : '0,00'}</Box>
                ))}
              </ButtonBase>
            ))}
            <Box display="grid" gridTemplateColumns={COLS} gap={0.5} sx={{ pt: 1, fontSize: '0.8rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              <Box gridColumn="1 / 4">Total {euro(total)}</Box>
              {[sum('breakfast'), sum('lunch'), sum('dinner'), sum('supperNight')].map((v, i) => (
                <Box key={i} textAlign="right">{v.toFixed(2).replace('.', ',')}</Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {unknown && (
        <Alert severity="info">Há estadias num país que não está na Tabela 34 (por exemplo Marrocos): esses valores não entram no total.</Alert>
      )}

      <Card variant="outlined">
        <CardContent>
          <Typography sx={passOverline}>COMO A APP CALCULA</Typography>
          <Typography component="ul" variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5, mb: 0, '& li': { mb: 0.5 } }}>
            <li>Refeição devida (Tabela 32, hora local): o serviço começa no horário, abrange-o ou acaba depois de ele começar; serviço até 3h00 dá uma refeição. Contam as horas planeadas, quando a app as viu antes do dia.</li>
            <li>Embarcada num setor com mais de 1h30 que voe dentro do horário dela (ou no primeiro setor, se o serviço começa no horário); uma por setor abaixo de 5h. Se não houver, Tabela 33: 5 € o pequeno-almoço, 18 € as principais — ao valor local quando o serviço acaba fora da base.</li>
            <li>Refeição em DHC: paga — ao valor local da Tabela 34 se o DHC acaba fora da base, Tabela 33 se regressa à base.</li>
            <li>Estadia fora da base: almoço, jantar e ceia ao valor da Tabela 34, mais a pernoita; o pequeno-almoço do hotel não é pago (como no extrato).</li>
            <li>Assistência em casa e serviço em terra na base não entram nestes abonos. Toca num dia para ver o porquê de cada refeição.</li>
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}

// A loud "in testing" notice (user request): the RAACO reading is new and has known gaps, so ask
// for feedback — an email already laid out for the comparison that helps most, app vs statement.
function ExperimentalBanner({ month, total }: { month: string; total: string }) {
  const subject = `Abonos RAACO — feedback (${month})`;
  const body = [
    `Mês: ${month}`, `Total na app: ${total}`, 'Total no extrato de Abonos Operacionais: ',
    '', 'Dias diferentes (data — app — extrato):', '', '', `Versão da app: ${APP_VERSION}`,
  ].join('\n');
  const href = `mailto:${FEEDBACK_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return (
    <Box sx={{ borderRadius: 3, overflow: 'hidden', border: 2, borderColor: '#F59E0B', bgcolor: (t) => (t.palette.mode === 'dark' ? '#2A1F0B' : '#FFF7E6') }}>
      <Box sx={{ bgcolor: '#F59E0B', color: '#1A1206', px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Science />
        <Typography sx={{ fontWeight: 900, letterSpacing: '0.06em', fontSize: '0.95rem' }}>FASE EXPERIMENTAL</Typography>
      </Box>
      <Box sx={{ px: 2, py: 1.5 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.3 }}>
          Os abonos estão em testes e precisam do teu feedback.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          São calculados pela escala, segundo o RAACO (ROV-PGA 4.5, Rev. 01): o Meal Plan, o que foi embarcado e as
          irregularidades não estão na escala, e há regras com mais de uma leitura. Não substituem o extrato de Abonos
          Operacionais — confirma sempre nele. Se um mês não bater certo, envia a diferença: é assim que o cálculo melhora.
        </Typography>
        <Button component="a" href={href} variant="contained" startIcon={<MailOutline />} sx={{ mt: 1.5, bgcolor: '#F59E0B', color: '#1A1206', '&:hover': { bgcolor: '#D98A06' } }}>
          Enviar feedback
        </Button>
      </Box>
    </Box>
  );
}
