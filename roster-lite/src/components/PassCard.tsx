import type { ReactNode } from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';

// The "Hoje" cards, shared by every page so they all speak the same language (user: "os cartões
// do Hoje devem ser reproduzidos em todos os sítios"): a pass with a coloured strip, a small
// uppercase line, a big monospaced title and a dashed row of figures; a timeline row with a
// colour bar; and a number tile. Colours come from the theme, so they follow the "Hoje" phase
// palette inside that page and the app theme everywhere else.

export const PASS_MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

export const passOverline = {
  fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', color: 'text.secondary',
} as const;

export interface PassCell { label: string; value: string }

export function PassCells({ cells }: { cells: PassCell[] }) {
  return (
    <Box display="grid" gridTemplateColumns={`repeat(${cells.length}, minmax(0, 1fr))`} gap={0.5}
      sx={{ px: 2, py: 1.25, borderTop: 1, borderTopStyle: 'dashed', borderColor: 'divider' }}>
      {cells.map((c) => (
        <Box key={c.label} minWidth={0}>
          <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: 'text.secondary', letterSpacing: '0.04em' }}>{c.label}</Typography>
          <Typography noWrap sx={{ fontSize: '0.92rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.value}</Typography>
        </Box>
      ))}
    </Box>
  );
}

// A card whose whole surface opens something, with a visible keyboard focus.
function Surface({ onClick, label, highlight, children, sx }: {
  onClick?: () => void; label?: string; highlight?: boolean; children: ReactNode; sx?: object;
}) {
  const base = {
    display: 'block', width: '100%', textAlign: 'left', bgcolor: 'background.paper', color: 'text.primary',
    borderRadius: 3, border: 1, borderColor: highlight ? 'primary.main' : 'divider',
    boxShadow: highlight ? (t: { palette: { primary: { main: string } } }) => `0 0 0 1px ${t.palette.primary.main}` : 'none',
    overflow: 'hidden', ...sx,
  };
  if (!onClick) return <Box component="section" aria-label={label} sx={base}>{children}</Box>;
  return (
    <ButtonBase component="section" aria-label={label} onClick={onClick}
      sx={{ ...base, '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}>
      {children}
    </ButtonBase>
  );
}

export function PassCard({
  color, overline, badges, title, sub, cells, highlight, onClick, label, titleSize = '1.7rem',
}: {
  color: string;
  overline: ReactNode;
  badges?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  cells?: PassCell[];
  highlight?: boolean;
  onClick?: () => void;
  label?: string;
  titleSize?: string;
}) {
  return (
    <Surface onClick={onClick} label={label} highlight={highlight}>
      <Box sx={{ height: 6, bgcolor: color }} />
      <Box sx={{ px: 2, pt: 1.5, pb: 1.5 }}>
        <Box display="flex" alignItems="center" gap={0.75} flexWrap="wrap" minHeight={20}>
          <Typography component="div" sx={{ ...passOverline, flexGrow: 1, minWidth: 0 }}>{overline}</Typography>
          {badges}
        </Box>
        <Typography sx={{ fontFamily: PASS_MONO, fontSize: titleSize, fontWeight: 800, mt: 0.25, lineHeight: 1.2, wordBreak: 'break-word' }}>
          {title}
        </Typography>
        {sub && <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>{sub}</Typography>}
      </Box>
      {cells && cells.length > 0 && <PassCells cells={cells} />}
    </Surface>
  );
}

// A small pill for the pass's top line (Hoje, Novo, LIFUS · instr., …).
export function PassBadge({ children, color, filled = false }: { children: ReactNode; color: string; filled?: boolean }) {
  return (
    <Box component="span" sx={{
      display: 'inline-flex', alignItems: 'center', height: 20, px: 0.9, borderRadius: 10, fontSize: '0.66rem', fontWeight: 800,
      letterSpacing: '0.03em', whiteSpace: 'nowrap',
      ...(filled ? { bgcolor: color, color: '#fff' } : { border: `1px solid ${alpha(color, 0.6)}`, color }),
    }}>
      {children}
    </Box>
  );
}

// One line of a day: a colour bar, a monospaced title and what it is, times on the right.
export function TimelineRow({ color, title, sub, right, rightSub, live, done, onClick }: {
  color: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; rightSub?: ReactNode;
  live?: boolean; done?: boolean; onClick?: () => void;
}) {
  return (
    <Surface onClick={onClick} highlight={live} sx={{ borderRadius: 2.5, opacity: done ? 0.55 : 1 }}>
      <Box display="flex" alignItems="center" gap={1.25} sx={{ px: 1.5, py: 1 }}>
        <Box sx={{ width: 5, alignSelf: 'stretch', borderRadius: 1, bgcolor: live ? 'primary.main' : color }} />
        <Box minWidth={0} sx={{ flexGrow: 1 }}>
          <Typography noWrap sx={{ fontFamily: PASS_MONO, fontWeight: 700, fontSize: '0.92rem' }}>{title}</Typography>
          {sub && <Typography noWrap sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{sub}</Typography>}
        </Box>
        {(right || rightSub) && (
          <Box textAlign="right" flexShrink={0}>
            {right && <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{right}</Typography>}
            {rightSub && <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{rightSub}</Typography>}
          </Box>
        )}
      </Box>
    </Surface>
  );
}

// A headline number: small label, big value, a note under it.
export function StatTile({ label, value, note, children, center = false }: {
  label: string; value: string; note?: string; children?: ReactNode; center?: boolean;
}) {
  return (
    <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, border: 1, borderColor: 'divider', px: 1.5, py: 1.25, minWidth: 0, textAlign: center ? 'center' : 'left' }}>
      <Typography noWrap sx={passOverline}>{label}</Typography>
      <Typography noWrap sx={{ fontSize: '1.35rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
      {children}
      {note && <Typography noWrap sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{note}</Typography>}
    </Box>
  );
}
