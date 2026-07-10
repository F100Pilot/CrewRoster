import { useEffect, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { Bedtime, Close, DeleteOutline, WbSunny } from '@mui/icons-material';
import type { LogbookRow } from '../domain/types';
import { logbookRowKey } from '../storage/rosterStore';
import { sectorSun } from '../domain/sectorSun';

// Edit (or add) a single logbook row by hand. Saving marks the row `edited` so roster
// re-imports never overwrite the correction; the key is rebuilt from date/flight/route so
// changing any of those re-files the row (the old one is removed by the caller).
export interface LogbookEditResult { row: LogbookRow; previousKey: string | null }

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function LogbookEditDialog({
  open, userId, initial, onClose, onSave, onDelete,
}: {
  open: boolean;
  userId: string;
  initial: LogbookRow | null; // null → add a new row
  onClose: () => void;
  onSave: (result: LogbookEditResult) => void;
  onDelete?: (key: string) => void;
}) {
  const [date, setDate] = useState('');
  const [flight, setFlight] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [off, setOff] = useState('');
  const [on, setOn] = useState('');
  const [aircraft, setAircraft] = useState('');
  const [reg, setReg] = useState('');
  // Who was Pilot Flying for the take-off / the landing (day vs night is derived below).
  const [toSelf, setToSelf] = useState(true);
  const [ldgSelf, setLdgSelf] = useState(true);

  useEffect(() => {
    if (!open) return;
    setDate(initial?.date ?? new Date().toISOString().slice(0, 10));
    setFlight(initial?.flightNumber ?? '');
    setFrom(initial?.from ?? '');
    setTo(initial?.to ?? '');
    setOff(initial?.off ?? '');
    setOn(initial?.on ?? '');
    setAircraft(initial?.aircraft ?? '');
    setReg(initial?.reg ?? '');
    setToSelf(initial?.toSelf !== false);
    setLdgSelf(initial?.ldgSelf !== false);
  }, [open, initial]);

  const upper = (s: string) => s.trim().toUpperCase();
  const validDate = DATE_RE.test(date);
  const validOff = TIME_RE.test(off);
  const validOn = TIME_RE.test(on);
  const valid = validDate && flight.trim() && from.trim() && to.trim() && validOff && validOn;

  function save() {
    if (!valid) return;
    const row: LogbookRow = {
      key: logbookRowKey(userId, date, upper(flight), upper(from), upper(to)),
      userId,
      date,
      flightNumber: upper(flight),
      from: upper(from),
      to: upper(to),
      off,
      on,
      aircraft: aircraft.trim(),
      reg: upper(reg),
      regInferred: false,
      edited: true,
      toSelf,
      ldgSelf,
    };
    onSave({ row, previousKey: initial && initial.key !== row.key ? initial.key : null });
  }

  // Day/night for each end, from the sun at the respective airport/time (once the form is valid).
  const sun = validOff && validOn && from.trim() && to.trim() && validDate
    ? sectorSun(upper(from), upper(to), date, off, on) : null;
  const dayNightChip = (day: boolean | null | undefined) =>
    day == null
      ? <Chip size="small" variant="outlined" label="—" />
      : day
        ? <Chip size="small" icon={<WbSunny sx={{ color: '#ffb300 !important', fontSize: 15 }} />} label="Dia" variant="outlined" />
        : <Chip size="small" icon={<Bedtime sx={{ color: '#5c6bc0 !important', fontSize: 14 }} />} label="Noite" variant="outlined" />;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box flexGrow={1}>{initial ? 'Editar setor' : 'Adicionar setor'}</Box>
        <IconButton onClick={onClose} size="small" aria-label="Fechar"><Close fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            label="Data" type="date" value={date} size="small" fullWidth
            InputLabelProps={{ shrink: true }}
            inputProps={{ style: { fontSize: '0.8rem' } }}
            onChange={(e) => setDate(e.target.value)}
            error={!!date && !validDate}
          />
          <TextField
            label="Voo" value={flight} size="small" fullWidth
            placeholder="TP940"
            onChange={(e) => setFlight(e.target.value)}
          />
          <Box display="flex" gap={2}>
            <TextField label="De" value={from} size="small" fullWidth placeholder="LIS"
              onChange={(e) => setFrom(e.target.value)} inputProps={{ maxLength: 4 }} />
            <TextField label="Para" value={to} size="small" fullWidth placeholder="GVA"
              onChange={(e) => setTo(e.target.value)} inputProps={{ maxLength: 4 }} />
          </Box>
          <Box display="flex" gap={2}>
            <TextField label="Off (UTC)" value={off} size="small" fullWidth placeholder="08:12"
              onChange={(e) => setOff(e.target.value)} error={!!off && !validOff}
              helperText={off && !validOff ? 'HH:mm' : ' '} />
            <TextField label="On (UTC)" value={on} size="small" fullWidth placeholder="10:31"
              onChange={(e) => setOn(e.target.value)} error={!!on && !validOn}
              helperText={on && !validOn ? 'HH:mm' : ' '} />
          </Box>
          <Box display="flex" gap={2}>
            <TextField label="Aeronave" value={aircraft} size="small" fullWidth placeholder="E90"
              onChange={(e) => setAircraft(e.target.value)} />
            <TextField label="Matrícula" value={reg} size="small" fullWidth placeholder="CS-TPU"
              onChange={(e) => setReg(e.target.value)} />
          </Box>
          {/* Who flew the take-off / landing (Pilot Flying). Day vs night is computed from the sun. */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Piloto aos comandos (PF)
            </Typography>
            <Stack spacing={1}>
              <PfRow
                label="Descolagem" self={toSelf} onChange={setToSelf} chip={dayNightChip(sun?.depDay)}
              />
              <PfRow
                label="Aterragem" self={ldgSelf} onChange={setLdgSelf} chip={dayNightChip(sun?.arrDay)}
              />
            </Stack>
          </Box>

          <Typography variant="caption" color="text.secondary">
            Horas em UTC (z). Dia/noite calculado pelo nascer/pôr do sol. Guardar marca o setor
            como editado — não é substituído ao reimportar a escala.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {initial && onDelete && (
          <Button color="error" startIcon={<DeleteOutline />} onClick={() => onDelete(initial.key)}>
            Apagar
          </Button>
        )}
        <Box flexGrow={1} />
        <Button onClick={onClose} color="inherit">Cancelar</Button>
        <Button onClick={save} variant="contained" disabled={!valid}>Guardar</Button>
      </DialogActions>
    </Dialog>
  );
}

// One "who flew it" row: a label, an Eu/Colega toggle, and the computed day/night chip.
function PfRow({
  label, self, onChange, chip,
}: {
  label: string;
  self: boolean;
  onChange: (v: boolean) => void;
  chip: React.ReactNode;
}) {
  return (
    <Box display="flex" alignItems="center" gap={1}>
      <Typography variant="body2" sx={{ width: 88 }}>{label}</Typography>
      <ToggleButtonGroup
        exclusive size="small" value={self ? 'me' : 'other'}
        onChange={(_, v) => { if (v != null) onChange(v === 'me'); }}
      >
        <ToggleButton value="me" sx={{ px: 1.25, py: 0.25 }}>Eu</ToggleButton>
        <ToggleButton value="other" sx={{ px: 1.25, py: 0.25 }}>Colega</ToggleButton>
      </ToggleButtonGroup>
      <Box flexGrow={1} />
      {chip}
    </Box>
  );
}
