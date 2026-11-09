import { useEffect, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, InputAdornment, MenuItem, Stack, Switch, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import { getPaySettings, setPaySettings } from '../storage/settings';
import { PAY_CATEGORIES, pensionLines, perDiemDefaults, unionFee, type PayCategory, type PaySettings } from '../domain/payEstimate';
import { IRS_TABLES, type IrsTable } from '../domain/irsWithholding';

const EUR2 = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const cents = (v: number) => Math.round(v * 100) / 100;

type MoneyField = 'vb' | 've' | 'vs' | 'extras' | 'perDiemA' | 'perDiemB' | 'instructorSession' | 'lineTrainingDay'
  | 'nonTaxableFixed' | 'fixedDeductions' | 'perDiemExemptIrs' | 'perDiemExemptSs' | 'unionPct' | 'unionBase';

// Settings for the experimental pay estimate: off by default; once on, the pilot's own figures
// from the payslip. Saved as typed, on this device only.
export default function PaySettingsSection({ userId }: { userId: string }) {
  const [s, setS] = useState<PaySettings>(() => getPaySettings(userId));
  // The text of each money field as typed, so "1234," doesn't jump while editing.
  const [text, setText] = useState<Record<MoneyField, string>>(() => toText(getPaySettings(userId)));
  useEffect(() => {
    const next = getPaySettings(userId);
    setS(next);
    setText(toText(next));
  }, [userId]);

  const save = (next: PaySettings) => { setS(next); setPaySettings(userId, next); };
  // The two halves of the section: what is paid, and what the payslip takes off.
  const [part, setPart] = useState<'valores' | 'descontos'>('valores');

  const onMoney = (field: MoneyField, raw: string) => {
    setText((t) => ({ ...t, [field]: raw }));
    const v = Number(raw.replace(/\s/g, '').replace(',', '.'));
    if (raw.trim() === '' || Number.isFinite(v)) save({ ...s, [field]: raw.trim() === '' ? 0 : Math.max(0, v) });
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

  const money = (field: MoneyField, label: string, helper?: string) => (
    <TextField
      label={label}
      value={text[field]}
      onChange={(e) => onMoney(field, e.target.value)}
      size="small"
      fullWidth
      inputMode="decimal"
      helperText={helper}
      InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }}
      inputProps={{ inputMode: 'decimal', autoComplete: 'off' }}
    />
  );

  const pension = pensionLines(s);
  const sectionTitle = (t: string) => (
    <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, lineHeight: 1.6 }}>{t}</Typography>
  );

  return (
    <Stack spacing={1.5}>
      <Box display="flex" alignItems="center" gap={1}>
        <Box flexGrow={1}>
          <Typography variant="subtitle2">Mostrar a estimativa (experimental)</Typography>
          <Typography variant="body2" color="text.secondary">
            Em Limites e AE. Os teus valores ficam só neste dispositivo (e na cópia de segurança).
          </Typography>
        </Box>
        <Switch
          checked={s.enabled}
          onChange={(e) => save({ ...s, enabled: e.target.checked, pensionAuto: s.pensionAuto || (e.target.checked && !s.vb) })}
          inputProps={{ 'aria-label': 'Mostrar a estimativa de vencimento' }}
        />
      </Box>

      {s.enabled && (
        <>
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
                {/* The sum to check against the payslip: every fixed line of the month, added up. */}
                <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {EUR2.format(s.vb + s.ve + s.vs + s.extras + pension.contribution)}
                </Typography>
              </Box>
              <TextField
                select size="small" fullWidth label="Categoria" value={s.category}
                onChange={(e) => onCategory(e.target.value as PayCategory)}
              >
                {PAY_CATEGORIES.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
              </TextField>
              {money('vb', 'Vencimento de categoria (VB)', 'No recibo: "Vencimento base". Base das horas a mais (3% / 6% do VB)')}
              {money('ve', 'VE (exercício)', 'Todas as anuidades: "Anuid. técnicas" + "Anuid. técnica Comando"')}
              {money('vs', 'VS (senioridade)', '"Venc. seniorid." + "Diuturnidades"')}
              {money('extras', 'Outros fixos por mês', s.pensionAuto ? 'Ex.: "Prémio de chefia", "Compl. Comandante Sénior"' : 'Ex.: "Prémio de chefia", "Compl. Comandante Sénior", "Fundo pensões contr. PGA"')}
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

              {sectionTitle('Variável (pago no mês seguinte)')}
              <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5}>
                {money('perDiemA', 'Per diem A')}
                {money('perDiemB', 'Per diem B')}
                {money('instructorSession', 'Sessão simulador (instr.)')}
                {money('lineTrainingDay', 'Line training (dia)')}
              </Box>
              <Typography variant="caption" color="text.secondary">
                Per diem pela tabela A2.2 do AE ("sujeito a confirmação"). Instrutor: sessões OPC_INS / LPC_INS e o
                2.º dia do check; line training por dia com voos LIFUS_INS ou FAM_INS. 0 se não és instrutor.
              </Typography>
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
              {/* Union fee as a % of a base; with it on, the fixed deductions no longer carry it. */}
              <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5}>
                <TextField
                  label="Quota sindical" value={text.unionPct} onChange={(e) => onMoney('unionPct', e.target.value)}
                  size="small" fullWidth
                  InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                  inputProps={{ inputMode: 'decimal', autoComplete: 'off' }}
                />
                {money('unionBase', 'Base')}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }}>
                {s.unionPct
                  ? 'Base vazia = VB + VE + VS. Com a quota em %, não metas o sindicato nos outros descontos.'
                  : 'Ex.: 1%. Deixa 0 se preferires meter o valor do sindicato nos outros descontos.'}
              </Typography>
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
                  <Typography variant="body2" fontWeight={600}>Avançado · isenções</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={1.5}>
                    <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5}>
                      {money('perDiemExemptIrs', 'Isento IRS / dia fora')}
                      {money('perDiemExemptSs', 'Isento SS / dia fora')}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      O per diem dos dias fora (voo ou estadia) tem uma parte isenta; o dos dias na base ("… T" no recibo)
                      é tributado por inteiro. Por omissão, a média de recibos reais.
                    </Typography>
                    {money('nonTaxableFixed', 'Fixos sem IRS nem SS', s.pensionAuto ? 'O fundo de pensões já está tratado; normalmente 0' : 'Ex.: "Fundo pensões contr. PGA"')}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            </Stack>
          )}
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
    vb: f(s.vb), ve: f(s.ve), vs: f(s.vs), extras: f(s.extras),
    perDiemA: f(s.perDiemA), perDiemB: f(s.perDiemB), instructorSession: f(s.instructorSession),
    lineTrainingDay: f(s.lineTrainingDay), nonTaxableFixed: f(s.nonTaxableFixed), fixedDeductions: f(s.fixedDeductions),
    perDiemExemptIrs: f(s.perDiemExemptIrs), perDiemExemptSs: f(s.perDiemExemptSs),
    unionPct: f(s.unionPct), unionBase: f(s.unionBase),
  };
}
