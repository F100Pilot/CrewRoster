import { useEffect, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { Bedtime, Close, DeleteOutline, WbSunny } from '@mui/icons-material';
import type { LogbookRow } from '../domain/types';
import { logbookRowKey } from '../storage/rosterStore';
import { hadLanding, hadTakeoff, isRampReturn } from '../domain/logbook';
import { sectorSun } from '../domain/sectorSun';
import { todayISO } from '../domain/rosterWindow';

// Edit (or add) a single logbook row by hand. Changing the flight data marks the row `edited`
// so roster re-imports never overwrite the correction (annotating who was Pilot Flying does
// not — see save()); the key is rebuilt from date/flight/route so changing any of those
// re-files the row (the old one is removed by the caller).
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
  // Who flew the take-off / the landing — or that there was none (a ramp return).
  const [toWho, setToWho] = useState<Who>('me');
  const [ldgWho, setLdgWho] = useState<Who>('me');
  // Until the pilot picks one, the choice follows the route: a ramp return has none.
  const [whoTouched, setWhoTouched] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setDate(initial?.date ?? todayISO());
    setFlight(initial?.flightNumber ?? '');
    setFrom(initial?.from ?? '');
    setTo(initial?.to ?? '');
    setOff(initial?.off ?? '');
    setOn(initial?.on ?? '');
    setAircraft(initial?.aircraft ?? '');
    setReg(initial?.reg ?? '');
    setToWho(!initial ? 'me' : !hadTakeoff(initial) ? 'none' : initial.toSelf === false ? 'other' : 'me');
    setLdgWho(!initial ? 'me' : !hadLanding(initial) ? 'none' : initial.ldgSelf === false ? 'other' : 'me');
    setNotes(initial?.notes ?? '');
    setWhoTouched(false);
  }, [open, initial]);

  // Typing the route (a new sector, or a corrected one): LIS→LIS switches to "Não houve", a real
  // route back to "Eu" — unless the pilot already chose.
  useEffect(() => {
    if (!open || whoTouched) return;
    const ramp = isRampReturn({ from: from.trim().toUpperCase(), to: to.trim().toUpperCase() });
    setToWho((w) => (ramp ? 'none' : w === 'none' ? 'me' : w));
    setLdgWho((w) => (ramp ? 'none' : w === 'none' ? 'me' : w));
  }, [open, from, to, whoTouched]);

  const upper = (s: string) => s.trim().toUpperCase();
  const validDate = DATE_RE.test(date);
  const validOff = TIME_RE.test(off);
  const validOn = TIME_RE.test(on);
  const valid = validDate && flight.trim() && from.trim() && to.trim() && validOff && validOn;

  function save() {
    if (!valid) return;
    // `edited` freezes the row against roster syncs, protecting a manual correction. Only the
    // flight data earns that: annotating who was Pilot Flying says nothing about the times, and
    // freezing on it would stop a flown sector from ever picking up its final times from a later
    // download. So mark the row edited only when the flight data itself actually changed.
    const flightDataChanged = !initial ||
      initial.date !== date ||
      initial.flightNumber !== upper(flight) ||
      initial.from !== upper(from) ||
      initial.to !== upper(to) ||
      initial.off !== off ||
      initial.on !== on ||
      initial.aircraft !== aircraft.trim() ||
      initial.reg !== upper(reg);
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
      regInferred: flightDataChanged ? false : (initial.regInferred ?? false),
      edited: flightDataChanged ? true : initial.edited,
      toSelf: toWho !== 'other',
      ldgSelf: ldgWho !== 'other',
      // "Não houve" is stored; "there was one" only needs storing against the ramp-return default.
      toNone: toWho === 'none' ? true : isRampReturn({ from: upper(from), to: upper(to) }) ? false : undefined,
      ldgNone: ldgWho === 'none' ? true : isRampReturn({ from: upper(from), to: upper(to) }) ? false : undefined,
      // Notes, like PF, never freeze the row against roster syncs.
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(initial?.pic ? { pic: initial.pic } : {}),
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
                label="Descolagem" who={toWho} onChange={(v) => { setWhoTouched(true); setToWho(v); }} chip={dayNightChip(sun?.depDay)}
              />
              <PfRow
                label="Aterragem" who={ldgWho} onChange={(v) => { setWhoTouched(true); setLdgWho(v); }} chip={dayNightChip(sun?.arrDay)}
              />
            </Stack>
          </Box>

          <TextField
            label="Notas" value={notes} size="small" fullWidth multiline minRows={2} maxRows={5}
            InputLabelProps={{ shrink: true }}
            placeholder="Ex.: aproximação RNP, vento cruzado, observador no cockpit…"
            onChange={(e) => setNotes(e.target.value)}
            inputProps={{ maxLength: 300 }}
            helperText="Aparecem na caderneta (lista, impressão EASA em “Voo / Obs.” e CSV)."
          />

          <Typography variant="caption" color="text.secondary">
            Horas em UTC (z). Dia/noite calculado pelo nascer/pôr do sol. Se alterares os dados
            do voo, o setor fica marcado como editado e deixa de ser atualizado pela escala.
            Marcar quem foi PF ou escrever notas não o congela. Num ramp return (mesmo aeroporto de partida e
            chegada) não conta descolagem nem aterragem — muda para Eu/Colega se foi um air return.
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

type Who = 'me' | 'other' | 'none';

// One "who flew it" row: a label, an Eu / Colega / Não houve toggle, and the computed day/night chip.
function PfRow({
  label, who, onChange, chip,
}: {
  label: string;
  who: Who;
  onChange: (v: Who) => void;
  chip: React.ReactNode;
}) {
  return (
    // Label and the day/night chip on one line, the three choices across the width below — three
    // buttons and a chip don't fit beside the label on a phone.
    <Box>
      <Box display="flex" alignItems="center" gap={1} mb={0.5}>
        <Typography variant="body2" sx={{ flexGrow: 1 }}>{label}</Typography>
        {who !== 'none' && chip}
      </Box>
      <ToggleButtonGroup
        exclusive size="small" fullWidth value={who}
        onChange={(_, v) => { if (v != null) onChange(v as Who); }}
      >
        <ToggleButton value="me" sx={{ py: 0.25 }}>Eu</ToggleButton>
        <ToggleButton value="other" sx={{ py: 0.25 }}>Colega</ToggleButton>
        <ToggleButton value="none" sx={{ py: 0.25, whiteSpace: 'nowrap' }}>Não houve</ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
}
