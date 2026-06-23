import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, List, ListItem, ListItemText, Stack, TextField, Typography,
} from '@mui/material';
import { Add, ArrowBack, Close, DeleteOutline, Edit, FlightLand } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { useRoster } from '../state/useRoster';
import { loadDocuments, putDocument, deleteDocument, loadLogbook } from '../storage/rosterStore';
import { recencyStatus } from '../domain/logbook';
import type { CrewDocument, LogbookRow } from '../domain/types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Colour + label for an expiry, from days remaining.
function expiryChip(expiry: string): { color: 'default' | 'warning' | 'error' | 'success'; label: string } {
  const days = differenceInCalendarDays(parseISO(expiry), new Date());
  if (days < 0) return { color: 'error', label: `Expirou há ${-days}d` };
  if (days <= 30) return { color: 'error', label: `${days}d` };
  if (days <= 90) return { color: 'warning', label: `${days}d` };
  return { color: 'success', label: `${days}d` };
}

export default function DocumentsPage() {
  const navigate = useNavigate();
  const { activeUser } = useRoster();
  const userId = activeUser?.id;
  const isPilot = activeUser?.role !== 'cabin';
  const today = new Date().toISOString().slice(0, 10);

  const [docs, setDocs] = useState<CrewDocument[]>([]);
  const [rows, setRows] = useState<LogbookRow[]>([]);
  const reload = useCallback(async () => {
    if (!userId) { setDocs([]); setRows([]); return; }
    const [d, r] = await Promise.all([loadDocuments(userId), loadLogbook(userId)]);
    setDocs(d.sort((a, b) => a.expiry.localeCompare(b.expiry)));
    setRows(r);
  }, [userId]);
  useEffect(() => { reload(); }, [reload]);

  const recency = useMemo(() => recencyStatus(rows, today), [rows, today]);

  // ── Add / edit dialog ───────────────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CrewDocument | null>(null);
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState('');

  function openAdd() { setEditing(null); setName(''); setExpiry(''); setOpen(true); }
  function openEdit(d: CrewDocument) { setEditing(d); setName(d.name); setExpiry(d.expiry); setOpen(true); }

  const valid = name.trim() !== '' && DATE_RE.test(expiry);

  async function save() {
    if (!valid || !userId) return;
    await putDocument({
      id: editing?.id ?? crypto.randomUUID(),
      userId,
      name: name.trim(),
      expiry,
    });
    setOpen(false);
    await reload();
  }
  async function remove() {
    if (editing) await deleteDocument(editing.id);
    setOpen(false);
    await reload();
  }

  return (
    <Stack spacing={2}>
      <Box display="flex" alignItems="center" gap={1}>
        <IconButton onClick={() => navigate(-1)}><ArrowBack /></IconButton>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>Documentos</Typography>
        <Button size="small" variant="outlined" startIcon={<Add />} onClick={openAdd}>Adicionar</Button>
      </Box>

      {/* Take-off/landing recency — pilots only. */}
      {isPilot && (
        <Card variant="outlined">
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
              <FlightLand fontSize="small" color="action" />
              <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Recência (3 em 90 dias)</Typography>
              <Chip
                size="small"
                label={recency.current ? 'Em dia' : 'Em falta'}
                color={recency.current ? 'success' : 'warning'}
                sx={{ color: '#fff' }}
              />
            </Box>
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              {recency.landings90} aterragens nos últimos 90 dias
              {recency.current && recency.validUntil
                ? ` · válida até ${format(parseISO(recency.validUntil), 'dd/MM/yyyy')}`
                : ''}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Indicativo, calculado do diário de bordo. Não substitui o registo oficial.
            </Typography>
          </CardContent>
        </Card>
      )}

      {docs.length === 0 ? (
        <Alert severity="info">
          Sem documentos. Adiciona medical, licença, OPC/LPC, passaporte… com a data de validade.
        </Alert>
      ) : (
        <Card variant="outlined">
          <List dense disablePadding>
            {docs.map((d) => {
              const chip = expiryChip(d.expiry);
              return (
                <ListItem
                  key={d.id}
                  divider
                  secondaryAction={
                    <IconButton edge="end" size="small" onClick={() => openEdit(d)}>
                      <Edit sx={{ fontSize: 18 }} />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={d.name}
                    secondary={format(parseISO(d.expiry), 'dd/MM/yyyy')}
                  />
                  <Chip size="small" label={chip.label} color={chip.color}
                    sx={{ mr: 5, color: chip.color === 'default' ? undefined : '#fff' }} />
                </ListItem>
              );
            })}
          </List>
        </Card>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
          <Box flexGrow={1}>{editing ? 'Editar documento' : 'Adicionar documento'}</Box>
          <IconButton onClick={() => setOpen(false)} size="small"><Close fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField label="Nome" value={name} size="small" fullWidth autoFocus
              placeholder="Medical Class 1 / Licença / OPC-LPC"
              onChange={(e) => setName(e.target.value)} />
            <TextField label="Validade" type="date" value={expiry} size="small" fullWidth
              InputLabelProps={{ shrink: true }}
              inputProps={{ style: { fontSize: '0.8rem' } }}
              onChange={(e) => setExpiry(e.target.value)}
              error={!!expiry && !DATE_RE.test(expiry)} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {editing && (
            <Button color="error" startIcon={<DeleteOutline />} onClick={remove}>Apagar</Button>
          )}
          <Box flexGrow={1} />
          <Button onClick={() => setOpen(false)} color="inherit">Cancelar</Button>
          <Button onClick={save} variant="contained" disabled={!valid}>Guardar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
