import { format, parseISO } from 'date-fns';
import { diffMinutes, formatDuration } from './duration';
import { downloadBlob } from './download';
import { APP_NAME, APP_VERSION_LABEL } from '../version';
import type { ParsedDuty } from '../domain/types';

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
