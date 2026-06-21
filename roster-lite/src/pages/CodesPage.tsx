import { Box, Card, CardContent, Divider, Stack, Typography } from '@mui/material';
import { dutyColor } from '../theme';

// Reference sheet for the duty codes the parser recognises. Helps confirm a parse and
// documents what each chip means. Extend as new codes are clarified.
const CODES: { code: string; dutyType: string; label: string }[] = [
  { code: 'TP…', dutyType: 'Flight Duty', label: 'Voo (com nº de voo e rota)' },
  { code: 'DH', dutyType: 'Positioning', label: 'Posicionamento / deadhead (viagem como passageiro)' },
  { code: 'X', dutyType: 'Day Off', label: 'Folga fora da base' },
  { code: 'W_OFF / OFF', dutyType: 'Day Off', label: 'Folga' },
  { code: 'GAB1 / GAB2', dutyType: 'Office Duty', label: 'Serviço de gabinete (escritório)' },
  { code: 'FPE-LEARN', dutyType: 'Training', label: 'Formação (e-learning)' },
  { code: 'SIM / E90-…', dutyType: 'Simulator', label: 'Simulador' },
  { code: 'SBY / STBY', dutyType: 'Standby Airport', label: 'Reserva (standby)' },
  { code: 'A1 / A2 / A3…', dutyType: 'Standby Airport', label: 'Reserva no aeroporto (slots)' },
  { code: 'VAC', dutyType: 'Vacation', label: 'Férias' },
];

export default function CodesPage() {
  return (
    <Stack spacing={2}>
      <Typography variant="h6">Legenda de códigos</Typography>
      <Card variant="outlined">
        <CardContent sx={{ py: 1 }}>
          {CODES.map((c, i) => (
            <Box key={c.code}>
              {i > 0 && <Divider />}
              <Box display="flex" alignItems="center" gap={1.5} py={1.25}>
                <Box
                  sx={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    bgcolor: dutyColor(c.dutyType),
                    flexShrink: 0,
                  }}
                />
                <Typography variant="subtitle2" sx={{ minWidth: 104 }}>
                  {c.code}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {c.label}
                </Typography>
              </Box>
            </Box>
          ))}
        </CardContent>
      </Card>
      <Typography variant="caption" color="text.secondary">
        Todas as horas da escala são em UTC (Zulu, "z"). A hora local (LT) de cada aeroporto é
        mostrada entre parênteses no detalhe de cada voo.
      </Typography>
    </Stack>
  );
}
