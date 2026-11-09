import { Chip } from '@mui/material';
import { Science } from '@mui/icons-material';

// Everything the app derives from the Portugália / SIPLA company agreement (limits, FDP, rest,
// the compliance checks) is the app's own reading of the text. Say so wherever it shows, in the
// same words, so no one mistakes it for the company's validation.
export const AE_DISCLAIMER =
  'Análise experimental do Acordo de Empresa: pode conter erros. Confirma sempre na escala oficial e no AE.';

// Small "Experimental" tag for a card header.
export function ExperimentalChip() {
  return (
    <Chip
      size="small"
      variant="outlined"
      color="warning"
      icon={<Science sx={{ fontSize: '0.9rem !important' }} />}
      label="Experimental"
      sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
    />
  );
}
