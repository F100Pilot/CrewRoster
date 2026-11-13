import { useState } from 'react';
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Snackbar } from '@mui/material';
import { CalendarMonth, Google, Image, IosShare, Notes } from '@mui/icons-material';
import type { ParsedDuty, UserProfile } from '../domain/types';
import { baseOf } from '../domain/dutyStats';
import { shareMonthImage } from '../utils/shareDay';
import { shareMonthIcs, shareMonthText } from '../utils/shareMonth';
import { useGoogleSync } from './GoogleCalendarSync';

// The calendar's share button: the month for other people (as a picture, as text for WhatsApp/SMS,
// or as a calendar file they add to theirs), and — for the crew member — the roster to their own
// Google Calendar. None of it carries crew names or pay.
export default function ShareMonthMenu({ monthKey, duties, user }: { monthKey: string; duties: ParsedDuty[]; user: UserProfile | null }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const google = useGoogleSync();
  const pick = (run: () => Promise<unknown>) => () => { setAnchor(null); void run(); };
  return (
    <>
      <IconButton size="small" aria-label="Partilhar o mês" title="Partilhar o mês" onClick={(e) => setAnchor(e.currentTarget)}>
        <IosShare fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem onClick={pick(() => shareMonthImage(monthKey, duties, user?.name, baseOf(user)))}>
          <ListItemIcon><Image fontSize="small" /></ListItemIcon>
          <ListItemText primary="Imagem" secondary="Resumo do mês" />
        </MenuItem>
        <MenuItem onClick={pick(async () => {
          const r = await shareMonthText(monthKey, duties, baseOf(user));
          if (r === 'copied') setToast('Escala copiada — cola-a onde quiseres.');
          if (r === 'failed') setToast('Não foi possível partilhar o texto.');
        })}>
          <ListItemIcon><Notes fontSize="small" /></ListItemIcon>
          <ListItemText primary="Texto" secondary="Dia a dia, para WhatsApp ou SMS" />
        </MenuItem>
        <MenuItem onClick={pick(() => shareMonthIcs(monthKey, duties))}>
          <ListItemIcon><CalendarMonth fontSize="small" /></ListItemIcon>
          <ListItemText primary="Ficheiro de calendário" secondary="Para juntar ao calendário de outra pessoa" />
        </MenuItem>
        {google.available && (
          <MenuItem disabled={google.busy} onClick={pick(google.run)}>
            <ListItemIcon><Google fontSize="small" /></ListItemIcon>
            <ListItemText primary="O meu Google Calendar" secondary="Toda a escala, sempre atualizada" />
          </MenuItem>
        )}
      </Menu>
      <Snackbar open={!!toast || !!google.message || google.busy} autoHideDuration={google.busy ? null : 5000}
        onClose={() => { setToast(null); google.clear(); }}
        message={google.busy ? 'A enviar para o Google Calendar…' : toast ?? google.message?.text} />
    </>
  );
}
