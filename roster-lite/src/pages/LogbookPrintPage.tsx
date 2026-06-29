import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, IconButton, Typography } from '@mui/material';
import { ArrowBack, Print } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { useRoster } from '../state/useRoster';
import { loadLogbook } from '../storage/rosterStore';
import { getLogbookFunction, type LogbookFunction } from '../storage/settings';
import { easaSectors, paginateEasa, hm, type EasaPage, type EasaTotals } from '../domain/easaLogbook';
import type { LogbookRow } from '../domain/types';

// Scoped to body.printing-easa so it never affects printing of other pages: hide the whole app
// and show only the logbook sheet, landscape, with a page break after each logbook page.
const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 7mm; }
  body.printing-easa * { visibility: hidden; }
  body.printing-easa .easa-root, body.printing-easa .easa-root * { visibility: visible; }
  body.printing-easa .easa-root { position: absolute; left: 0; top: 0; width: 100%; }
  body.printing-easa .no-print { display: none !important; }
  .easa-page { break-after: page; }
  .easa-page:last-child { break-after: auto; }
}
.easa-table { border-collapse: collapse; width: 100%; table-layout: fixed; }
.easa-table th, .easa-table td {
  border: 1px solid #888; padding: 1px 2px; text-align: center; font-size: 9px; line-height: 1.25;
  overflow: hidden; white-space: nowrap; color: #000;
}
.easa-table thead th { background: #e9e9ef; font-weight: 700; }
.easa-table .lbl { text-align: right; font-weight: 700; background: #f4f4f8; }
.easa-table .tot td { font-weight: 700; background: #f4f4f8; }
.easa-table .obs { text-align: left; }
`;

const COLS = 17;

function TotalsRow({ label, t, strong }: { label: string; t: EasaTotals; strong?: boolean }) {
  return (
    <tr className={strong ? 'tot' : undefined}>
      <td className="lbl" colSpan={7}>{label}</td>
      <td>{hm(t.block)}</td>
      <td>{hm(t.block)}</td>
      <td />
      <td>{t.dayLdg || ''}</td>
      <td>{t.nightLdg || ''}</td>
      <td>{hm(t.night)}</td>
      <td>{hm(t.ifr)}</td>
      <td>{hm(t.pic)}</td>
      <td>{hm(t.copilot)}</td>
      <td />
    </tr>
  );
}

function PageTable({ page, picName, fn }: { page: EasaPage; picName: string; fn: LogbookFunction }) {
  return (
    <Box className="easa-page" sx={{ mb: 2 }}>
      <table className="easa-table">
        <colgroup>
          <col style={{ width: '5%' }} />
          <col style={{ width: '5%' }} /><col style={{ width: '4%' }} />
          <col style={{ width: '5%' }} /><col style={{ width: '4%' }} />
          <col style={{ width: '6%' }} /><col style={{ width: '6%' }} />
          <col style={{ width: '6%' }} /><col style={{ width: '6%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '4%' }} /><col style={{ width: '4%' }} />
          <col style={{ width: '5%' }} /><col style={{ width: '5%' }} />
          <col style={{ width: '6%' }} /><col style={{ width: '6%' }} />
          <col style={{ width: 'auto' }} />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2}>Data</th>
            <th colSpan={2}>Partida</th>
            <th colSpan={2}>Chegada</th>
            <th colSpan={2}>Aeronave</th>
            <th colSpan={2}>Tempo (multipiloto)</th>
            <th rowSpan={2}>Nome PIC</th>
            <th colSpan={2}>Aterragens</th>
            <th colSpan={2}>Condições</th>
            <th colSpan={2}>Tempo de função</th>
            <th rowSpan={2}>Voo / Obs.</th>
          </tr>
          <tr>
            <th>Local</th><th>Hora</th>
            <th>Local</th><th>Hora</th>
            <th>Tipo</th><th>Matríc.</th>
            <th>Multip.</th><th>Total</th>
            <th>Dia</th><th>Noite</th>
            <th>Noite</th><th>IFR</th>
            <th>PIC</th><th>Co-pil.</th>
          </tr>
        </thead>
        <tbody>
          {page.rows.map((s, i) => (
            <tr key={i}>
              <td>{format(parseISO(s.date), 'dd/MM/yy')}</td>
              <td>{s.from}</td><td>{s.off}</td>
              <td>{s.to}</td><td>{s.on}</td>
              <td>{s.type}</td><td>{s.reg || ''}</td>
              <td>{hm(s.blockMin)}</td><td>{hm(s.blockMin)}</td>
              <td>{picName}</td>
              <td>{s.dayLdg || ''}</td><td>{s.nightLdg || ''}</td>
              <td>{hm(s.nightMin)}</td><td>{hm(s.ifrMin)}</td>
              <td>{fn === 'PIC' ? hm(s.blockMin) : ''}</td>
              <td>{fn === 'COPILOT' ? hm(s.blockMin) : ''}</td>
              <td className="obs">{s.flightNumber}</td>
            </tr>
          ))}
          {/* pad to a constant height so every printed page looks the same */}
          {Array.from({ length: Math.max(0, 16 - page.rows.length) }).map((_, i) => (
            <tr key={`pad-${i}`}>{Array.from({ length: COLS }).map((__, j) => <td key={j}>&nbsp;</td>)}</tr>
          ))}
          <TotalsRow label="Total desta página" t={page.page} />
          <TotalsRow label="Transporte (páginas anteriores)" t={page.broughtForward} />
          <TotalsRow label="TOTAL ACUMULADO" t={page.total} strong />
        </tbody>
      </table>
    </Box>
  );
}

export default function LogbookPrintPage() {
  const navigate = useNavigate();
  const { activeUser } = useRoster();
  const userId = activeUser?.id;

  const [rows, setRows] = useState<LogbookRow[]>([]);
  const reload = useCallback(async () => {
    setRows(userId ? await loadLogbook(userId) : []);
  }, [userId]);
  useEffect(() => { reload(); }, [reload]);

  const fn: LogbookFunction = userId ? getLogbookFunction(userId) : 'COPILOT';
  const fnLabel = fn === 'PIC' ? 'Comandante (PIC)' : 'Oficial Piloto (Co-piloto)';
  const pages = useMemo(() => paginateEasa(easaSectors(rows), fn), [rows, fn]);
  // Name PIC: when flying as PIC the entry is "SELF"; as co-pilot the captain isn't known here.
  const picName = fn === 'PIC' ? 'SELF' : '';

  // Hide the app chrome only while this page is mounted (scopes the print rules).
  useEffect(() => {
    document.body.classList.add('printing-easa');
    return () => document.body.classList.remove('printing-easa');
  }, []);

  return (
    <Box className="easa-root">
      <style>{PRINT_CSS}</style>

      <Box className="no-print" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <IconButton onClick={() => navigate(-1)}><ArrowBack /></IconButton>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>Caderneta EASA</Typography>
        <Button variant="contained" startIcon={<Print />} onClick={() => window.print()} disabled={rows.length === 0}>
          Imprimir
        </Button>
      </Box>

      <Box className="no-print" sx={{ mb: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          Função: <strong>{fnLabel}</strong> (altera em Definições). Multipiloto/multimotor, operação
          em IFR. As colunas monopiloto / instrução não se aplicam. Abre <strong>Imprimir</strong> e
          escolhe <strong>Guardar como PDF</strong>. Confere sempre contra a escala oficial.
        </Typography>
      </Box>

      {rows.length === 0 ? (
        <Typography className="no-print" color="text.secondary">Sem voos no diário ainda.</Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          {/* Title shown on the printed sheet */}
          <Box sx={{ mb: 1 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
              Caderneta de Voo (EASA) — {activeUser?.name ?? ''}
            </Typography>
            <Typography sx={{ fontSize: 11, color: '#444' }}>Função: {fnLabel}</Typography>
          </Box>
          {pages.map((p) => (
            <PageTable key={p.index} page={p} picName={picName} fn={fn} />
          ))}
        </Box>
      )}
    </Box>
  );
}
