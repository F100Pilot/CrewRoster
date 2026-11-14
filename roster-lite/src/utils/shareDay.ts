import { format, getDaysInMonth, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { diffMinutes, formatDuration } from './duration';
import { downloadBlob } from './download';
import { operatedFlights } from '../domain/flightTime';
import { APP_NAME, APP_VERSION_LABEL } from '../version';
import type { ParsedDuty } from '../domain/types';
import { darken, lighten } from '@mui/material/styles';
import { dutyColor } from '../theme';
import { dayDestination, legsOf } from '../domain/dayPhase';
import { toLocalTime } from './localTime';

// Tier 3 — turn a single day's duties into a shareable branded image. Drawn on a
// canvas (no dependencies), then offered through the native share sheet when the
// device supports sharing files, otherwise downloaded as a PNG.

const C = {
  top: '#3949ab',
  bottom: '#1a237e',
  white: '#ffffff',
  dim: 'rgba(255,255,255,0.72)',
  faint: 'rgba(255,255,255,0.45)',
  accent: '#90caf9',
  rule: 'rgba(255,255,255,0.22)',
};

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function renderCard(date: string, duties: ParsedDuty[], subtitle?: string): HTMLCanvasElement {
  const scale = 2;
  const W = 540;
  const pad = 32;

  // Pre-measure height from the duties so the card hugs its content.
  let H = pad + 44 + 48 + (subtitle ? 24 : 0) + 28;
  for (const d of duties) H += d.flightNumber ? 116 : 60;
  H += 44;
  H = Math.max(H, 300);

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.top);
  g.addColorStop(1, C.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  let y = pad + 24;

  // Brand
  ctx.fillStyle = C.white;
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText('✈ CrewRoster', pad, y);
  y += 44;

  // Date
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText(format(parseISO(date), 'EEE, dd MMM yyyy'), pad, y);
  y += subtitle ? 26 : 20;

  if (subtitle) {
    ctx.fillStyle = C.dim;
    ctx.font = `400 16px ${FONT}`;
    ctx.fillText(subtitle, pad, y);
    y += 22;
  }

  // Divider
  y += 6;
  ctx.strokeStyle = C.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(W - pad, y);
  ctx.stroke();
  y += 30;

  for (const d of duties) {
    if (d.flightNumber) {
      ctx.fillStyle = C.white;
      ctx.font = `700 22px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(d.flightNumber, pad, y);
      if (d.aircraftType) {
        ctx.fillStyle = C.dim;
        ctx.font = `400 16px ${FONT}`;
        ctx.textAlign = 'right';
        ctx.fillText(d.aircraftType, W - pad, y);
        ctx.textAlign = 'left';
      }
      y += 30;

      const route =
        `${d.departureAirport ?? '—'} ${d.departureTime ?? '--:--'}z` +
        `   →   ${d.arrivalAirport ?? '—'} ${d.arrivalTime ?? '--:--'}z`;
      ctx.fillStyle = C.accent;
      ctx.font = `600 20px ${FONT}`;
      ctx.fillText(route, pad, y);
      y += 26;

      if (d.departureTime && d.arrivalTime) {
        ctx.fillStyle = C.dim;
        ctx.font = `400 15px ${FONT}`;
        ctx.fillText(`Bloco ${formatDuration(diffMinutes(d.departureTime, d.arrivalTime))}`, pad, y);
      }
      y += 60;
    } else {
      ctx.fillStyle = C.white;
      ctx.font = `700 20px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(d.dutyCode, pad, y);
      ctx.fillStyle = C.dim;
      ctx.font = `400 16px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(d.dutyType, W - pad, y);
      ctx.textAlign = 'left';
      y += 44;
    }
  }

  // Footer
  ctx.fillStyle = C.faint;
  ctx.font = `400 13px ${FONT}`;
  ctx.fillText(`Gerado por ${APP_NAME} ${APP_VERSION_LABEL}`, pad, H - pad + 4);

  return canvas;
}

// A shareable summary card for a whole month (YYYY-MM): totals + the routes flown, ranked.
// Short words for the legend and the day keys, in Portuguese (the parser's types stay in English).
const MONTH_LABEL: Record<string, string> = {
  'Flight Duty': 'Voo', Positioning: 'Posicionamento', 'Standby Airport': 'Assistência', 'Standby Home': 'Assistência',
  Reserve: 'Reserva', 'Office Duty': 'Gabinete', Training: 'Formação', Simulator: 'Simulador', Medical: 'Médico',
  Absence: 'Ausência', Vacation: 'Férias', 'Day Off': 'Folga', Other: 'Outro',
};
const DAY_WORD: Record<string, string> = { 'Day Off': 'Folga', Vacation: 'Férias', Medical: 'Médico', Absence: 'Ausência' };

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// What a day's key says: on a flying day the place it goes to and the first departure (local
// time), otherwise the duty in a word or its code.
function dayKey(date: string, day: ParsedDuty[], base: string): { main: ParsedDuty | null; line1: string; line2: string } {
  const main = day.find((x) => x.dutyType === 'Flight Duty' || x.dutyType === 'Positioning')
    ?? day.find((x) => x.dutyType !== 'Day Off') ?? day[0] ?? null;
  if (!main) return { main: null, line1: '', line2: '' };
  const legs = legsOf(date, day);
  if (legs.length) {
    const first = legs[0].duty;
    const dest = dayDestination(legs, base) ?? legs[legs.length - 1].duty.arrivalAirport ?? '';
    const t = first.departureTime ? (toLocalTime(date, first.departureTime, first.departureAirport) ?? `${first.departureTime}z`) : '';
    return { main, line1: dest, line2: t };
  }
  const word = DAY_WORD[main.dutyType];
  if (word) return { main, line1: word, line2: '' };
  const t = main.departureTime ? (toLocalTime(date, main.departureTime, main.departureAirport ?? base) ?? `${main.departureTime}z`) : '';
  return { main, line1: main.dutyCode.length > 7 ? main.dutyCode.slice(0, 7) : main.dutyCode, line2: t };
}

// The whole month as a calendar (user: the image "não mostra o calendário todo"): every day a key
// coloured by its duty, as in the app, with where the flying goes and when it starts; under it the
// month's numbers and a colour legend. Schedule only — no crew names or pay.
function renderMonthCard(monthKey: string, duties: ParsedDuty[], subtitle?: string, base = 'LIS'): HTMLCanvasElement {
  const month = duties.filter((d) => d.date.startsWith(monthKey));
  const flights = operatedFlights(month);
  const flightDays = new Set(flights.map((d) => d.date)).size;
  const block = flights.reduce((s, d) => s + diffMinutes(d.departureTime!, d.arrivalTime!), 0);
  const offDays = new Set(month.filter((d) => d.dutyType === 'Day Off').map((d) => d.date)).size;
  const first = parseISO(`${monthKey}-01`);
  const nDays = getDaysInMonth(first);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const rows = Math.ceil((lead + nDays) / 7);
  const title = format(first, 'MMMM yyyy', { locale: pt });
  // Days off are drawn as plain glass keys, so their swatch is glass too.
  const swatch = (t: string) => (t === 'Day Off' ? 'rgba(255,255,255,0.3)' : dutyColor(t));
  const legend = [...new Map(month.map((d) => [d.dutyCode === 'S.EXT.' ? 'Serviço externo' : MONTH_LABEL[d.dutyType] ?? d.dutyType, swatch(d.dutyType)])).entries()];

  const scale = 2, W = 560, pad = 28, gap = 6;
  const cellW = (W - 2 * pad - 6 * gap) / 7;
  const cellH = 70;
  const headerH = 24 + 40 + (subtitle ? 24 : 4) + 18;
  const gridH = 22 + rows * (cellH + gap);
  const legendRows = Math.ceil(legend.length / 3);
  const H = pad + headerH + gridH + 40 + legendRows * 24 + 40;

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.top);
  g.addColorStop(1, C.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  let y = pad + 20;
  ctx.fillStyle = C.white;
  ctx.font = `700 20px ${FONT}`;
  ctx.fillText('✈ CrewRoster', pad, y);
  y += 40;
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText(title.charAt(0).toUpperCase() + title.slice(1), pad, y);
  if (subtitle) {
    y += 24;
    ctx.fillStyle = C.dim;
    ctx.font = `400 15px ${FONT}`;
    ctx.fillText(subtitle, pad, y);
  } else y += 4;
  y += 18;

  // Weekday heads.
  ctx.font = `800 11px ${FONT}`;
  ctx.fillStyle = C.dim;
  ctx.textAlign = 'center';
  ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'].forEach((w, i) => ctx.fillText(w, pad + i * (cellW + gap) + cellW / 2, y + 12));
  y += 22;

  for (let n = 1; n <= nDays; n++) {
    const i = lead + n - 1;
    const x = pad + (i % 7) * (cellW + gap);
    const top = y + Math.floor(i / 7) * (cellH + gap);
    const date = `${monthKey}-${String(n).padStart(2, '0')}`;
    const { main, line1, line2 } = dayKey(date, month.filter((d) => d.date === date), base);
    const off = !main || main.dutyType === 'Day Off';
    const col = main ? dutyColor(main.dutyType) : '#9e9e9e';
    // A key: its darker edge underneath, then the lit face.
    ctx.fillStyle = off ? 'rgba(0,0,0,0.28)' : darken(col, 0.4);
    roundRect(ctx, x, top + 3, cellW, cellH - 3, 11);
    ctx.fill();
    if (off) {
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
    } else {
      const kg = ctx.createLinearGradient(0, top, 0, top + cellH);
      kg.addColorStop(0, lighten(col, 0.25));
      kg.addColorStop(1, darken(col, 0.05));
      ctx.fillStyle = kg;
    }
    roundRect(ctx, x, top, cellW, cellH - 4, 11);
    ctx.fill();

    ctx.fillStyle = C.white;
    ctx.textAlign = 'left';
    ctx.font = `800 17px ${FONT}`;
    ctx.fillText(String(n), x + 8, top + 22);
    ctx.textAlign = 'center';
    if (line1) {
      ctx.font = `800 ${line1.length > 5 ? 11 : 13}px ${FONT}`;
      ctx.fillText(line1, x + cellW / 2, top + 44, cellW - 6);
    }
    if (line2) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `600 11px ${FONT}`;
      ctx.fillText(line2, x + cellW / 2, top + 59, cellW - 6);
    }
  }
  y += rows * (cellH + gap) + 26;

  ctx.textAlign = 'left';
  ctx.fillStyle = C.accent;
  ctx.font = `700 17px ${FONT}`;
  ctx.fillText(`${flightDays} dias de voo · ${flights.length} setores · Bloco ${formatDuration(block)} · ${offDays} folgas`, pad, y, W - 2 * pad);
  y += 26;

  ctx.font = `600 13px ${FONT}`;
  const colW = (W - 2 * pad) / 3;
  legend.forEach(([label, color], i) => {
    const lx = pad + (i % 3) * colW;
    const ly = y + Math.floor(i / 3) * 24;
    ctx.fillStyle = color;
    roundRect(ctx, lx, ly - 11, 14, 14, 4);
    ctx.fill();
    ctx.fillStyle = C.white;
    ctx.fillText(label, lx + 20, ly + 1);
  });

  ctx.fillStyle = C.faint;
  ctx.font = `400 12px ${FONT}`;
  ctx.fillText(`Horas locais · Gerado por ${APP_NAME} ${APP_VERSION_LABEL}`, pad, H - pad + 6);
  return canvas;
}

async function shareCanvas(canvas: HTMLCanvasElement, fileName: string, title: string, text: string): Promise<void> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem'))), 'image/png')
  );
  const file = new File([blob], fileName, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
    }
  }
  downloadBlob(blob, fileName);
}

// Share the whole month as a branded calendar image.
export async function shareMonthImage(monthKey: string, duties: ParsedDuty[], subtitle?: string, base?: string): Promise<void> {
  const canvas = renderMonthCard(monthKey, duties, subtitle, base);
  const title = format(parseISO(`${monthKey}-01`), 'MMMM yyyy', { locale: pt });
  await shareCanvas(canvas, `escala-${monthKey}.png`, 'Escala', `Escala de ${title}`);
}

export async function shareDayImage(date: string, duties: ParsedDuty[], subtitle?: string): Promise<void> {
  const canvas = renderCard(date, duties, subtitle);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem'))), 'image/png')
  );
  const fileName = `escala-${date}.png`;
  const file = new File([blob], fileName, { type: 'image/png' });

  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Escala',
        text: `Escala de ${format(parseISO(date), 'dd/MM/yyyy')}`,
      });
      return;
    } catch (e) {
      // User dismissed the share sheet — nothing more to do.
      if (e instanceof Error && e.name === 'AbortError') return;
      // Any other failure falls through to a plain download.
    }
  }
  downloadBlob(blob, fileName);
}
