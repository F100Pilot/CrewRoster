import { useEffect, useState } from 'react';
import { Box, FormControlLabel, InputAdornment, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { getPaySettings, setPaySettings } from '../storage/settings';
import { PAY_CATEGORIES, perDiemDefaults, type PayCategory, type PaySettings } from '../domain/payEstimate';

type MoneyField = 'vb' | 've' | 'vs' | 'extras' | 'perDiemA' | 'perDiemB' | 'instructorSession';

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
        control={<Switch checked={s.enabled} onChange={(e) => save({ ...s, enabled: e.target.checked })} />}
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
          {money('ve', 'VE (exercício)', 'Soma das anuidades técnicas (incl. as de Comando)')}
          {money('vs', 'VS (senioridade)', 'Soma do vencimento de senioridade e das diuturnidades')}
          {money('extras', 'Outros fixos por mês', 'Ex.: prémio de chefia, complemento de comandante, contribuição da PGA para o fundo de pensões')}
          <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5}>
            {money('perDiemA', 'Per diem A')}
            {money('perDiemB', 'Per diem B')}
          </Box>
          <Typography variant="caption" color="text.secondary">
            Per diem: valores da tabela A2.2 do AE ("sujeito a confirmação"). Muda-os se os teus forem outros.
          </Typography>
          {money('instructorSession', 'Sessão de simulador como instrutor', 'Por sessão (códigos …_INST na escala). 0 se não és instrutor')}
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
  };
}
