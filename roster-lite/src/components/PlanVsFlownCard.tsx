import { useMemo, useState, type ReactNode } from 'react';
import { Box, Card, CardActionArea, CardContent, IconButton, Stack, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight, CompareArrows } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { planVsFlown, LATE_MINUTES } from '../domain/planVsFlown';
import { ExperimentalChip } from './AeDisclaimer';
import { formatDuration } from '../utils/duration';
import type { ParsedDuty } from '../domain/types';

const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro'];

const shiftMonth = (key: string, by: number) => {
  const [y, m] = key.split('-').map(Number);
  const idx = y * 12 + (m - 1) + by;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
};
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const signed = (min: number) => `${min < 0 ? '−' : '+'}${formatDuration(Math.abs(min))}`;

// Planned against flown for one month: delays, extra duty, and the two events the RRRGS pays
// outside the plafonds — commander's extensions (cl. 2.6) and reduced rests (cl. 2.8) — so the
// pilot can check them on the payslip of the following month. Pilots only.
export default function PlanVsFlownCard({ duties, base }: { duties: ParsedDuty[]; base: string }) {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [month, setMonth] = useState(today.slice(0, 7));
  const r = useMemo(() => planVsFlown(duties, month, today, base), [duties, month, today, base]);
  const [y, m] = month.split('-').map(Number);
  const worst = [...r.sectors].filter((s) => s.arrDelay >= LATE_MINUTES).sort((a, b) => b.arrDelay - a.arrDelay).slice(0, 3);

  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box display="flex" alignItems="center" gap={1}>
          <CompareArrows fontSize="small" color="action" />
          <Typography variant="subtitle2" noWrap sx={{ flexGrow: 1 }}>Planeado vs. realizado</Typography>
          <ExperimentalChip />
        </Box>
        <Box display="flex" alignItems="center" justifyContent="center" my={0.25}>
          <IconButton size="small" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior"><ChevronLeft /></IconButton>
          <Typography variant="body2" fontWeight={600} sx={{ minWidth: 130, textAlign: 'center' }}>
            {MONTHS_LONG[m - 1]} {y}
          </Typography>
          <IconButton
            size="small" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mês seguinte"
            disabled={month >= today.slice(0, 7)}
          >
            <ChevronRight />
          </IconButton>
        </Box>

        {!r.hasPlan ? (
          <Typography variant="caption" color="text.secondary" display="block">
            Sem voos com o planeado registado neste mês. A app guarda o planeado quando sincronizas a
            escala depois de voar — a partir daí as diferenças aparecem aqui.
          </Typography>
        ) : (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, my: 1 }}>
              <Tile value={String(r.late)} label="Atrasos" />
              <Tile value={r.extraDuty === 0 ? '0' : signed(r.extraDuty)} label="Serviço" />
              <Tile value={String(r.extensions.length)} label="Ext. cmte" warn={r.extensions.length > 0} />
              <Tile value={String(r.reductions.length)} label="Desc. red." warn={r.reductions.length > 0} />
            </Box>

            <Stack spacing={0.25}>
              {r.extensions.map((e) => (
                <Line key={`e${e.date}`} onClick={() => navigate(`/day/${e.date}`)}>
                  <b>{ddmm(e.date)}</b> · FDP {formatDuration(e.fdp)} (máx. {formatDuration(e.max)}, +{formatDuration(e.over)})
                  — autoridade do comandante: 2h de duty-pay (RRRGS cl. 2.6)
                </Line>
              ))}
              {r.reductions.map((x) => (
                <Line key={`r${x.date}`} onClick={() => navigate(`/day/${x.date}`)}>
                  <b>{ddmm(x.date)}</b> · descanso {formatDuration(x.rest)} (mín. {formatDuration(x.required)}{x.away ? ', fora da base' : ''})
                  — {formatDuration(x.cut)} em duty-pay (RRRGS cl. 2.8)
                </Line>
              ))}
              {worst.map((s) => (
                <Line key={`s${s.date}${s.flightNumber}`} onClick={() => navigate(`/day/${s.date}`)}>
                  <b>{ddmm(s.date)}</b> · {s.flightNumber} {s.from}–{s.to} chegou {signed(s.arrDelay)}
                </Line>
              ))}
            </Stack>
            <Typography variant="caption" color="text.disabled" display="block" mt={0.75}>
              Atraso = chegada {LATE_MINUTES} min ou mais depois do planeado. Serviço = FDP voado menos o
              planeado. Só contam os voos cujo planeado a app viu antes do dia. Pagos no mês seguinte.
            </Typography>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Tile({ value, label, warn }: { value: string; label: string; warn?: boolean }) {
  return (
    <Stack alignItems="center" spacing={0.25} sx={{ minWidth: 0 }}>
      <Typography variant="subtitle1" fontWeight={700} noWrap color={warn ? 'warning.main' : undefined}>{value}</Typography>
      <Typography variant="caption" color="text.secondary" noWrap>{label}</Typography>
    </Stack>
  );
}

function Line({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <CardActionArea onClick={onClick} sx={{ borderRadius: 1, px: 0.5, py: 0.25 }}>
      <Typography variant="caption" color="text.secondary" display="block" lineHeight={1.35}>{children}</Typography>
    </CardActionArea>
  );
}
