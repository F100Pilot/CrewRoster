import { Alert, Box, IconButton, Stack, Typography } from '@mui/material';
import { ArrowBack, Science } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import FtlCard from '../components/FtlCard';
import AeComplianceCard from '../components/AeComplianceCard';
import HolidayCard from '../components/HolidayCard';
import PlanVsFlownCard from '../components/PlanVsFlownCard';
import { baseOf } from '../domain/dutyStats';
import { AE_DISCLAIMER } from '../components/AeDisclaimer';

// Everything measured against the rules in one place, off the roster list: flight and duty
// limits for everyone; for pilots, the company-agreement compliance checks, planned vs flown and
// the holiday count.
// The AE analysis is experimental, said once at the top rather than on every card.
export default function LimitsPage() {
  const navigate = useNavigate();
  const { roster, activeUser } = useRoster();
  const pilot = (activeUser?.role ?? 'pilot') === 'pilot';

  return (
    <Stack spacing={2}>
      <Box display="flex" alignItems="center" gap={1}>
        <IconButton onClick={() => navigate(-1)}><ArrowBack /></IconButton>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>{pilot ? 'Limites e AE' : 'Limites'}</Typography>
      </Box>

      {!roster ? (
        <Alert severity="info">Importa a escala para ver os limites.</Alert>
      ) : (
        <>
          {pilot && (
            <Alert severity="warning" variant="outlined" icon={<Science fontSize="inherit" />} sx={{ py: 0.25 }}>
              {AE_DISCLAIMER}
            </Alert>
          )}
          <FtlCard duties={roster.duties} role={activeUser?.role ?? 'pilot'} />
          {pilot && <AeComplianceCard duties={roster.duties} />}
          {pilot && <PlanVsFlownCard duties={roster.duties} base={baseOf(activeUser)} />}
          {pilot && <HolidayCard duties={roster.duties} />}
        </>
      )}
    </Stack>
  );
}
