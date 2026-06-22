import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { ArrowBack, SaveAlt, OpenInNew } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import type { SavedPdf } from '../domain/types';
import { getPdf } from '../storage/rosterStore';
import { downloadBlob } from '../utils/download';
import PdfCanvasViewer from '../components/PdfCanvasViewer';

export default function PdfViewerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [pdf, setPdf] = useState<SavedPdf | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let objectUrl: string | null = null;
    getPdf(id)
      .then((found) => {
        if (found) {
          setPdf(found);
          objectUrl = URL.createObjectURL(found.blob);
          setUrl(objectUrl);
        }
      })
      .finally(() => setLoading(false));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (!pdf || !url) {
    return (
      <Stack spacing={2}>
        <Alert severity="error">PDF não encontrado.</Alert>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/pdfs')}>
          Voltar ao histórico
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Box display="flex" alignItems="center" justifyContent="space-between" gap={1}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/pdfs')} size="small">
          Histórico
        </Button>
        <Typography variant="body2" color="text.secondary" noWrap sx={{ flexGrow: 1, textAlign: 'center' }}>
          {pdf.fileName}
        </Typography>
        <Button
          startIcon={<SaveAlt />}
          onClick={() => downloadBlob(pdf.blob, pdf.fileName)}
          size="small"
          variant="outlined"
        >
          Descarregar
        </Button>
      </Box>

      {/* Canvas rendering works on mobile (Android Chrome won't show a PDF in an
          iframe). The button below opens it in the device's native viewer. */}
      <PdfCanvasViewer blob={pdf.blob} />

      <Button
        startIcon={<OpenInNew />}
        onClick={() => {
          // Open a FRESH object URL (the shared `url` is revoked on unmount, which left
          // the opened tab pointing at a dead blob).
          const fresh = URL.createObjectURL(pdf.blob);
          window.open(fresh, '_blank', 'noopener');
          setTimeout(() => URL.revokeObjectURL(fresh), 60_000);
        }}
        variant="text"
        size="small"
        sx={{ alignSelf: 'center' }}
      >
        Abrir no leitor do dispositivo
      </Button>
    </Stack>
  );
}
