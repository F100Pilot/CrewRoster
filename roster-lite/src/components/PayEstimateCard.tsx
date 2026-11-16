import InfoCollapse from './InfoCollapse';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Box, Button, Card, CardContent, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { Add, ChevronLeft, ChevronRight, Edit, ExpandLess, ExpandMore, Payments, Remove } from '@mui/icons-material';
import { netEstimate, payEstimate, type Credit } from '../domain/payEstimate';
import { depth } from '../theme';
import { getPaySettingsFor, patchPayGlobal } from '../storage/settings';
import { setViewedPayMonth } from './settingsEvents';
import { ExperimentalChip } from './AeDisclaimer';
import { formatDuration } from '../utils/duration';
import type { ParsedDuty } from '../domain/types';
import { todayISO } from '../domain/rosterWindow';
import { evalExpression } from '../utils/calc';

const hoursText = (h: number) => h.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro'];
// Always to the cent, as on the payslip (user: no rounding).
const EUR = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  // Each month with the figures saved for it (a later raise never changes the months before).
  const [settings, setSettings] = useState(() => getPaySettingsFor(userId, month));
  useEffect(() => {
    const reload = () => setSettings(getPaySettingsFor(userId, month));
    reload();
    window.addEventListener('pay-settings-updated', reload);
    return () => window.removeEventListener('pay-settings-updated', reload);
  }, [userId, month]);
  // Settings → Vencimento edits the payslip open here.
  useEffect(() => { setViewedPayMonth(month); return () => setViewedPayMonth(null); }, [month]);
  const [showDays, setShowDays] = useState(false);
  const r = useMemo(() => payEstimate(duties, month, settings, today, base), [duties, month, settings, today, base]);
  // The payslip before's figures: the payroll withholds this payslip's IRS on its fixed pay and the variable on that month.
  const [prevSettings, setPrevSettings] = useState(() => getPaySettingsFor(userId, shiftMonth(month, -1)));
  useEffect(() => {
    const reload = () => setPrevSettings(getPaySettingsFor(userId, shiftMonth(month, -1)));
    reload();
    window.addEventListener('pay-settings-updated', reload);
    return () => window.removeEventListener('pay-settings-updated', reload);
  }, [userId, month]);
  const n = useMemo(() => netEstimate(r, settings, prevSettings), [r, settings, prevSettings]);
  const pct = (part: number, of: number) => `${((of > 0 ? part / of : 0) * 100).toFixed(2).replace('.', ',')}%`;
  // Flown days of the month the app only knows as flown (no roster printed before them): the report is then the actual
  // departure − 1 h, later than the planned one after a delay, so the duty comes out shorter than the roster's [DT] and
  // the duty-pay too (a tester's August 2026: 4h22 short; an expert: "sem a inicial não bate certo"; user, 0.9.3.70).
  const noPlanDates = useMemo(() => [...new Set(duties
    .filter((d) => d.date.startsWith(month) && (d.dutyType === 'Flight Duty' || d.dutyType === 'Positioning')
      && !!d.flightNumber && d.settled && !d.planned && !d.planKnown)
    .map((d) => d.date))].sort(), [duties, month]);

  // Tick: this payslip carries the holiday subsidy. Untick: not this one — back to the roster's
  // month if that's another one, otherwise "none seen yet" for the year.
  const onHolidayTick = (on: boolean) => {
    const year = Number(shiftMonth(month, 1).slice(0, 4));
    const m = Number(shiftMonth(month, 1).slice(5, 7));
    const auto = payEstimate(duties, month, { ...settings, holidayPay: null }, today, base).holidayPayMonth;
    const holidayPay = on ? { year, month: m } : auto && auto !== m ? null : { year, month: 0 };
    patchPayGlobal(userId, { holidayPay });
  };
  // Line checks come from the roster (W_INS days); − / + corrects the month's count, and going back
  // to the roster's number drops the correction.
  const setLineChecks = (n: number) => {
    const lineChecks = { ...(settings.lineChecks ?? {}) };
    if (n === r.lineChecksAuto) delete lineChecks[month]; else lineChecks[month] = Math.max(0, n);
    patchPayGlobal(userId, { lineChecks });
  };
  // Ground instruction hours: the roster's sessions unless the pilot typed the month's hours (done or planned).
  const [editHours, setEditHours] = useState(false);
  const [hoursInput, setHoursText] = useState('');
  const saveHours = (value: number | null) => {
    const instructionHours = { ...(settings.instructionHours ?? {}) };
    if (value === null || Math.round(value * 100) === Math.round(r.groundInstructionHoursAuto * 100)) delete instructionHours[month];
    else instructionHours[month] = Math.max(0, Math.round(value * 100) / 100);
    patchPayGlobal(userId, { instructionHours });
    setEditHours(false);
  };
  const typedHours = evalExpression(hoursInput);
  if (!settings.enabled) return null;
  const subsidyCount = (r.holidaySubsidy > 0 ? 1 : 0) + (r.christmasSubsidy > 0 ? 1 : 0);
  const subsidyNames = [r.holidaySubsidy > 0 && 'subsídio de férias', r.christmasSubsidy > 0 && 'subsídio de Natal'].filter(Boolean).join(' e ');
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
            Mete o teu VB, VE e VS em Definições → Vencimento para ver os valores.
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
                  {EUR.format(n.gross)}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  base + variável de {monthName(month)}{subsidyNames ? ` + ${subsidyNames}` : ''}{r.includesPlanned ? ' (inclui o planeado)' : ''}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                  Líquido <b>{EUR.format(n.net)}</b>
                </Typography>
              </Box>
            )}

            {noPlanDates.length > 0 && (
              <Alert severity="warning" sx={{ my: 0.75 }}>
                <strong>Falta a escala do início do mês</strong> em {noPlanDates.length} {noPlanDates.length === 1 ? 'dia de voo' : 'dias de voo'}{' '}
                ({noPlanDates.slice(0, 6).map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`).join(', ')}{noPlanDates.length > 6 ? '…' : ''}).
                A app só tem as horas voadas e conta a apresentação a partir da partida real, por isso o duty-pay pode estar
                abaixo do real. Importa o PDF da escala tirado antes destes voos.
              </Alert>
            )}

            <Stack spacing={0.75} mt={0.5}>
              <CreditBar label="Duty-pay" c={r.duty} chosen={r.overtime === 'duty'} showValue={hasVb} />
              <CreditBar label="Block-pay" c={r.block} chosen={r.overtime === 'block'} showValue={hasVb} />
              {r.holidayDays + r.officeCutDays + r.simCutDays > 0 && (
                <Typography variant="caption" color="text.secondary">
                  Plafonds reduzidos por {[
                    r.holidayDays > 0 ? `${r.holidayDays} ${r.holidayDays === 1 ? 'dia' : 'dias'} de férias` : '',
                    r.officeCutDays > 0 ? `${r.officeCutDays} ${r.officeCutDays === 1 ? 'dia' : 'dias'} de gabinete` : '',
                    r.simCutDays > 0 ? `${r.simCutDays} ${r.simCutDays === 1 ? 'dia' : 'dias'} de simulador como instrutor` : '',
                  ].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' e $1')}.
                </Typography>
              )}
            </Stack>

            {hasVb && (
              <Stack spacing={0.25} mt={1}>
                <Row label="Base (VB + VE + VS + outros fixos)" value={r.rb - r.pensionContribution} />
                {r.pensionContribution > 0 && (
                  <Row label={`Fundo pensões contr. PGA (6,5%${subsidyCount ? ', com subsídio' : ''})`} value={r.pensionContribution + n.subsidyPensionContribution} />
                )}
                <Row label={`Horas acima do plafond (${r.overtime === 'block' ? 'block-pay' : 'duty-pay'})`} value={r.overtimeValue} />
                {/* Tap to list the days, to check them one by one against the payslip's per diem lines. */}
                <Box onClick={() => setShowDays((v) => !v)} sx={{ cursor: 'pointer' }} role="button" aria-expanded={showDays}>
                  <Row
                    label={<>Per diem: {r.perDiemA} A + {r.perDiemB} B {showDays ? <ExpandLess sx={{ fontSize: 16, verticalAlign: 'middle' }} /> : <ExpandMore sx={{ fontSize: 16, verticalAlign: 'middle' }} />}</>}
                    value={r.perDiemValue}
                  />
                </Box>
                {showDays && (
                  <Box sx={{ borderRadius: 1.5, bgcolor: 'action.hover', px: 1, py: 0.5, my: 0.25 }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      <strong>A</strong> — dias {r.perDiemDates.a.map(dayNum).join(', ') || '—'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      <strong>B</strong> — dias {r.perDiemDates.b.map(dayNum).join(', ') || '—'}
                    </Typography>
                  </Box>
                )}
                {r.complementDays > 0 && <Row label={`Prestação complementar: ${r.complementDays} ${r.complementDays === 1 ? 'dia' : 'dias'}`} value={r.complementValue} />}
                {r.extensions > 0 && <Row label={`Extensões do comandante: ${r.extensions} × 2h`} value={r.extensionValue} />}
                {/* Shown even with no fee typed yet, so sessions found in the roster don't go unnoticed. */}
                {r.instructorSessions > 0 && (
                  <Row
                    label={`Simulador como instrutor: ${r.instructorSessions} ${r.instructorSessions === 1 ? 'sessão' : 'sessões'}${settings.allSimsPaid ? ' (todas pagas)' : ''}${settings.instructorSession ? '' : ' · falta o valor nas Definições'}`}
                    value={r.instructorValue}
                  />
                )}
                {r.lineTrainingDays > 0 && (
                  <Row
                    label={`Line training como instrutor: ${r.lineTrainingDays} ${r.lineTrainingDays === 1 ? 'dia' : 'dias'}${settings.lineTrainingDay ? '' : ' · falta o valor nas Definições'}`}
                    value={r.lineTrainingValue}
                  />
                )}
                {/* The pilot types the hours done or planned for the month (✎) — the roster's sessions by default; "Repor" goes back. */}
                {(r.groundInstructionHoursAuto > 0 || settings.instructionHours?.[month] !== undefined || settings.groundInstructionHour > 0) && (
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1, minWidth: 0 }}>
                      Instrução em terra: {hoursText(r.groundInstructionHours)} h
                      {settings.instructionHours?.[month] !== undefined ? ` · corrigido (escala: ${hoursText(r.groundInstructionHoursAuto)} h)` : ' · pelas sessões FP…_INST'}
                      {settings.groundInstructionHour ? '' : ' · falta o valor nas Definições'}
                    </Typography>
                    <IconButton size="small" aria-label="Corrigir as horas de instrução em terra" onClick={() => { setHoursText(hoursText(r.groundInstructionHours)); setEditHours(true); }}><Edit fontSize="small" /></IconButton>
                    <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{EUR.format(r.groundInstructionValue)}</Typography>
                  </Box>
                )}
                {(r.lineChecks > 0 || r.lineChecksAuto > 0 || settings.lineCheck > 0) && (
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1, minWidth: 0 }}>
                      Line checks: {r.lineChecks}{r.lineChecks !== r.lineChecksAuto ? ` · corrigido (escala: ${r.lineChecksAuto})` : r.lineChecks > 0 ? ' · pela escala' : ''}{r.lineChecks > 0 && !settings.lineCheck ? ' · falta o valor nas Definições' : ''}
                    </Typography>
                    <IconButton size="small" aria-label="Menos um line check" disabled={r.lineChecks === 0} onClick={() => setLineChecks(r.lineChecks - 1)}><Remove fontSize="small" /></IconButton>
                    <IconButton size="small" aria-label="Mais um line check" onClick={() => setLineChecks(r.lineChecks + 1)}><Add fontSize="small" /></IconButton>
                    <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{EUR.format(r.lineCheckValue)}</Typography>
                  </Box>
                )}
                {r.officeDays > 0 && (
                  <Row
                    label={`Subsídio de gabinete: ${r.officeDays} ${r.officeDays === 1 ? 'dia' : 'dias'} GAB${!settings.officeDay ? ' · não pagos' : r.officePaidDays !== r.officeDays ? ` · ${r.officePaidDays} ${r.officePaidDays === 1 ? 'pago' : 'pagos'}` : ''}`}
                    value={r.officeValue}
                  />
                )}
                {r.mealTicketDays > 0 && (
                  <Row label={`Subsídio de alimentação: ${r.mealTicketDays} ${r.mealTicketDays === 1 ? 'dia' : 'dias'} em terra na base (cartão)`} value={r.mealTicketValue} />
                )}
                {r.reducedMinutes > 0 && <Row label={`Descansos reduzidos: ${formatDuration(r.reducedMinutes)}`} value={r.reductionValue} />}
                {r.offDays > 0 && (
                  <Row label={`Voos em dia de folga (cl. 13): ${r.offDays} ${r.offDays === 1 ? 'dia' : 'dias'} · ${formatDuration(r.offDayMinutes)} — 3% VB/h + 15% VB/dia, fora dos plafonds`} value={r.offDayValue} />
                )}
                {r.holidaySubsidy > 0 && <Row label="Subsídio de férias (42 dias, cl. 7)" value={r.holidaySubsidy} />}
                {r.christmasSubsidy > 0 && <Row label="Subsídio de Natal (cl. 8)" value={r.christmasSubsidy} />}
                {/* The roster rarely shows the long holidays months ahead, so the pilot can confirm or
                    correct the month here; it's kept per year. */}
                <FormControlLabel
                  sx={{ ml: -0.75, my: -0.25 }}
                  control={<Checkbox size="small" checked={r.holidaySubsidy > 0} onChange={(e) => onHolidayTick(e.target.checked)} />}
                  label={
                    <Typography variant="body2" color="text.secondary">
                      Subsídio de férias neste recibo
                      {r.holidaySubsidy > 0 && r.holidayPayAuto ? ' · pela escala' : ''}
                      {r.holidaySubsidy === 0 && r.holidayPayMonth ? ` · ${r.holidayPayAuto ? 'pela escala' : 'marcado'}: recibo de ${MONTHS_LONG[r.holidayPayMonth - 1]}` : ''}
                    </Typography>
                  }
                />
                <Box sx={{ borderTop: 1, borderColor: 'divider', my: 0.5 }} />
                <Row label="Bruto" value={n.gross} strong />
                {n.prevIrsBase > 0 ? (
                  <>
                    <Row label={`IRS de ${monthName(shiftMonth(month, 1))}, só o fixo (${pct(n.irs, n.irsBase)} de ${EUR.format(n.irsBase)})`} value={-n.irs} />
                    <Row
                      label={`IRS de ${monthName(month)} refeito com o variável (${pct(n.prevIrs, n.prevIrsBase)} de ${EUR.format(n.prevIrsBase)}, menos ${EUR.format(n.prevIrsWithheld)} já retidos)`}
                      value={-(n.prevIrs - n.prevIrsWithheld)}
                    />
                  </>
                ) : (
                  <Row label={`IRS (${(n.irsRate * 100).toFixed(2).replace('.', ',')}% de ${EUR.format(n.irsBase)})`} value={-n.irs} />
                )}
                {n.priorYearIrs > 0 && (
                  <Row
                    label={`IRS do variável de dezembro, ano anterior (${((n.priorYearIrs / n.priorYearIrsBase) * 100).toFixed(2).replace('.', ',')}% de ${EUR.format(n.priorYearIrsBase)})`}
                    value={-n.priorYearIrs}
                  />
                )}
                {n.subsidyIrs > 0 && <Row label="IRS dos subsídios (retenção à parte)" value={-n.subsidyIrs} />}
                <Row label="Segurança Social (11%)" value={-n.ss} />
                {n.pensionDeposit > 0 && <Row label="Depósito f. pensões SIPLA (7,5%)" value={-n.pensionDeposit} />}
                {n.union > 0 && <Row label={`Sindicato (${String(settings.unionPct).replace('.', ',')}%)`} value={-n.union} />}
                {/* A commander who hasn't typed the command lines apart gets them in the union base. */}
                {n.union > 0 && settings.category === 'CTE' && !settings.unionBase && !settings.veCommand && !settings.chiefBonus && (
                  <Typography variant="caption" color="warning.main" display="block" lineHeight={1.3}>
                    Para a quota sair certa, separa a "Anuid. Comando" e o "Prémio de chefia" em Definições → Vencimento.
                  </Typography>
                )}
                {n.mealCard > 0 && <Row label="Cartão-refeição (o subsídio vai para o cartão)" value={-n.mealCard} />}
                {n.fixedDeductions > 0 && <Row label="Outros descontos fixos" value={-n.fixedDeductions} />}
                <Row label="Líquido" value={n.net} strong />
              </Stack>
            )}

            {/* Help text, closed (user, Nov 2026: "este último texto devia estar colapsado"). */}
            <Box mt={0.75}>
              <InfoCollapse card={false} title="Como se calcula">
                <Typography variant="caption" color="text.secondary" display="block" lineHeight={1.35}>
                  O variável (per diem incluído) é pago no mês seguinte. IRS pelas tabelas de retenção de 2026 (continente), como
                  no recibo: o do mês só sobre o fixo, e o do mês anterior refeito com o variável que agora se paga (menos o
                  que já tinha sido retido); em janeiro, o variável de dezembro à parte. Não prevê outras correções de meses
                  passados. Noturno 23h–06h e feriados em hora de Lisboa, somados às outras
                  alíneas da cl. 12.2 (o feriado a dobrar no duty-pay e no block-pay). Nos dias de formação ou de exames médicos com duas sessões desconta 1 h de almoço no duty-pay. O simulador dado como instrutor não conta no duty nem no block, e os DHC desse dia contam a 50%; como instruendo conta tudo. Cada dia de férias ou de gabinete reduz os plafonds. Subsídios sobre todos os fixos: férias = 42 dias (fixos ÷ 30 × 42), Natal = um mês (cl. 7 e
                  8), com IRS retido à parte, SS e fundo de pensões. Line checks: um por dia com voos W_INS, ou FAM_INS e LIFUS_INS juntos — corrige com − / + se
                  não bater. Voos em dia de folga (cl. 13) e reduções de repouso (cl. 2.8) contam quando marcados no dia. Não
                  inclui split-duty nem o acerto anual dos plafonds (março). Confirma sempre no recibo.
                </Typography>
              </InfoCollapse>
            </Box>
          </>
        )}
      </CardContent>
      <Dialog open={editHours} onClose={() => setEditHours(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pb: 1 }}>Horas de instrução em terra</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <TextField
            fullWidth size="small" label="Horas" value={hoursInput} onChange={(e) => setHoursText(e.target.value)}
            inputProps={{ inputMode: 'decimal' }} InputProps={{ endAdornment: <InputAdornment position="end">h</InputAdornment> }}
            error={hoursInput.trim() !== '' && typedHours === null}
          />
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => saveHours(null)}>Repor a escala</Button>
          <Button variant="contained" disabled={typedHours === null} onClick={() => saveHours(typedHours)}>Guardar</Button>
        </DialogActions>
      </Dialog>
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
      <Box position="relative" height={12} mt={0.5} borderRadius="6px" overflow="hidden"
        sx={(t) => ({ background: depth(t.palette.mode).well, boxShadow: depth(t.palette.mode).wellShadow })}
        role="img" aria-label={`${label}: ${formatDuration(c.credited)} de ${formatDuration(c.l1)} (Limite 1) e ${formatDuration(c.l2)} (Limite 2)`}>
        <Box position="absolute" left={0} top={0} bottom={0} width={pct(c.credited)} bgcolor={tone} sx={{ opacity: chosen ? 1 : 0.6, borderRadius: '6px', boxShadow: 'inset 0 2px 0 rgba(255,255,255,.5), inset 0 -3px 0 rgba(0,0,0,.18)' }} />
        {[c.l1, c.l2].map((l) => (
          <Box key={l} position="absolute" top={0} bottom={0} left={pct(l)} width="2px" bgcolor="text.primary" sx={{ opacity: 0.5 }} />
        ))}
      </Box>
    </Box>
  );
}

const dayNum = (iso: string) => String(Number(iso.slice(8, 10)));

function Row({ label, value, strong }: { label: ReactNode; value: number; strong?: boolean }) {
  return (
    <Box display="flex" gap={1} alignItems="baseline">
      <Typography variant="body2" color={strong ? 'text.primary' : 'text.secondary'} fontWeight={strong ? 700 : 400} sx={{ flexGrow: 1, minWidth: 0 }}>{label}</Typography>
      <Typography variant="body2" fontWeight={strong ? 700 : 600} sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{EUR.format(value)}</Typography>
    </Box>
  );
}
