import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { Visibility, SaveAlt, Delete, PictureAsPdf } from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import type { SavedPdf } from '../domain/types';
import { listPdfs, deletePdf } from '../storage/rosterStore';
import { downloadBlob } from '../utils/download';
import { useRoster } from '../state/useRoster';
import PageHero from '../components/PageHero';

function formatRange(pdf: SavedPdf): string {
  const fmt = (iso: string | null) => (iso ? format(parseISO(iso), 'dd/MM/yyyy') : null);
  const begin = fmt(pdf.beginDate);
  const end = fmt(pdf.endDate);
  if (begin && end) return `${begin} → ${end}`;
  if (begin && !end) return `${begin} → máximo disponível`;
  return 'Intervalo automático';
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// The PDF history in tabs (user request): a tab per year, inside it a tab per month, both by
// when the PDF was DOWNLOADED (local time) — the moment that matters, since the re-parse replays
// the PDFs in that order to rebuild planned vs flown (and an IO's "prevenir"). Each PDF is named by
// that moment; newest first, the latest of all marked.
export default function SavedPdfsPage() {
  const navigate = useNavigate();
  const { activeUser } = useRoster();
  const [pdfs, setPdfs] = useState<SavedPdf[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<SavedPdf | null>(null);

  const refresh = () => {
    setLoading(true);
    listPdfs(activeUser?.id)
      .then(setPdfs)
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [activeUser?.id]);

  // year → month ('01'…'12') → PDFs, newest first (listPdfs already sorts by download time).
  const tree = useMemo(() => {
    const t = new Map<string, Map<string, SavedPdf[]>>();
    for (const p of pdfs) {
      const d = parseISO(p.downloadedAt);
      const y = format(d, 'yyyy');
      const m = format(d, 'MM');
      if (!t.has(y)) t.set(y, new Map());
      const months = t.get(y)!;
      if (!months.has(m)) months.set(m, []);
      months.get(m)!.push(p);
    }
    return t;
  }, [pdfs]);
  const years = [...tree.keys()].sort().reverse();
  // A tab that emptied (its last PDF deleted) or none chosen yet: the most recent one.
  const shownYear = year && tree.has(year) ? year : years[0] ?? null;
  const months = shownYear ? [...tree.get(shownYear)!.keys()].sort().reverse() : [];
  const shownMonth = month && months.includes(month) ? month : months[0] ?? null;
  const list = shownYear && shownMonth ? tree.get(shownYear)!.get(shownMonth)! : [];
  const latestId = pdfs[0]?.id;

  const handleDelete = async () => {
    if (!toDelete) return;
    await deletePdf(toDelete.id);
    setToDelete(null);
    refresh();
  };

  return (
    <Stack spacing={2}>
      <PageHero label="PDFs" title="Histórico de PDFs" subtitle={pdfs.length ? `${pdfs.length} ${pdfs.length === 1 ? 'escala guardada' : 'escalas guardadas'} neste dispositivo, por data de download` : 'As escalas descarregadas ficam guardadas aqui'} />

      {loading && <Typography color="text.secondary">A carregar…</Typography>}

      {!loading && pdfs.length === 0 && (
        <Alert severity="info">
          Ainda não há PDFs guardados. Descarrega uma escala do CrewLink para a guardar aqui.
        </Alert>
      )}

      {years.length > 0 && (
        <Stack spacing={1}>
          <Tabs value={shownYear} onChange={(_, v: string) => { setYear(v); setMonth(null); }}
            variant="scrollable" scrollButtons={false} aria-label="Ano do download" sx={{ '&&': { mx: 0 } }}>
            {years.map((y) => {
              const n = [...tree.get(y)!.values()].reduce((s, l) => s + l.length, 0);
              return <Tab key={y} value={y} label={`${y} · ${n}`} sx={{ minHeight: 40, py: 0.5, fontWeight: 800 }} />;
            })}
          </Tabs>
          <Tabs value={shownMonth} onChange={(_, v: string) => setMonth(v)}
            variant="scrollable" scrollButtons={false} aria-label="Mês do download" sx={{ '&&': { mx: 0 } }}>
            {months.map((m) => (
              <Tab key={m} value={m} label={`${MONTHS[Number(m) - 1]} · ${tree.get(shownYear!)!.get(m)!.length}`}
                sx={{ minHeight: 36, minWidth: 64, py: 0.25, textTransform: 'none', fontWeight: 700 }} />
            ))}
          </Tabs>
        </Stack>
      )}

      {list.map((pdf) => {
        const at = parseISO(pdf.downloadedAt);
        return (
          <Card key={pdf.id}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box display="flex" alignItems="center" gap={1}>
                <PictureAsPdf color="error" />
                <Box flexGrow={1} minWidth={0}>
                  {/* Named by the download: that's the PDF's identity in the history. */}
                  <Box display="flex" alignItems="center" gap={0.75} flexWrap="wrap">
                    <Typography variant="subtitle2" fontWeight={800} noWrap sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {cap(format(at, 'EEE, dd MMM', { locale: pt }).replace('.', ''))} · {format(at, 'HH:mm')}
                    </Typography>
                    {pdf.id === latestId && <Chip size="small" color="success" label="Mais recente" sx={{ height: 20, fontSize: '0.65rem' }} />}
                  </Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Escala {formatRange(pdf)}
                  </Typography>
                </Box>
                <IconButton color="primary" size="small" title="Ver PDF" aria-label="Ver PDF" onClick={() => navigate(`/pdf/${pdf.id}`)}>
                  <Visibility />
                </IconButton>
                <IconButton size="small" title="Descarregar" aria-label="Descarregar" onClick={() => downloadBlob(pdf.blob, pdf.fileName)}>
                  <SaveAlt />
                </IconButton>
                <IconButton color="error" size="small" title="Apagar" aria-label="Apagar" onClick={() => setToDelete(pdf)}>
                  <Delete />
                </IconButton>
              </Box>
            </CardContent>
          </Card>
        );
      })}

      {/* Deleting matters now: the PDFs rebuild planned vs flown and an IO's "prevenir". */}
      <Dialog open={!!toDelete} onClose={() => setToDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Apagar este PDF?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {toDelete && `Descarregado a ${format(parseISO(toDelete.downloadedAt), 'dd/MM/yyyy HH:mm')}. `}
            A app usa os PDFs guardados para comparar o planeado com o voado (atrasos, IO / prevenir). Sem
            ele, essas comparações podem deixar de ser possíveis.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(null)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>Apagar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
