import { useEffect, useState } from 'react';
import {
  Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Typography,
} from '@mui/material';
import { WarningAmber } from '@mui/icons-material';
import { getDisclaimerSeen, setDisclaimerSeen } from '../storage/settings';
import { DISCLAIMER_TEXT } from '../disclaimer';

// Beta disclaimer shown EVERY time the app opens, until the user ticks "Tomei conhecimento. Não
// voltar a mostrar o aviso." (then it's dismissed for good). The same text lives permanently in
// Settings → "Sobre". Closing without ticking the box means it shows again next launch.
export default function DisclaimerDialog() {
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (!getDisclaimerSeen()) setOpen(true);
  }, []);

  function close() {
    if (dontShowAgain) setDisclaimerSeen();
    setOpen(false);
  }

  return (
    <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningAmber color="warning" />
        <Typography variant="h6" component="div">Aviso — versão beta</Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2">{DISCLAIMER_TEXT}</Typography>
        <FormControlLabel
          sx={{ mt: 1.5, alignItems: 'flex-start' }}
          control={<Checkbox checked={dontShowAgain} onChange={(e) => setDontShowAgain(e.target.checked)} size="small" sx={{ pt: 0 }} />}
          label={<Typography variant="body2">Tomei conhecimento. Não voltar a mostrar o aviso.</Typography>}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" onClick={close}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}
