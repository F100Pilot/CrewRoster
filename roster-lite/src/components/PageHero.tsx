import { useEffect, useState, type ReactNode } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { baseOf } from '../domain/dutyStats';
import { skyAt, type Sky } from '../domain/dayPhase';

// The sky over the crew member's base right now, shared by the "Hoje" header and every page's hero,
// so the whole app carries the same window onto outside: dawn, day, dusk or night.
export const SKY: Record<Sky, { bg: string; soft: string }> = {
  night: { bg: 'linear-gradient(180deg, #050D1C 0%, #0B2236 70%, #123247 100%)', soft: '#A9C3D3' },
  dawn: { bg: 'linear-gradient(180deg, #121A3A 0%, #2A2A5C 55%, #6B4258 85%, #A4614E 100%)', soft: '#E3D3DC' },
  day: { bg: 'linear-gradient(180deg, #164E96 0%, #1F63B5 55%, #2D74C4 100%)', soft: '#D6E6F8' },
  dusk: { bg: 'linear-gradient(180deg, #221C46 0%, #5A3560 60%, #8E4E4A 100%)', soft: '#EBD7D3' },
};

export function Stars() {
  const pts = [[6, 14], [18, 40], [31, 9], [46, 30], [58, 12], [72, 44], [84, 18], [93, 36], [64, 70], [24, 76]];
  return (
    <Box aria-hidden="true" sx={{ position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none' }}>
      {pts.map(([x, y], i) => (
        <Box key={i} sx={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: i % 3 ? 2 : 3, height: i % 3 ? 2 : 3, borderRadius: '50%', bgcolor: '#fff' }} />
      ))}
    </Box>
  );
}

// The sky over the base, re-read every few minutes.
export function useBaseSky(): Sky {
  const { activeUser } = useRoster();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 5 * 60_000);
    return () => clearInterval(t);
  }, []);
  return skyAt(baseOf(activeUser), now).sky;
}

export interface HeroStat { label: string; value: string }

// A page's banner, in the language of the "Hoje" header: the sky, a coloured pill naming the
// section, a big title, a line under it, and the page's headline numbers as tiles. Pages put their
// own controls in `actions` (top right) or `children` (under the title, e.g. month arrows).
export default function PageHero({
  label, title, subtitle, stats, actions, children, back = false, pill = '#93C5FD',
}: {
  label: string;
  title: ReactNode;
  subtitle?: ReactNode;
  stats?: HeroStat[];
  actions?: ReactNode;
  children?: ReactNode;
  back?: boolean;
  pill?: string;
}) {
  const navigate = useNavigate();
  const sky = useBaseSky();
  const c = SKY[sky];
  return (
    <Box
      component="header"
      sx={{
        // Full-bleed up to the app bar. `&&&&` outranks the margin reset a parent Stack puts on its
        // children, which would otherwise pull the banner back inside the page gutter.
        '&&&&': { mx: { xs: -2, sm: -3 }, mt: -2 },
        background: c.bg, color: '#fff', position: 'relative', overflow: 'hidden',
        px: 2.5, pt: 1.75, pb: 2.25,
        // Light controls on the sky.
        '& .MuiIconButton-root': { color: '#fff' },
        '& .MuiButton-outlined': { color: '#fff', borderColor: 'rgba(255,255,255,0.45)' },
        '& .MuiButton-text': { color: '#fff' },
      }}
    >
      {sky === 'night' && <Stars />}
      <Box display="flex" alignItems="center" gap={1} position="relative" minHeight={36}>
        {back && (
          <IconButton size="small" edge="start" onClick={() => navigate(-1)} aria-label="Voltar">
            <ArrowBack />
          </IconButton>
        )}
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', height: 24, px: 1.1, borderRadius: 12, bgcolor: pill, color: '#0B1222', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.06em' }}>
          {label.toUpperCase()}
        </Box>
        <Box flexGrow={1} />
        {actions}
      </Box>
      <Box position="relative" mt={1}>
        <Typography component="h1" sx={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>
          {title}
        </Typography>
        {subtitle && <Typography sx={{ mt: 0.25, fontSize: '0.88rem', color: c.soft }}>{subtitle}</Typography>}
        {children}
        {stats && stats.length > 0 && (
          <Box display="grid" gridTemplateColumns={`repeat(${stats.length}, minmax(0, 1fr))`} gap={1} mt={1.5}>
            {stats.map((s) => (
              <Box key={s.label} sx={{ borderRadius: '14px', bgcolor: 'rgba(255,255,255,0.12)', px: 1.25, py: 1 }}>
                <Typography noWrap sx={{ fontSize: '1.15rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{s.value}</Typography>
                <Typography noWrap sx={{ fontSize: '0.68rem', fontWeight: 600, color: c.soft }}>{s.label}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
