import { useEffect, useRef, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, MenuItem, Paper, Stack, Switch, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { Calculate, ExpandMore } from '@mui/icons-material';
import CalculatorDialog from './CalculatorDialog';
import InfoCollapse from './InfoCollapse';
import { evalExpression, isExpression } from '../utils/calc';
import { getPayHistory, getPaySettings, getPaySettingsFor, patchPayGlobal, savePayVersion } from '../storage/settings';
import { getViewedPayMonth } from './settingsEvents';
import { payFiguresFromBackup, readBackupFile } from '../storage/backup';
import { DEFAULT_PAY_SETTINGS } from '../domain/payEstimate';
import { PAY_CATEGORIES, pensionLines, perDiemDefaults, unionBaseAuto, unionFee, type PayCategory, type PaySettings } from '../domain/payEstimate';
import { IRS_TABLES, type IrsTable } from '../domain/irsWithholding';

const EUR2 = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const cents = (v: number) => Math.round(v * 100) / 100;

// `veTech` and `extrasOther` are what's left of VE / the complements once the command lines are
// typed apart (the union fee's base leaves those out); the stored totals stay `ve` and `extras`.
type MoneyField = 'vb' | 'veTech' | 'veCommand' | 'vs' | 'extrasOther' | 'chiefBonus' | 'perDiemA' | 'perDiemB' | 'instructorSession' | 'lineTrainingDay' | 'groundInstructionHour' | 'lineCheck'
  | 'officeDay' | 'mealTicket'
  | 'nonTaxableFixed' | 'fixedDeductions' | 'exemptNationalIrs' | 'exemptNationalSs' | 'exemptAbroadIrs' | 'exemptAbroadSs'
  | 'unionPct' | 'unionBase';

const MONTHS_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const shiftMonth = (key: string, by: number) => {
  const idx = Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1 + by;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
};
const monthsBetween = (a: string, b: string) =>
  (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
// A version is keyed by the WORK month (the pay card's "Trabalho de …"); the crew think in payslips,
// so it's named by the payslip that work is paid on — the month after.
const payslipOf = (workMonth: string) => {
  const p = shiftMonth(workMonth, 1);
  return `recibo de ${MONTHS_PT[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
};

// Settings for the experimental pay estimate: off by default; once on, the pilot's own figures
// from the payslip, on this device only. Edits are a draft until Guardar (user: "tem de existir um
// botão de salvar"), and each Guardar is a version from a chosen payslip on — the months before keep
// the figures they had (user: "nunca pode alterar os valores anteriores").
export default function PaySettingsSection({ userId, onDirtyChange }: { userId: string; onDirtyChange?: (dirty: boolean) => void }) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  // The payslip the form shows: the one open on the Vencimento page, else the next one. Its own
  // figures are loaded (an older payslip may have had others), and Guardar applies only the fields
  // edited here (user, 0.9.3.47: "quando altero um valor específico num recibo do mês, não está a gravar").
  const [viewed, setViewed] = useState(() => getViewedPayMonth() ?? thisMonth);
  const [loaded, setLoaded] = useState<PaySettings>(() => getPaySettingsFor(userId, viewed));
  const [s, setS] = useState<PaySettings>(loaded);
  // The text of each money field as typed, so "1234," doesn't jump while editing.
  const [text, setText] = useState<Record<MoneyField, string>>(() => toText(loaded));
  const [dirty, setDirty] = useState(false);
  // "A partir de um recibo" starts at the payslip open on the Vencimento page (user, 0.9.3.55: saved from the next payslip
  // by default, a switch turned on for January never reached January).
  const [from, setFrom] = useState(viewed);
  // Guardar for that payslip alone (the default when another payslip than the next is open), or
  // from a chosen payslip on. Chosen in a dialog, so nothing sits over the field being typed.
  const [only, setOnly] = useState(viewed !== thisMonth);
  const [askSave, setAskSave] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const load = () => {
    const v = getViewedPayMonth() ?? thisMonth;
    const next = getPaySettingsFor(userId, v);
    setViewed(v);
    setLoaded(next);
    setS(next);
    setText(toText(next));
    setDirty(false);
    setFrom(v);
    setOnly(v !== thisMonth);
    setAskSave(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [userId]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  const save = (next: PaySettings) => { setS(next); setDirty(true); setSavedNote(null); };
  const commit = () => {
    const target = only ? viewed : from;
    // Only the fields edited here change, on the target's own figures — another payslip must not
    // take the other figures shown in the form.
    const draft = s as unknown as Record<string, unknown>;
    const was = loaded as unknown as Record<string, unknown>;
    const edited: Record<string, unknown> = {};
    for (const k of Object.keys(draft)) if (JSON.stringify(draft[k]) !== JSON.stringify(was[k])) edited[k] = draft[k];
    const values = { ...(target ? getPaySettingsFor(userId, target) : getPaySettings(userId)), ...edited } as unknown as PaySettings;
    // From a payslip on: only the edited fields reach the later payslips, each keeping its own other figures.
    savePayVersion(userId, target, values, only, only ? undefined : (edited as Partial<PaySettings>));
    load();
    setSavedNote(only ? `Guardado só para o ${payslipOf(viewed)}. Os outros recibos ficam como estavam.`
      : !from ? 'Guardado para todos os meses.'
        : `Guardado: vale a partir do ${payslipOf(from)}. Os recibos anteriores ficam como estavam.`);
  };
  // Recover figures lost to an overwrite from a backup file — into the draft, never saved by itself.
  const backupInput = useRef<HTMLInputElement>(null);
  const [recoverMsg, setRecoverMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const recover = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { backup } = await readBackupFile(file);
      const figures = payFiguresFromBackup(backup, userId);
      if (!figures) { setRecoverMsg({ ok: false, text: 'Esta cópia de segurança não tem valores do vencimento.' }); return; }
      const next: PaySettings = { ...DEFAULT_PAY_SETTINGS, ...(figures as Partial<PaySettings>), enabled: s.enabled, holidayPay: s.holidayPay, lineChecks: s.lineChecks };
      setS(next);
      setText(toText(next));
      setDirty(true);
      setSavedNote(null);
      setRecoverMsg({ ok: true, text: `Valores recuperados da cópia de ${backup.createdAt ? new Date(backup.createdAt).toLocaleDateString('pt-PT') : 'segurança'} (VB ${EUR2.format(next.vb)}). Confere e carrega em Guardar, escolhendo a partir de que recibo valem.` });
    } catch (e) {
      setRecoverMsg({ ok: false, text: e instanceof Error ? e.message : 'Não foi possível ler o ficheiro.' });
    }
  };
  const history = getPayHistory(userId);
  const inForce = [...history].reverse().find((v) => v.from <= viewed) ?? history[0];
  // The two halves of the section: what is paid, and what the payslip takes off.
  const [part, setPart] = useState<'valores' | 'descontos'>('valores');

  const onMoney = (field: MoneyField, raw: string) => {
    setText((t) => ({ ...t, [field]: raw }));
    // A sum typed in the field ("69 + 236,38") counts as its result; a half-typed one waits. A plain
    // number goes through the same reader, so it's taken as the payslip writes it: "7.413,47" is
    // 7413,47 € (Number() read "7.413" as 7,41 € and refused "7.413,47", leaving that behind).
    const v = evalExpression(raw) ?? NaN;
    if (raw.trim() !== '' && !Number.isFinite(v)) return;
    const n = raw.trim() === '' ? 0 : Math.max(0, v);
    const cmd = s.veCommand ?? 0;
    const chief = s.chiefBonus ?? 0;
    switch (field) {
      case 'veTech': return save({ ...s, ve: cents(n + cmd) });
      case 'veCommand': return save({ ...s, veCommand: n, ve: cents(s.ve - cmd + n) });
      case 'extrasOther': return save({ ...s, extras: cents(n + chief) });
      case 'chiefBonus': return save({ ...s, chiefBonus: n, extras: cents(s.extras - chief + n) });
      default: return save({ ...s, [field]: n });
    }
  };

  // Changing the category moves the per diem to that category's AE value, unless the pilot had
  // typed their own.
  const onCategory = (category: PayCategory) => {
    const was = perDiemDefaults(s.category);
    const now = perDiemDefaults(category);
    const next = {
      ...s, category,
      perDiemA: s.perDiemA === was.a ? now.a : s.perDiemA,
      perDiemB: s.perDiemB === was.b ? now.b : s.perDiemB,
    };
    save(next);
    setText(toText(next));
  };

  // Hand-typed pension lines (as the settings told the pilot before) are recognised by value and
  // moved between the fields and the automatic calculation.
  const onPension = (on: boolean) => {
    const p = pensionLines({ ...s, pensionAuto: true });
    const near = (a: number, b: number) => Math.abs(a - b) < 0.02;
    let next: PaySettings = { ...s, pensionAuto: on };
    if (on && near(s.nonTaxableFixed, p.contribution)) {
      next = {
        ...next,
        nonTaxableFixed: 0,
        extras: Math.max(0, cents(s.extras - p.contribution)),
        fixedDeductions: s.fixedDeductions >= p.deposit - 0.01 ? cents(s.fixedDeductions - p.deposit) : s.fixedDeductions,
      };
    } else if (!on && s.pensionAuto) {
      next = { ...next, nonTaxableFixed: cents(s.nonTaxableFixed + p.contribution), extras: cents(s.extras + p.contribution), fixedDeductions: cents(s.fixedDeductions + p.deposit) };
    }
    save(next);
    setText(toText(next));
  };

  // Labels always sit on the border: an empty field otherwise draws its label across the € / %
  // sign, which on a phone made "Quota sindical" unreadable. The placeholder says what empty means.
  // Each money field has a calculator (🧮) for sums of payslip lines; a sum can also be typed
  // straight in — it shows "= …" while editing and becomes the number when the field is left.
  const [calc, setCalc] = useState<{ field: MoneyField; label: string } | null>(null);
  const showSum = (field: MoneyField) => {
    const t = text[field];
    if (!isExpression(t)) return undefined;
    const v = evalExpression(t);
    return v === null ? 'Conta incompleta' : `= ${EUR2.format(v)}`;
  };
  const settle = (field: MoneyField) => {
    const t = text[field];
    const v = isExpression(t) ? evalExpression(t) : null;
    if (v !== null) setText((x) => ({ ...x, [field]: String(Math.max(0, v)).replace('.', ',') }));
  };
  const money = (field: MoneyField, label: string, helper?: string, placeholder = '0') => (
    <TextField
      label={label}
      placeholder={placeholder}
      InputLabelProps={{ shrink: true }}
      value={text[field]}
      onChange={(e) => onMoney(field, e.target.value)}
      onBlur={() => settle(field)}
      size="small"
      fullWidth
      inputMode="decimal"
      helperText={showSum(field) ?? helper}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end" sx={{ gap: 0.25 }}>
            <IconButton size="small" edge="end" aria-label={`Calculadora · ${label}`} onClick={() => setCalc({ field, label })} sx={{ mr: 0.25 }}>
              <Calculate fontSize="small" />
            </IconButton>
            €
          </InputAdornment>
        ),
      }}
      inputProps={{ inputMode: 'decimal', autoComplete: 'off' }}
    />
  );
  const calculator = (
    <CalculatorDialog
      open={!!calc}
      label={calc?.label ?? ''}
      initial={calc ? text[calc.field] : ''}
      onUse={(v) => { if (calc) onMoney(calc.field, String(v).replace('.', ',')); }}
      onClose={() => setCalc(null)}
    />
  );

  const pension = pensionLines(s);
  const sectionTitle = (t: string) => (
    <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, lineHeight: 1.6 }}>{t}</Typography>
  );

  return (
    <Stack spacing={1.5}>
      {calculator}
      <Box display="flex" alignItems="center" gap={1}>
        <Box flexGrow={1}>
          <Typography variant="subtitle2">Mostrar a estimativa (experimental)</Typography>
          <Typography variant="body2" color="text.secondary">
            Aparece na aba Vencimento, em baixo. Os teus valores ficam só neste dispositivo (e na cópia de segurança).
          </Typography>
        </Box>
        <Switch
          checked={s.enabled}
          onChange={(e) => {
            // The switch isn't a figure: it applies at once, to every month.
            const on = e.target.checked;
            patchPayGlobal(userId, { enabled: on });
            setS((x) => ({ ...x, enabled: on, pensionAuto: x.pensionAuto || (on && !x.vb) }));
            if (on && !s.vb && !s.pensionAuto) savePayVersion(userId, '', { ...s, enabled: on, pensionAuto: true });
          }}
          inputProps={{ 'aria-label': 'Mostrar a estimativa de vencimento' }}
        />
      </Box>

      {s.enabled && (
        <>
          <Typography variant="caption" color="text.secondary">
            {`Valores do ${payslipOf(viewed)}${viewed === thisMonth ? ' (o próximo)' : ''}`}
            {inForce.from ? ` · em vigor desde o ${payslipOf(inForce.from)}` : ''}
            {history.length > 1 ? ` · ${history.length - 1} ${history.length === 2 ? 'versão anterior guardada' : 'versões anteriores guardadas'} (os recibos antigos usam-nas)` : ''}.
            {' '}Alterações só contam depois de Guardar.
          </Typography>
          {savedNote && <Alert severity="success" onClose={() => setSavedNote(null)}>{savedNote}</Alert>}
          {recoverMsg && <Alert severity={recoverMsg.ok ? 'info' : 'warning'} onClose={() => setRecoverMsg(null)}>{recoverMsg.text}</Alert>}
          <Box>
            <Button size="small" variant="text" onClick={() => backupInput.current?.click()} sx={{ px: 0.5 }}>
              Recuperar valores de uma cópia de segurança
            </Button>
            <input ref={backupInput} type="file" accept=".json,application/json" hidden
              onChange={(e) => { void recover(e.target.files?.[0]); e.target.value = ''; }} />
          </Box>
          <ToggleButtonGroup
            exclusive fullWidth size="small" color="primary" value={part}
            onChange={(_, v: 'valores' | 'descontos' | null) => v && setPart(v)}
          >
            <ToggleButton value="valores">Valores</ToggleButton>
            <ToggleButton value="descontos">Descontos</ToggleButton>
          </ToggleButtonGroup>

          {part === 'valores' ? (
            <Stack spacing={1.5}>
              <Box display="flex" alignItems="baseline">
                <Box flexGrow={1}>{sectionTitle('Fixo por mês')}</Box>
                {/* The sum of what is typed below — nothing added: with the automatic pension, the PGA's
                    6,5% sat in this total too, so 1 € typed showed 1,07 € ("está a majorar", crew). That
                    contribution has its own line in the pension box and on the pay card. */}
                <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {EUR2.format(s.vb + s.ve + s.vs + s.extras)}
                </Typography>
              </Box>
              <TextField
                select size="small" fullWidth label="Categoria" value={s.category}
                onChange={(e) => onCategory(e.target.value as PayCategory)}
              >
                {PAY_CATEGORIES.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
              </TextField>
              {money('vb', 'Vencimento de categoria (VB)', 'No recibo: "Vencimento base". Base das horas a mais (3% / 6% do VB)')}
              {/* VE and the complements are split so the command lines can be left out of the union fee's base. */}
              <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5}>
                {money('veTech', 'Anuid. técnicas')}
                {money('veCommand', 'Anuid. Comando')}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }}>
                VE (exercício) = as duas: {EUR2.format(s.ve)}. Sem comando, deixa a 2.ª a 0.
              </Typography>
              {money('vs', 'VS (senioridade)', '"Venc. seniorid." + "Diuturnidades"')}
              <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5}>
                {money('chiefBonus', 'Prémio de chefia')}
                {money('extrasOther', 'Outros fixos')}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }}>
                {s.pensionAuto
                  ? 'Outros fixos: ex. "Compl. Comandante Sénior".'
                  : 'Outros fixos: ex. "Compl. Comandante Sénior", "Fundo pensões contr. PGA".'}
              </Typography>
              {/* The pension plan (RRRGS cl. 16) from the RB itself, so it follows every VB update. Turning
                  it on takes the hand-typed lines back out of the fields they went into, so nothing is
                  counted twice; turning it off puts them back. */}
              <Box sx={{ borderRadius: 2, bgcolor: 'action.hover', px: 1.5, py: 1 }} display="flex" alignItems="center" gap={1}>
                <Box flexGrow={1}>
                  <Typography variant="body2" fontWeight={600}>Fundo de pensões pelo AE</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {s.pensionAuto
                      ? `Contr. PGA ${EUR2.format(pension.contribution)} (6,5%) · Depósito SIPLA ${EUR2.format(pension.deposit)} (7,5%)`
                      : 'PGA 6,5% · SIPLA 7,5% de VB + VE + VS (RRRGS cl. 16)'}
                  </Typography>
                </Box>
                <Switch checked={!!s.pensionAuto} onChange={(e) => onPension(e.target.checked)} inputProps={{ 'aria-label': 'Fundo de pensões pelo AE' }} />
              </Box>

              {/* RRRGS cl. 7 and 8: each subsidy is one RB, worked out on the pay card. */}
              {sectionTitle('Subsídios (cl. 7 e 8)')}
              <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }}>
                Sobre todos os fixos ({EUR2.format(s.vb + s.ve + s.vs + s.extras - (s.pensionAuto ? 0 : s.nonTaxableFixed || 0))}): férias = 42 dias
                (fixos ÷ 30 × 42), Natal = um mês. Natal no recibo de novembro. Férias no recibo
                do mês antes das primeiras férias de 10 dias úteis ou mais — automático pela escala, ou marca a caixa
                "Subsídio de férias neste recibo" no cartão do Vencimento.
              </Typography>

              {sectionTitle('Variável (pago no mês seguinte)')}
              <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5}>
                {money('perDiemA', 'Per diem A')}
                {money('perDiemB', 'Per diem B')}
                {money('instructorSession', 'Sessão simulador (instr.)')}
                {money('lineTrainingDay', 'Line training (dia)')}
                {money('groundInstructionHour', 'Instrução em terra (hora)')}
                {money('lineCheck', 'Line check (cada)')}
                {money('officeDay', 'Subs. gabinete (dia GAB)')}
                {money('mealTicket', 'Sub. alimentação (dia)')}
              </Box>
              {/* Task force: every simulator session is paid at the session fee, even the ones received. */}
              <Box display="flex" alignItems="center" gap={1}>
                <Typography variant="body2" sx={{ flexGrow: 1 }}>
                  Todas as sessões de simulador são pagas
                  <Typography component="span" variant="caption" color="text.secondary" display="block">
                    Taskforce: também as sessões em que recebes instrução. Desligado, contam só as marcadas _INS e o 2.º dia.
                  </Typography>
                </Typography>
                <Switch checked={!!s.allSimsPaid} onChange={(_, on) => save({ ...s, allSimsPaid: on })} inputProps={{ 'aria-label': 'Todas as sessões de simulador são pagas' }} />
              </Box>
              {/* Which GAB days of the month are paid, by their order — some chief bonuses pay only the 3rd to the 7th. */}
              <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5}>
                <TextField
                  select size="small" fullWidth label="GAB pago do" value={s.officeDayFrom ?? 1}
                  onChange={(e) => save({ ...s, officeDayFrom: Number(e.target.value) })}
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <MenuItem key={n} value={n}>{n}.º dia</MenuItem>)}
                </TextField>
                <TextField
                  select size="small" fullWidth label="Até ao" value={s.officeDayTo ?? 0}
                  onChange={(e) => save({ ...s, officeDayTo: Number(e.target.value) })}
                >
                  <MenuItem value={0}>Sem limite</MenuItem>
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <MenuItem key={n} value={n}>{n}.º dia</MenuItem>)}
                </TextField>
              </Box>
              <InfoCollapse title="Como se conta o variável" card={false}>
                <Typography variant="caption" color="text.secondary">
                Per diem pela tabela A2.2 do AE ("sujeito a confirmação"). Instrutor: sessões OPC_INS / LPC_INS e o
                2.º dia do check; line training por dia com voos LIFUS_INS ou FAM_INS; instrução em terra por hora das sessões
                FP…_INST (fora do duty-pay); line check por dia com voos W_INS, ou FAM_INS e LIFUS_INS juntos
                (corrige a contagem no cartão do Vencimento). 0 se não és instrutor.
                Gabinete por dia GAB, só os dias do mês entre o "GAB pago do" e o "Até ao" (ex.: do 3.º ao 7.º); subsídio de alimentação por dia em terra na base (isento, vai para o cartão-refeição).
                </Typography>
              </InfoCollapse>
            </Stack>
          ) : (
            <Stack spacing={1.5}>
              {sectionTitle('IRS')}
              <TextField
                select size="small" fullWidth label="Situação" value={s.irsTable ?? 'I'}
                onChange={(e) => save({ ...s, irsTable: e.target.value as IrsTable })}
                helperText={'No recibo: "Nº Titulares 2" → casado, dois titulares. Tabelas de retenção 2026, continente'}
              >
                {IRS_TABLES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
              </TextField>
              <TextField
                select size="small" fullWidth label="Dependentes" value={s.dependents ?? 0}
                onChange={(e) => save({ ...s, dependents: Number(e.target.value) })}
              >
                {[0, 1, 2, 3, 4, 5].map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
              </TextField>

              {sectionTitle('Descontos fixos')}
              {/* Union fee as a % of a base worked out from the fixed pay; with it on, the fixed
                  deductions no longer carry it. */}
              <TextField
                label="Quota sindical" value={text.unionPct} onChange={(e) => onMoney('unionPct', e.target.value)}
                placeholder="0" InputLabelProps={{ shrink: true }}
                size="small" fullWidth
                InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                inputProps={{ inputMode: 'decimal', autoComplete: 'off' }}
                helperText={s.unionPct
                  ? (s.category === 'CTE' && !s.unionBase && !s.veCommand && !s.chiefBonus
                    ? 'Separa a "Anuid. Comando" e o "Prémio de chefia" em Valores — senão entram na base da quota. '
                    : '') + `Base ${s.unionBase ? 'escrita à mão' : 'automática'}: ${EUR2.format(s.unionBase || unionBaseAuto(s))} — os fixos sem o prémio de chefia e a anuidade de Comando. Não metas o sindicato nos outros descontos.`
                  : 'Ex.: 1%. Deixa 0 se preferires meter o valor do sindicato nos outros descontos.'}
              />
              {money('fixedDeductions', 'Outros descontos fixos por mês',
                [`"Seguro saúde"`, s.unionPct ? null : '"Sindicato"', s.pensionAuto ? null : '"Depósito f. pensões-SIPLA"']
                  .filter(Boolean).join(' + '))}
              {/* What the estimate takes off by itself. */}
              <Stack spacing={0.5} sx={{ borderRadius: 2, bgcolor: 'action.hover', px: 1.5, py: 1 }}>
                {pension.deposit > 0 && <AutoLine label="Depósito f. pensões SIPLA (7,5%)" value={EUR2.format(pension.deposit)} />}
                {s.unionPct > 0 && <AutoLine label={`Sindicato (${String(s.unionPct).replace('.', ',')}%)`} value={EUR2.format(unionFee(s))} />}
                <AutoLine label="Segurança Social" value="11%" />
                <AutoLine label="IRS" value="tabela do mês" />
              </Stack>

              <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Typography variant="body2" fontWeight={600}>Avançado · isenções e base da quota</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={1.5}>
                    <Typography variant="body2" fontWeight={600}>Limite isento por dia fora</Typography>
                    <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5}>
                      {money('exemptNationalIrs', 'IRS · nacional')}
                      {money('exemptNationalSs', 'SS · nacional')}
                      {money('exemptAbroadIrs', 'IRS · estrangeiro')}
                      {money('exemptAbroadSs', 'SS · estrangeiro')}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      Por dia fora (voo ou estadia), o per diem mais os abonos de refeição desse dia ficam isentos até
                      ao limite — "estrangeiro" se o dia toca um aeroporto fora de Portugal — e o resto é tributado com o
                      ordenado. O per diem dos dias na base ("… T" no recibo) é tributado por inteiro. Valores tirados de
                      recibos reais (já com a redução por a empresa pagar o hotel); atualiza-os quando sair o Orçamento do Estado.
                    </Typography>
                    {money('unionBase', 'Base da quota sindical', 'Só se a automática não bater com o recibo; vazio = automática', 'automática')}
                    {money('nonTaxableFixed', 'Fixos sem IRS nem SS', s.pensionAuto ? 'O fundo de pensões já está tratado; normalmente 0' : 'Ex.: "Fundo pensões contr. PGA"')}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            </Stack>
          )}

          {/* Nothing is saved until here. One slim bar, so it never covers the field being typed (user,
              0.9.3.47); where the figures apply is chosen in the dialog Guardar opens. */}
          {dirty && (
            <Paper elevation={0} sx={{ position: 'sticky', bottom: 0, zIndex: 2, px: 1.5, py: 1, borderRadius: '16px', boxShadow: '0 -8px 20px -8px rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1, lineHeight: 1.3 }}>Alterações por guardar</Typography>
              <Button color="inherit" size="small" onClick={load}>Descartar</Button>
              <Button variant="contained" size="small" onClick={() => setAskSave(true)}>Guardar</Button>
            </Paper>
          )}
          <Dialog open={askSave} onClose={() => setAskSave(false)} fullWidth maxWidth="xs">
            <DialogTitle sx={{ pb: 1 }}>Guardar valores</DialogTitle>
            <DialogContent>
              <Stack spacing={1.5} sx={{ pt: 0.5 }}>
                <ToggleButtonGroup
                  exclusive size="small" fullWidth orientation="vertical" value={only ? 'only' : 'on'}
                  onChange={(_, v) => { if (v) setOnly(v === 'only'); }}
                  aria-label="Recibos a que se aplica"
                >
                  <ToggleButton value="only">Só o {payslipOf(viewed)}</ToggleButton>
                  <ToggleButton value="on">A partir de um recibo</ToggleButton>
                </ToggleButtonGroup>
                {!only && (
                  <TextField select size="small" fullWidth label="Aplicar a partir do" value={from} onChange={(e) => setFrom(e.target.value)}>
                    {Array.from({ length: Math.max(16, monthsBetween(viewed, thisMonth) + 4) }, (_, i) => shiftMonth(thisMonth, 3 - i)).map((m) => (
                      <MenuItem key={m} value={m}>{payslipOf(m)}{m === thisMonth ? ' (o próximo)' : ''}</MenuItem>
                    ))}
                    <MenuItem value="">Todos os meses (corrigir um engano)</MenuItem>
                  </TextField>
                )}
                <Typography variant="caption" color="text.secondary">
                  {only ? 'Os outros recibos, antes e depois, ficam como estavam.'
                    : from ? 'Os recibos anteriores ficam como estavam.' : 'Vale para todos os recibos.'}
                  {' '}Só mudam os valores que alteraste.
                </Typography>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button color="inherit" onClick={() => setAskSave(false)}>Cancelar</Button>
              <Button variant="contained" onClick={commit}>Guardar</Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </Stack>
  );
}

function AutoLine({ label, value }: { label: string; value: string }) {
  return (
    <Box display="flex" gap={1}>
      <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>{label}</Typography>
      <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    </Box>
  );
}

function toText(s: PaySettings): Record<MoneyField, string> {
  const f = (v: number) => (v ? String(v).replace('.', ',') : '');
  return {
    vb: f(s.vb), veTech: f(cents(s.ve - (s.veCommand ?? 0))), veCommand: f(s.veCommand ?? 0), vs: f(s.vs),
    extrasOther: f(cents(s.extras - (s.chiefBonus ?? 0))), chiefBonus: f(s.chiefBonus ?? 0),
    perDiemA: f(s.perDiemA), perDiemB: f(s.perDiemB), instructorSession: f(s.instructorSession),
    lineTrainingDay: f(s.lineTrainingDay), groundInstructionHour: f(s.groundInstructionHour ?? 0), lineCheck: f(s.lineCheck ?? 0), officeDay: f(s.officeDay ?? 0), mealTicket: f(s.mealTicket ?? 0), nonTaxableFixed: f(s.nonTaxableFixed), fixedDeductions: f(s.fixedDeductions),
    exemptNationalIrs: f(s.exemptNationalIrs), exemptNationalSs: f(s.exemptNationalSs),
    exemptAbroadIrs: f(s.exemptAbroadIrs), exemptAbroadSs: f(s.exemptAbroadSs),
    unionPct: f(s.unionPct), unionBase: f(s.unionBase),
  };
}
