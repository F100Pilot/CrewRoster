import { useState } from 'react';
import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material';
import { UploadFile } from '@mui/icons-material';
import { useRoster } from '../state/useRoster';
import { extractPdf } from '../parsing/pdf/extractText';
import { diagnosePgaGrid } from '../parsing/pdf/pgaGrid';

// Dumps the raw extracted text so the PDF interpreter can be calibrated against a real
// sample. When the user provides a real PGA roster PDF, this is where we read off the
// column layout / date format to fill profiles/pgaNetline.ts.
export default function DebugPage() {
  const { roster } = useRoster();
  const [diag, setDiag] = useState<string>('');
  const [diagBusy, setDiagBusy] = useState(false);

  async function runDiagnosis(file: File) {
    setDiagBusy(true);
    setDiag('A analisar…');
    try {
      const { tokens } = await extractPdf(await file.arrayBuffer());
      setDiag(diagnosePgaGrid(tokens));
    } catch (e) {
      setDiag(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDiagBusy(false);
    }
  }

  return (
    <Stack spacing={2}>
      {/* Band placement diagnosis — upload the exact PDF that is missing days. */}
      <Box>
        <Button component="label" variant="outlined" startIcon={<UploadFile />} disabled={diagBusy}>
          Diagnosticar PDF (datas das bandas)
          <input
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) runDiagnosis(f); }}
          />
        </Button>
      </Box>
      {diag && (
        <Box
          component="pre"
          sx={{
            p: 1.5, bgcolor: 'rgba(128,128,128,0.14)', borderRadius: 1, fontSize: '0.72rem',
            whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto',
          }}
        >
          {diag}
        </Box>
      )}

      {!roster ? (
        <Typography color="text.secondary">Importa uma escala primeiro (página Lista).</Typography>
      ) : (
        <>
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
              p: 1.5, bgcolor: 'rgba(128,128,128,0.14)', borderRadius: 1, fontSize: '0.72rem',
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
                  p: 1.5, bgcolor: 'rgba(128,128,128,0.14)', borderRadius: 1, fontSize: '0.72rem',
                  whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto',
                }}
              >
                {JSON.stringify(roster.duties, null, 2)}
              </Box>
            </>
          )}
        </>
      )}
    </Stack>
  );
}
