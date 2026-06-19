import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { ArrowBack, SaveAlt } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import type { SavedPdf } from '../domain/types';
import { getPdf } from '../storage/rosterStore';
import { downloadBlob } from '../utils/download';

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

      <Box
        component="iframe"
        src={url}
        title={pdf.fileName}
        sx={{
          width: '100%',
          height: 'calc(100vh - 200px)',
          minHeight: 400,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
        }}
      />

      <Typography variant="caption" color="text.secondary" align="center">
        Se o PDF não aparecer, usa o botão "Descarregar" para o abrir no leitor do dispositivo.
      </Typography>
    </Stack>
  );
}
