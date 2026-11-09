import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Card, CardContent, IconButton, Stack, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight, Payments } from '@mui/icons-material';
import { netEstimate, payEstimate, type Credit } from '../domain/payEstimate';
import { getPaySettings } from '../storage/settings';
import { ExperimentalChip } from './AeDisclaimer';
import { formatDuration } from '../utils/duration';
import type { ParsedDuty } from '../domain/types';

const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro'];
const EUR = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const shiftMonth = (key: string, by: number) => {
  const [y, m] = key.split('-').map(Number);
  const idx = y * 12 + (m - 1) + by;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
};
const monthName = (key: string) => MONTHS_LONG[Number(key.slice(5, 7)) - 1];

// The experimental gross pay estimate for one month worked: what the payslip of the month after
// should carry — the base pay plus that month's variable part (hours above the plafonds, per
// diem, extensions, reduced rests), which the RRRGS pays a month later. Shown only once the pilot
// turned it on in Settings; their figures never leave the device.
export default function PayEstimateCard({ duties, base, userId }: { duties: ParsedDuty[]; base: string; userId: string }) {
  const [settings, setSettings] = useState(() => getPaySettings(userId));
  useEffect(() => {
    const reload = () => setSettings(getPaySettings(userId));
    reload();
    window.addEventListener('pay-settings-updated', reload);
    return () => window.removeEventListener('pay-settings-updated', reload);
  }, [userId]);
  const today = new Date().toISOString().slice(0, 10);
  const [month, setMonth] = useState(today.slice(0, 7));
  const r = useMemo(() => payEstimate(duties, month, settings, today, base), [duties, month, settings, today, base]);
  const n = useMemo(() => netEstimate(r, settings), [r, settings]);

  if (!settings.enabled) return null;
  const paidIn = shiftMonth(month, 1);
  const hasVb = settings.vb > 0;

  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box display="flex" alignItems="center" gap={1}>
          <Payments fontSize="small" color="action" />
          <Typography variant="subtitle2" noWrap sx={{ flexGrow: 1 }}>Vencimento estimado</Typography>
          <ExperimentalChip />
        </Box>
        <Box display="flex" alignItems="center" justifyContent="center" my={0.25}>
          <IconButton size="small" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior"><ChevronLeft /></IconButton>
          <Typography variant="body2" fontWeight={600} sx={{ minWidth: 150, textAlign: 'center' }}>
            Trabalho de {monthName(month)}
          </Typography>
          <IconButton
            size="small" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mês seguinte"
            disabled={month >= shiftMonth(today.slice(0, 7), 1)}
          >
            <ChevronRight />
          </IconButton>
        </Box>

        {!hasVb && (
          <Alert severity="info" sx={{ py: 0, my: 0.5 }}>
            Mete o teu VB, VE e VS em Definições → Estimativa de vencimento para ver os valores.
          </Alert>
        )}

        {!r.covered ? (
          <Typography variant="caption" color="text.secondary" display="block">
            Sem escala guardada para {monthName(month)}.
          </Typography>
        ) : (
          <>
            {hasVb && (
              <Box textAlign="center" my={0.75}>
                <Typography variant="caption" color="text.secondary" display="block">
                  Recibo de {monthName(paidIn)} (bruto)
                </Typography>
                <Typography variant="h5" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  ≈ {EUR.format(r.rb + r.variable)}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  base + variável de {monthName(month)}{r.includesPlanned ? ' (inclui o planeado)' : ''}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                  Líquido ≈ <b>{EUR.format(n.net)}</b>
                </Typography>
              </Box>
            )}

            <Stack spacing={0.75} mt={0.5}>
              <CreditBar label="Duty-pay" c={r.duty} chosen={r.overtime === 'duty'} showValue={hasVb} />
              <CreditBar label="Block-pay" c={r.block} chosen={r.overtime === 'block'} showValue={hasVb} />
              {r.holidayDays > 0 && (
                <Typography variant="caption" color="text.secondary">
                  Plafonds reduzidos por {r.holidayDays} {r.holidayDays === 1 ? 'dia' : 'dias'} de férias.
                </Typography>
              )}
            </Stack>

            {hasVb && (
              <Stack spacing={0.25} mt={1}>
                <Row label="Base (VB + VE + VS + outros fixos)" value={r.rb - r.pensionContribution} />
                {r.pensionContribution > 0 && <Row label="Fundo pensões contr. PGA (6,5%)" value={r.pensionContribution} />}
                <Row label={`Horas acima do plafond (${r.overtime === 'block' ? 'block-pay' : 'duty-pay'})`} value={r.overtimeValue} />
                <Row label={`Per diem: ${r.perDiemA} A + ${r.perDiemB} B`} value={r.perDiemValue} />
                {r.complementDays > 0 && <Row label={`Prestação complementar: ${r.complementDays} ${r.complementDays === 1 ? 'dia' : 'dias'}`} value={r.complementValue} />}
                {r.extensions > 0 && <Row label={`Extensões do comandante: ${r.extensions} × 2h`} value={r.extensionValue} />}
                {r.instructorValue > 0 && <Row label={`Simulador como instrutor: ${r.instructorSessions} sessões`} value={r.instructorValue} />}
                {r.lineTrainingValue > 0 && <Row label={`Line training como instrutor: ${r.lineTrainingDays} ${r.lineTrainingDays === 1 ? 'dia' : 'dias'}`} value={r.lineTrainingValue} />}
                {r.reducedMinutes > 0 && <Row label={`Descansos reduzidos: ${formatDuration(r.reducedMinutes)}`} value={r.reductionValue} />}
                <Box sx={{ borderTop: 1, borderColor: 'divider', my: 0.5 }} />
                <Row label="Bruto" value={n.gross} strong />
                <Row label={`IRS (${(n.irsRate * 100).toFixed(1).replace('.', ',')}% de ${EUR.format(n.irsBase)})`} value={-n.irs} />
                <Row label="Segurança Social (11%)" value={-n.ss} />
                {n.pensionDeposit > 0 && <Row label="Depósito f. pensões SIPLA (7,5%)" value={-n.pensionDeposit} />}
                {n.fixedDeductions > 0 && <Row label="Outros descontos fixos" value={-n.fixedDeductions} />}
                <Row label="Líquido" value={n.net} strong />
              </Stack>
            )}

            <Typography variant="caption" color="text.disabled" display="block" mt={0.75} lineHeight={1.35}>
              O variável (per diem incluído) é pago no mês seguinte. IRS pelas tabelas de retenção de 2026 (continente); não prevê acertos de meses anteriores. Noturno 23h–06h e feriados nacionais em hora de Lisboa. Não inclui folgas
              trabalhadas, split-duty, subsídio de alimentação, subsídios de férias e Natal, nem o
              acerto anual dos plafonds (março).
              Confirma sempre no recibo.
            </Typography>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Credited hours against Limite 1 and Limite 2, as a bar with the two limits marked.
function CreditBar({ label, c, chosen, showValue }: { label: string; c: Credit; chosen: boolean; showValue: boolean }) {
  const scale = Math.max(c.l2 * 1.15, c.credited, 1);
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const tone = c.credited > c.l2 ? 'warning.main' : c.credited > c.l1 ? 'primary.main' : 'text.disabled';
  return (
    <Box>
      <Box display="flex" alignItems="baseline" gap={1}>
        <Typography variant="body2" fontWeight={chosen ? 700 : 500} sx={{ flexGrow: 1 }}>{label}</Typography>
        {showValue && (
          <Typography variant="body2" fontWeight={chosen ? 700 : 400} color={chosen ? 'text.primary' : 'text.secondary'}>
            {EUR.format(c.value)}
          </Typography>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatDuration(c.credited)} · Limite 1 {formatDuration(c.l1)} · Limite 2 {formatDuration(c.l2)}
      </Typography>
      <Box position="relative" height={8} mt={0.25} borderRadius={4} bgcolor="action.hover" overflow="hidden"
        role="img" aria-label={`${label}: ${formatDuration(c.credited)} de ${formatDuration(c.l1)} (Limite 1) e ${formatDuration(c.l2)} (Limite 2)`}>
        <Box position="absolute" left={0} top={0} bottom={0} width={pct(c.credited)} bgcolor={tone} sx={{ opacity: chosen ? 1 : 0.6 }} />
        {[c.l1, c.l2].map((l) => (
          <Box key={l} position="absolute" top={0} bottom={0} left={pct(l)} width="2px" bgcolor="text.primary" sx={{ opacity: 0.5 }} />
        ))}
      </Box>
    </Box>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <Box display="flex" gap={1} alignItems="baseline">
      <Typography variant="body2" color={strong ? 'text.primary' : 'text.secondary'} fontWeight={strong ? 700 : 400} sx={{ flexGrow: 1, minWidth: 0 }}>{label}</Typography>
      <Typography variant="body2" fontWeight={strong ? 700 : 600} sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{EUR.format(value)}</Typography>
    </Box>
  );
}
