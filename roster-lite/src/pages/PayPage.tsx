import { useEffect, useState } from 'react';
import { Alert, Box, Button, IconButton, Stack, Typography } from '@mui/material';
import { ArrowBack, Science, Settings } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import PayEstimateCard from '../components/PayEstimateCard';
import { baseOf } from '../domain/dutyStats';
import { getPaySettings } from '../storage/settings';
import { openSettings } from '../components/settingsEvents';

// The pay estimate on its own tab, apart from the AE limits. Pilots only — it applies the SIPLA
// agreement (RRRGS) — and only once the pilot turned it on and typed their own figures in Settings.
export default function PayPage() {
  const navigate = useNavigate();
  const { roster, activeUser } = useRoster();
  const pilot = activeUser?.role !== 'cabin';
  const [enabled, setEnabled] = useState(() => (activeUser ? getPaySettings(activeUser.id).enabled : false));
  useEffect(() => {
    if (!activeUser) return;
    const reload = () => setEnabled(getPaySettings(activeUser.id).enabled);
    reload();
    window.addEventListener('pay-settings-updated', reload);
    return () => window.removeEventListener('pay-settings-updated', reload);
  }, [activeUser]);

  return (
    <Stack spacing={2}>
      <Box display="flex" alignItems="center" gap={1}>
        <IconButton onClick={() => navigate(-1)}><ArrowBack /></IconButton>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>Vencimento</Typography>
      </Box>

      {!pilot || !activeUser ? (
        <Alert severity="info">A estimativa de vencimento segue o AE do SIPLA e é só para pilotos.</Alert>
      ) : !enabled ? (
        <Alert
          severity="info"
          action={<Button color="inherit" size="small" startIcon={<Settings />} onClick={() => openSettings('vencimento')}>Definições</Button>}
        >
          Liga a estimativa e mete os teus valores em Definições → Vencimento. Ficam só neste dispositivo.
        </Alert>
      ) : !roster ? (
        <Alert severity="info">Importa a escala para ver a estimativa.</Alert>
      ) : (
        <>
          <Alert severity="warning" variant="outlined" icon={<Science fontSize="inherit" />} sx={{ py: 0.25 }}>
            Estimativa experimental pelo RRRGS do AE. Confirma sempre no recibo oficial.
          </Alert>
          <PayEstimateCard duties={roster.duties} base={baseOf(activeUser)} userId={activeUser.id} />
          <Box>
            <Button size="small" startIcon={<Settings />} onClick={() => openSettings('vencimento')}>
              Alterar valores
            </Button>
          </Box>
        </>
      )}
    </Stack>
  );
}
