import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import { Visibility, SaveAlt, Delete, PictureAsPdf } from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import type { SavedPdf } from '../domain/types';
import { listPdfs, deletePdf } from '../storage/rosterStore';
import { downloadBlob } from '../utils/download';

function formatRange(pdf: SavedPdf): string {
  const fmt = (iso: string | null) => (iso ? format(parseISO(iso), 'dd/MM/yyyy') : null);
  const begin = fmt(pdf.beginDate);
  const end = fmt(pdf.endDate);
  if (begin && end) return `${begin} → ${end}`;
  if (begin && !end) return `${begin} → máximo disponível`;
  return 'Intervalo automático';
}

export default function SavedPdfsPage() {
  const navigate = useNavigate();
  const [pdfs, setPdfs] = useState<SavedPdf[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    listPdfs()
      .then(setPdfs)
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const handleDelete = async (id: string) => {
    await deletePdf(id);
    refresh();
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h6">Histórico de PDFs</Typography>

      {loading && <Typography color="text.secondary">A carregar…</Typography>}

      {!loading && pdfs.length === 0 && (
        <Alert severity="info">
          Ainda não há PDFs guardados. Descarrega uma escala do CrewLink para a guardar aqui.
        </Alert>
      )}

      {pdfs.map((pdf) => (
        <Card key={pdf.id} variant="outlined">
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box display="flex" alignItems="center" gap={1.5}>
              <PictureAsPdf color="error" />
              <Box flexGrow={1} minWidth={0}>
                <Typography variant="subtitle2" noWrap>
                  {formatRange(pdf)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Descarregado {format(parseISO(pdf.downloadedAt), 'dd/MM/yyyy HH:mm')}
                </Typography>
              </Box>
              <IconButton
                color="primary"
                title="Ver PDF"
                onClick={() => navigate(`/pdf/${pdf.id}`)}
              >
                <Visibility />
              </IconButton>
              <IconButton
                title="Descarregar"
                onClick={() => downloadBlob(pdf.blob, pdf.fileName)}
              >
                <SaveAlt />
              </IconButton>
              <IconButton
                color="error"
                title="Apagar"
                onClick={() => handleDelete(pdf.id)}
              >
                <Delete />
              </IconButton>
            </Box>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
