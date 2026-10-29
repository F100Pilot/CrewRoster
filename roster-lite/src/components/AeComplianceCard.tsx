import { useMemo } from 'react';
import { Box, Card, CardContent, Tooltip, Typography } from '@mui/material';
import { CheckCircle, FactCheck, WarningAmber } from '@mui/icons-material';
import { aeCompliance, type ComplianceCheck } from '../domain/aeCompliance';
import AeDisclaimer, { ExperimentalChip } from './AeDisclaimer';
import type { ParsedDuty } from '../domain/types';

const ORDER: Record<ComplianceCheck['status'], number> = { warn: 0, ok: 1, na: 2 };

// The pilot's roster against the company agreement's planning rules (folgas, weekly rest,
// ES/LF/ND), from this month on. Problems first; checks with nothing to judge yet fold into one
// line so the card stays short.
export default function AeComplianceCard({ duties }: { duties: ParsedDuty[] }) {
  const checks = useMemo(() => {
    const all = aeCompliance(duties, new Date().toISOString().slice(0, 10));
    return [...all].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  }, [duties]);
  const judged = checks.filter((c) => c.status !== 'na');
  const pending = checks.filter((c) => c.status === 'na');
  const warnings = judged.filter((c) => c.status === 'warn').length;

  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box display="flex" alignItems="center" gap={1}>
          <FactCheck fontSize="small" color="action" />
          <Typography variant="subtitle2" noWrap>Conformidade AE</Typography>
          <Box ml="auto"><ExperimentalChip /></Box>
        </Box>
        {judged.length > 0 && (
          <Typography variant="caption" color={warnings ? 'warning.main' : 'success.main'} fontWeight={700} display="block" mb={0.75}>
            {warnings ? `${warnings} ${warnings === 1 ? 'ponto' : 'pontos'} a verificar` : 'Tudo conforme'}
          </Typography>
        )}

        <Box display="flex" flexDirection="column" gap={0.75}>
          {judged.map((c) => (
            <Tooltip key={c.id} title={c.clause} placement="top-start">
              <Box display="flex" gap={1} alignItems="flex-start">
                {c.status === 'warn'
                  ? <WarningAmber fontSize="small" color="warning" sx={{ mt: '1px' }} />
                  : <CheckCircle fontSize="small" color="success" sx={{ mt: '1px' }} />}
                <Box minWidth={0}>
                  <Typography variant="body2" fontWeight={600} lineHeight={1.3}>{c.label}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block" lineHeight={1.35}>
                    {c.detail}
                  </Typography>
                </Box>
              </Box>
            </Tooltip>
          ))}
          {pending.length > 0 && (
            <Typography variant="caption" color="text.disabled">
              Sem dados suficientes: {pending.map((c) => c.label.toLowerCase()).join(', ')}.
            </Typography>
          )}
        </Box>

        <AeDisclaimer />
      </CardContent>
    </Card>
  );
}
