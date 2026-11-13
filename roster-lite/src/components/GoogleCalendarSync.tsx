import { useCallback, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { Google } from '@mui/icons-material';
import { useRoster } from '../state/useRoster';
import {
  googleCalendarAvailable, lastGoogleSync, syncToGoogleCalendar, type SyncResult,
} from '../services/googleCalendar';

export function syncSummary(r: SyncResult): string {
  const parts = [r.added && `${r.added} novos`, r.updated && `${r.updated} alterados`, r.removed && `${r.removed} apagados`].filter(Boolean);
  return parts.length ? `Google Calendar atualizado: ${parts.join(', ')}.` : 'O Google Calendar já estava igual à escala.';
}

// One sync run at a time, with its outcome, for the button below and the calendar's share menu.
export function useGoogleSync() {
  const { roster, activeUser } = useRoster();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = useCallback(async () => {
    if (!activeUser || !roster) return;
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ ok: true, text: syncSummary(await syncToGoogleCalendar(activeUser.id, roster.duties)) });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Não foi possível atualizar o Google Calendar.' });
    } finally {
      setBusy(false);
    }
  }, [activeUser, roster]);
  return { available: googleCalendarAvailable && !!roster && !!activeUser, busy, message, clear: () => setMessage(null), run, userId: activeUser?.id };
}

// Settings → Dados: send the roster to the person's Google Calendar, into its own "CrewRoster"
// calendar. Hidden in builds without a Google client id.
export default function GoogleCalendarSync() {
  const { available, busy, message, run, userId } = useGoogleSync();
  if (!googleCalendarAvailable) return null;
  const last = userId ? lastGoogleSync(userId) : null;
  return (
    <Box>
      <Button onClick={run} disabled={!available || busy} size="small" variant="outlined" fullWidth
        startIcon={busy ? <CircularProgress size={16} /> : <Google />}>
        {busy ? 'A enviar…' : 'Enviar para o Google Calendar'}
      </Button>
      <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
        Cria o calendário "CrewRoster" na tua conta Google e deixa-o igual à escala: junta, altera e apaga os
        serviços dos dias da escala. Só mexe nesse calendário — não vê os outros.
        {last && ` Última atualização: ${new Date(last).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}.`}
      </Typography>
      {message && <Alert severity={message.ok ? 'success' : 'error'} sx={{ mt: 1 }}>{message.text}</Alert>}
    </Box>
  );
}
