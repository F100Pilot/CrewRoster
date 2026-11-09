import { useEffect, useState } from 'react';
import { Box, FormControlLabel, InputAdornment, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { getPaySettings, setPaySettings } from '../storage/settings';
import { PAY_CATEGORIES, pensionLines, perDiemDefaults, type PayCategory, type PaySettings } from '../domain/payEstimate';
import { IRS_TABLES, type IrsTable } from '../domain/irsWithholding';

const EUR2 = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const cents = (v: number) => Math.round(v * 100) / 100;

type MoneyField = 'vb' | 've' | 'vs' | 'extras' | 'perDiemA' | 'perDiemB' | 'instructorSession' | 'lineTrainingDay'
  | 'nonTaxableFixed' | 'fixedDeductions' | 'perDiemExemptIrs' | 'perDiemExemptSs';

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

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>Estimativa de vencimento (experimental)</Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Uma estimativa do bruto do mês pelas regras do RRRGS, em "Limites e AE". Os teus valores ficam
        <strong> só neste dispositivo</strong> (e na cópia de segurança, se a fizeres); ninguém mais os vê.
      </Typography>
      <FormControlLabel
        control={<Switch checked={s.enabled} onChange={(e) => save({ ...s, enabled: e.target.checked, pensionAuto: s.pensionAuto || (e.target.checked && !s.vb) })} />}
        label="Mostrar a estimativa"
      />
      {s.enabled && (
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <TextField
            select size="small" fullWidth label="Categoria" value={s.category}
            onChange={(e) => onCategory(e.target.value as PayCategory)}
          >
            {PAY_CATEGORIES.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
          </TextField>
          {money('vb', 'Vencimento de categoria (VB)', 'No recibo: "Vencimento base". É a base das horas a mais (3% / 6% do VB)')}
          {money('ve', 'VE (exercício)', 'Soma de TODAS as linhas de anuidades: "Anuid. técnicas" + "Anuid. técnica Comando"')}
          {money('vs', 'VS (senioridade)', 'Soma de "Venc. seniorid." + "Diuturnidades"')}
          {money('extras', 'Outros fixos por mês', s.pensionAuto ? 'Ex.: "Prémio de chefia", "Compl. Comandante Sénior"' : 'Ex.: "Prémio de chefia", "Compl. Comandante Sénior", "Fundo pensões contr. PGA"')}
          {/* The sum to check against the payslip: every fixed line of the month, added up. */}
          <Box display="flex" justifyContent="space-between" alignItems="baseline" px={0.5}>
            <Typography variant="body2" color="text.secondary">Parte fixa por mês (confere com o recibo)</Typography>
            <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {EUR2.format(s.vb + s.ve + s.vs + s.extras + pensionLines(s).contribution)}
            </Typography>
          </Box>
          <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5}>
            {money('perDiemA', 'Per diem A')}
            {money('perDiemB', 'Per diem B')}
          </Box>
          <Typography variant="caption" color="text.secondary">
            Per diem: valores da tabela A2.2 do AE ("sujeito a confirmação"). Muda-os se os teus forem outros.
          </Typography>
          {money('instructorSession', 'Sessão de simulador como instrutor', 'Por sessão: as marcadas OPC_INS / LPC_INS e o 2.º dia do check. 0 se não és instrutor')}
          {money('lineTrainingDay', 'Line training como instrutor', 'Por dia de voos marcados LIFUS_INS ou FAM_INS. 0 se não és instrutor')}

          {/* The pension plan (RRRGS cl. 16) from the RB itself, so it follows every VB update. Turning
              it on takes the hand-typed lines back out of the fields they went into, so nothing is
              counted twice; turning it off puts them back. */}
          <FormControlLabel
            control={<Switch checked={!!s.pensionAuto} onChange={(e) => onPension(e.target.checked)} />}
            label="Fundo de pensões calculado pelo AE (7,5% / 6,5%)"
          />
          {s.pensionAuto && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
              Contr. PGA {EUR2.format(pensionLines(s).contribution)} (6,5% de VB + VE + VS, sem IRS nem SS) · Depósito SIPLA{' '}
              {EUR2.format(pensionLines(s).deposit)} (7,5%) — não os metas nos campos.
            </Typography>
          )}

          {/* Below the gross line: what the payslip takes off. */}
          <Typography variant="subtitle2" sx={{ pt: 1 }}>Descontos (para o líquido)</Typography>
          <TextField
            select size="small" fullWidth label="Situação para o IRS" value={s.irsTable ?? 'I'}
            onChange={(e) => save({ ...s, irsTable: e.target.value as IrsTable })}
            helperText={'Vê no recibo: "Nº Titulares 2" → casado, dois titulares. Tabelas de retenção 2026, continente'}
          >
            {IRS_TABLES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
          </TextField>
          <TextField
            select size="small" fullWidth label="Dependentes" value={s.dependents ?? 0}
            onChange={(e) => save({ ...s, dependents: Number(e.target.value) })}
          >
            {[0, 1, 2, 3, 4, 5].map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
          </TextField>
          {money('nonTaxableFixed', 'Dos outros fixos, sem IRS nem SS', s.pensionAuto ? 'O fundo de pensões já é tratado acima; normalmente 0' : 'Ex.: "Fundo pensões contr. PGA"')}
          {money('fixedDeductions', 'Outros descontos fixos por mês', s.pensionAuto ? 'Soma de "Seguro saúde" + "Sindicato"' : 'Soma de "Seguro saúde" + "Sindicato" + "Depósito f. pensões-SIPLA"')}
          <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5}>
            {money('perDiemExemptIrs', 'Per diem isento/dia fora · IRS')}
            {money('perDiemExemptSs', 'Per diem isento/dia fora · SS')}
          </Box>
          <Typography variant="caption" color="text.secondary">
            O per diem dos dias fora (voo ou estadia) tem uma parte isenta; o dos dias na base ("… T" no recibo)
            é tributado por inteiro. Os valores por omissão são a média de recibos reais.
          </Typography>
        </Stack>
      )}
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
  };
}
