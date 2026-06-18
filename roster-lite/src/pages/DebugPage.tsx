import { Alert, Box, Chip, Stack, Typography } from '@mui/material';
import { useRoster } from '../state/useRoster';

// Dumps the raw extracted text so the PDF interpreter can be calibrated against a real
// sample. When the user provides a real PGA roster PDF, this is where we read off the
// column layout / date format to fill profiles/pgaNetline.ts.
export default function DebugPage() {
  const { roster } = useRoster();

  if (!roster) {
    return <Typography color="text.secondary">Importa uma escala primeiro (página Lista).</Typography>;
  }

  return (
    <Stack spacing={2}>
      <Box display="flex" gap={1} flexWrap="wrap">
        <Chip label={`Fonte: ${roster.sourceType.toUpperCase()}`} />
        <Chip label={`${roster.duties.length} duties reconhecidos`} color={roster.duties.length ? 'success' : 'warning'} />
        <Chip label={roster.fileName} variant="outlined" />
      </Box>

      <Alert severity="info">
        Esta página mostra o texto extraído. Partilha-a (ou um print) para eu calibrar o leitor
        do PDF da Portugália.
      </Alert>

      <Typography variant="subtitle2">Texto extraído</Typography>
      <Box
        component="pre"
        sx={{
          p: 1.5, bgcolor: 'grey.100', borderRadius: 1, fontSize: '0.72rem',
          whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto',
        }}
      >
        {roster.rawText || '(vazio)'}
      </Box>

      {roster.duties.length > 0 && (
        <>
          <Typography variant="subtitle2">Duties reconhecidos (JSON)</Typography>
          <Box
            component="pre"
            sx={{
              p: 1.5, bgcolor: 'grey.100', borderRadius: 1, fontSize: '0.72rem',
              whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto',
            }}
          >
            {JSON.stringify(roster.duties, null, 2)}
          </Box>
        </>
      )}
    </Stack>
  );
}
