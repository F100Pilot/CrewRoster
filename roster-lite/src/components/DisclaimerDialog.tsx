import { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { WarningAmber } from '@mui/icons-material';
import { getDisclaimerSeen, setDisclaimerSeen } from '../storage/settings';
import { DISCLAIMER_TEXT } from '../disclaimer';

// One-time beta disclaimer shown when the app opens, until the user acknowledges it. The same
// text lives permanently in Settings → "Sobre" (so it's always available, not just once).
export default function DisclaimerDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!getDisclaimerSeen()) setOpen(true);
  }, []);

  function acknowledge() {
    setDisclaimerSeen();
    setOpen(false);
  }

  return (
    <Dialog open={open} onClose={acknowledge} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningAmber color="warning" />
        <Typography variant="h6" component="div">Aviso — versão beta</Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2">{DISCLAIMER_TEXT}</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" onClick={acknowledge}>Compreendi</Button>
      </DialogActions>
    </Dialog>
  );
}
