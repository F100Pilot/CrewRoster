import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  CloudDownload,
  CloudUpload,
  EventNote,
  Login,
  ChevronRight,
  Visibility,
  SaveAlt,
} from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { fetchRoster, SessionExpiredError } from '../services/crewlinkApi';
import { useRoster } from '../state/useRoster';
import { savePdf } from '../storage/rosterStore';
import { downloadBlob } from '../utils/download';
import UploadDropzone from '../components/UploadDropzone';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function toCrewLinkDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}${MONTHS[parseInt(m) - 1]}${y}`;
}

interface LastDownload {
  id: string;
  fileName: string;
  blob: Blob;
}

export default function ImportPage() {
  const { sessionToken, roster, importFile, importing, activeUser } = useRoster();
  const navigate = useNavigate();

  const today = new Date();
  const [beginDate, setBeginDate] = useState(format(today, 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [lastDownload, setLastDownload] = useState<LastDownload | null>(null);

  const handleDownload = async () => {
    if (!sessionToken) return;
    setDownloading(true);
    setDownloadError(null);
    setLastDownload(null);
    setDownloadStatus('A descarregar escala do CrewLink…');
    try {
      const options: { sessionToken: string; beginDate?: string; endDate?: string } = { sessionToken };
      if (beginDate) options.beginDate = toCrewLinkDate(beginDate);
      if (endDate) options.endDate = toCrewLinkDate(endDate);

      const pdfBuffer = await fetchRoster(options);
      setDownloadStatus('PDF recebido. A guardar e processar…');

      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const id = crypto.randomUUID();
      const stamp = format(new Date(), 'yyyyMMdd-HHmm');
      const fileName = `escala-${stamp}.pdf`;

      // Persist the PDF in the history (registered by download time + date range).
      await savePdf({
        id,
        userId: activeUser?.id,
        fileName,
        blob,
        downloadedAt: new Date().toISOString(),
        beginDate: beginDate || null,
        endDate: endDate || null,
      });

      // Feed it through the parser pipeline so the roster view updates.
      const pdfFile = new File([blob], fileName, { type: 'application/pdf' });
      await importFile(pdfFile);

      setLastDownload({ id, fileName, blob });
      setDownloadStatus('');
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        // useRoster doesn't expose setSessionToken here — show a clear message
        setDownloadError('Sessão expirada. Abre o diálogo de download (botão ☁ no topo) e volta a fazer login.');
      } else {
        setDownloadError(err instanceof Error ? err.message : 'Erro desconhecido.');
      }
      setDownloadStatus('');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Stack spacing={3}>
      {/* Card 1: Download from CrewLink */}
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1} mb={1}>
            <CloudDownload color="primary" />
            <Typography variant="h6">Descarregar do CrewLink</Typography>
          </Stack>

          {!sessionToken ? (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Faz login para descarregar a tua escala diretamente do CrewLink.
              </Typography>
              <Button
                variant="contained"
                startIcon={<Login />}
                onClick={() => navigate('/login')}
                sx={{ alignSelf: 'flex-start' }}
              >
                Fazer login
              </Button>
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Sessão ativa. Escolhe o intervalo de datas (opcional — o servidor usa os valores por defeito).
              </Typography>

              {downloadError && <Alert severity="error">{downloadError}</Alert>}
              {downloadStatus && !downloadError && (
                <Alert severity="info" icon={<CircularProgress size={18} />}>
                  {downloadStatus}
                </Alert>
              )}

              {lastDownload && (
                <Alert severity="success">
                  <Typography variant="body2" gutterBottom>
                    Escala descarregada e guardada no histórico.
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mt={1}>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<Visibility />}
                      onClick={() => navigate(`/pdf/${lastDownload.id}`)}
                    >
                      Ver PDF
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<SaveAlt />}
                      onClick={() => downloadBlob(lastDownload.blob, lastDownload.fileName)}
                    >
                      Descarregar
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      endIcon={<ChevronRight />}
                      onClick={() => navigate('/')}
                    >
                      Ver escala
                    </Button>
                  </Stack>
                </Alert>
              )}

              <Stack direction="row" spacing={2}>
                <TextField
                  label="Data início"
                  type="date"
                  value={beginDate}
                  onChange={(e) => setBeginDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  fullWidth
                />
                <TextField
                  label="Data fim"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  helperText="Deixa em branco para o máximo disponível"
                  size="small"
                  fullWidth
                />
              </Stack>

              <Button
                variant="contained"
                startIcon={downloading ? <CircularProgress size={18} color="inherit" /> : <CloudDownload />}
                onClick={handleDownload}
                disabled={downloading || importing}
                sx={{ alignSelf: 'flex-start' }}
              >
                {downloading ? downloadStatus || 'A descarregar…' : 'Descarregar escala'}
              </Button>
            </Stack>
          )}
        </CardContent>
      </Card>

      <Divider>
        <Typography variant="caption" color="text.secondary">ou</Typography>
      </Divider>

      {/* Card 2: Import file */}
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1} mb={2}>
            <CloudUpload color="primary" />
            <Typography variant="h6">Importar ficheiro</Typography>
          </Stack>
          <UploadDropzone />
        </CardContent>
      </Card>

      {/* Card 3: History + current roster */}
      <Divider>
        <Typography variant="caption" color="text.secondary">ou</Typography>
      </Divider>
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1} mb={1}>
            <EventNote color="primary" />
            <Typography variant="h6">Escalas guardadas</Typography>
          </Stack>
          {roster && (
            <Typography variant="body2" color="text.secondary" mb={2}>
              Escala atual: {roster.fileName} · importada em{' '}
              {format(parseISO(roster.importedAt), 'dd/MM/yyyy HH:mm')} ·{' '}
              {roster.duties.length} registos
            </Typography>
          )}
          <Box display="flex" gap={1} flexWrap="wrap">
            <Button
              variant="outlined"
              startIcon={<EventNote />}
              onClick={() => navigate('/pdfs')}
            >
              Histórico de PDFs
            </Button>
            {roster && (
              <Button
                variant="outlined"
                endIcon={<ChevronRight />}
                onClick={() => navigate('/')}
              >
                Ver escala
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}
