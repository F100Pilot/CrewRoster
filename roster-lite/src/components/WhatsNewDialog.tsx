import { useEffect, useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem,
  ListItemIcon, ListItemText, Typography,
} from '@mui/material';
import { Celebration, CheckCircleOutline } from '@mui/icons-material';
import { APP_VERSION, APP_VERSION_LABEL, notesSince, RELEASE_NOTES, type ReleaseNote } from '../version';
import { getLastSeenVersion, setLastSeenVersion } from '../storage/settings';

// Shows a one-time "what's new" pop-up after the app updates to a newer version. The
// service worker reloads the page when a new build takes over (see main.tsx), so on the
// next open APP_VERSION differs from the stored last-seen version and we announce it.
export default function WhatsNewDialog() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<ReleaseNote[]>([]);

  useEffect(() => {
    const seen = getLastSeenVersion();
    // Fresh install (nothing seen yet): adopt the current version silently — it's not an
    // "update", so don't nag on the very first run.
    if (seen === null) {
      setLastSeenVersion(APP_VERSION);
      return;
    }
    if (seen !== APP_VERSION) {
      const since = notesSince(seen);
      setNotes(since.length ? since : RELEASE_NOTES.slice(0, 1));
      setOpen(true);
    }
  }, []);

  function close() {
    setLastSeenVersion(APP_VERSION);
    setOpen(false);
  }

  return (
    <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Celebration color="primary" />
        <Box>
          <Typography variant="h6" component="div" sx={{ lineHeight: 1.2 }}>Novidades</Typography>
          <Typography variant="caption" color="text.secondary">Atualizado para {APP_VERSION_LABEL}</Typography>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {notes.map((n) => (
          <Box key={n.version} mb={1}>
            {notes.length > 1 && (
              <Typography variant="subtitle2" gutterBottom>Versão {n.version}</Typography>
            )}
            <List dense disablePadding>
              {n.highlights.map((h, i) => (
                <ListItem key={i} disableGutters alignItems="flex-start" sx={{ py: 0.25 }}>
                  <ListItemIcon sx={{ minWidth: 30, mt: 0.5 }}>
                    <CheckCircleOutline fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText primary={h} primaryTypographyProps={{ variant: 'body2' }} />
                </ListItem>
              ))}
            </List>
          </Box>
        ))}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" onClick={close}>Entendido</Button>
      </DialogActions>
    </Dialog>
  );
}
