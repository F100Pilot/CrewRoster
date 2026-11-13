import type { ReactNode } from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { depth } from '../theme';

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

// A card whose whole surface opens something, with a visible keyboard focus. 3D look: lit from
// above and lifted off the page (level 1 for rows, 2 for cards); the live one ringed in the accent.
function Surface({ onClick, label, highlight, children, sx, level = 2 }: {
  onClick?: () => void; label?: string; highlight?: boolean; children: ReactNode; sx?: object; level?: 1 | 2;
}) {
  const theme = useTheme();
  const d = depth(theme.palette.mode);
  const lift = level === 1 ? d.low : d.card;
  const base = {
    display: 'block', width: '100%', textAlign: 'left', color: 'text.primary',
    // The page's own card colour (the "Hoje" phase palette) under the light from above.
    bgcolor: 'background.paper',
    backgroundImage: theme.palette.mode === 'light' ? 'linear-gradient(180deg, rgba(255,255,255,.7), rgba(15,27,45,.03))' : 'linear-gradient(180deg, rgba(255,255,255,.05), rgba(0,0,0,.08))',
    borderRadius: level === 1 ? '16px' : '20px', border: 0,
    boxShadow: highlight ? `0 0 0 2px ${theme.palette.primary.main}, ${lift}` : lift,
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
      <Box sx={{ height: 7, bgcolor: color, backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.35))', boxShadow: 'inset 0 -2px 0 rgba(0,0,0,.15)' }} />
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
export function TimelineRow({ color, title, sub, right, rightSub, live, done, onClick, wrapSub = false }: {
  color: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; rightSub?: ReactNode;
  live?: boolean; done?: boolean; onClick?: () => void; wrapSub?: boolean;
}) {
  return (
    <Surface onClick={onClick} highlight={live} level={1} sx={{ opacity: done ? 0.55 : 1 }}>
      <Box display="flex" alignItems="center" gap={1.25} sx={{ px: 1.5, py: 1 }}>
        <Box sx={{ width: 6, alignSelf: 'stretch', borderRadius: 1, bgcolor: live ? 'primary.main' : color, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,.35), rgba(0,0,0,.1))', boxShadow: `0 2px 4px ${alpha(color, 0.5)}` }} />
        <Box minWidth={0} sx={{ flexGrow: 1 }}>
          <Typography noWrap sx={{ fontFamily: PASS_MONO, fontWeight: 700, fontSize: '0.92rem' }}>{title}</Typography>
          {sub && <Typography noWrap={!wrapSub} sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{sub}</Typography>}
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
  const theme = useTheme();
  const d = depth(theme.palette.mode);
  return (
    <Box sx={{
      bgcolor: 'background.paper', backgroundImage: theme.palette.mode === 'light' ? 'linear-gradient(180deg, rgba(255,255,255,.7), rgba(15,27,45,.04))' : 'linear-gradient(180deg, rgba(255,255,255,.05), rgba(0,0,0,.08))',
      borderRadius: '16px', boxShadow: d.low, px: 1.5, py: 1.25, minWidth: 0, textAlign: center ? 'center' : 'left',
    }}>
      <Typography noWrap sx={passOverline}>{label}</Typography>
      <Typography noWrap sx={{ fontSize: '1.35rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
      {children}
      {note && <Typography noWrap sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{note}</Typography>}
    </Box>
  );
}
