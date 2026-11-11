import { useEffect, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, InputAdornment, MenuItem, Stack, Switch, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import { getPaySettings, setPaySettings } from '../storage/settings';
import { PAY_CATEGORIES, pensionLines, perDiemDefaults, unionBaseAuto, unionFee, type PayCategory, type PaySettings } from '../domain/payEstimate';
import { IRS_TABLES, type IrsTable } from '../domain/irsWithholding';

const EUR2 = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const cents = (v: number) => Math.round(v * 100) / 100;

// `veTech` and `extrasOther` are what's left of VE / the complements once the command lines are
// typed apart (the union fee's base leaves those out); the stored totals stay `ve` and `extras`.
type MoneyField = 'vb' | 'veTech' | 'veCommand' | 'vs' | 'extrasOther' | 'chiefBonus' | 'perDiemA' | 'perDiemB' | 'instructorSession' | 'lineTrainingDay' | 'lineCheck'
  | 'officeDay' | 'mealTicket'
  | 'nonTaxableFixed' | 'fixedDeductions' | 'exemptNationalIrs' | 'exemptNationalSs' | 'exemptAbroadIrs' | 'exemptAbroadSs'
  | 'unionPct' | 'unionBase';

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
  const money = (field: MoneyField, label: string, helper?: string, placeholder = '0') => (
    <TextField
      label={label}
      placeholder={placeholder}
      InputLabelProps={{ shrink: true }}
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
            Aparece na aba Vencimento, em baixo. Os teus valores ficam só neste dispositivo (e na cópia de segurança).
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
                {money('lineCheck', 'Line check (cada)')}
                {money('officeDay', 'Subs. gabinete (dia GAB)')}
                {money('mealTicket', 'Sub. alimentação (dia)')}
              </Box>
              <Typography variant="caption" color="text.secondary">
                Per diem pela tabela A2.2 do AE ("sujeito a confirmação"). Instrutor: sessões OPC_INS / LPC_INS e o
                2.º dia do check; line training por dia com voos LIFUS_INS ou FAM_INS; line check por cada um — a escala não
                o marca, conta-os no cartão do Vencimento. 0 se não és instrutor.
                Gabinete por dia GAB; subsídio de alimentação por dia em terra na base (isento, vai para o cartão-refeição).
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
    lineTrainingDay: f(s.lineTrainingDay), lineCheck: f(s.lineCheck ?? 0), officeDay: f(s.officeDay ?? 0), mealTicket: f(s.mealTicket ?? 0), nonTaxableFixed: f(s.nonTaxableFixed), fixedDeductions: f(s.fixedDeductions),
    exemptNationalIrs: f(s.exemptNationalIrs), exemptNationalSs: f(s.exemptNationalSs),
    exemptAbroadIrs: f(s.exemptAbroadIrs), exemptAbroadSs: f(s.exemptAbroadSs),
    unionPct: f(s.unionPct), unionBase: f(s.unionBase),
  };
}
