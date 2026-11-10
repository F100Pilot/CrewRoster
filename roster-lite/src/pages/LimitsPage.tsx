import { useMemo } from 'react';
import { Alert, Stack } from '@mui/material';
import { Science } from '@mui/icons-material';
import { useRoster } from '../state/useRoster';
import FtlCard from '../components/FtlCard';
import AeComplianceCard from '../components/AeComplianceCard';
import HolidayCard from '../components/HolidayCard';
import PlanVsFlownCard from '../components/PlanVsFlownCard';
import { baseOf } from '../domain/dutyStats';
import { AE_DISCLAIMER } from '../components/AeDisclaimer';
import PageHero from '../components/PageHero';
import { limitRows, tightestRow } from '../domain/limitRows';
import { todayISO } from '../domain/rosterWindow';
import { formatDuration } from '../utils/duration';

// Everything measured against the rules in one place, off the roster list: flight and duty
// limits for everyone; for pilots, the company-agreement compliance checks, planned vs flown and
// the holiday count.
// The AE analysis is experimental, said once at the top rather than on every card.
export default function LimitsPage() {
  const { roster, activeUser } = useRoster();
  const pilot = (activeUser?.role ?? 'pilot') === 'pilot';
  const tight = useMemo(
    () => (roster ? tightestRow(limitRows(roster.duties, pilot ? 'pilot' : 'cabin', todayISO())) : null),
    [roster, pilot],
  );

  return (
    <Stack spacing={2}>
      <PageHero
        back label={pilot ? 'AE' : 'Limites'} pill={pilot ? '#FCD34D' : '#93C5FD'}
        title={tight ? `${Math.round((tight.used / tight.limit) * 100)}%` : pilot ? 'Limites e AE' : 'Limites'}
        subtitle={tight ? `O mais apertado: ${tight.group.toLowerCase()} ${tight.label} · ${formatDuration(tight.used)} de ${formatDuration(tight.limit)}` : undefined}
      />

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
