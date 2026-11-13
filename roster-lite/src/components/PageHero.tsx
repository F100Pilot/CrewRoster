import type { ReactNode } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { darken, lighten } from '@mui/material/styles';
import { ArrowBack } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import SkyWeather, { SKY, useHere } from './SkyWeather';
import { useCurrentWeather } from '../state/useCurrentWeather';

export interface HeroStat { label: string; value: string }

// A page's banner, in the language of the "Hoje" header: the sky (time of day and weather where
// the crew member is), a coloured pill naming the
// section, a big title, a line under it, and the page's headline numbers as tiles. Pages put their
// own controls in `actions` (top right) or `children` (under the title, e.g. month arrows).
// 3D look (user-approved sketch): a panel floating over the page — lit top edge, long shadow, a
// shaded bottom with hills in front of the sky — the pill a raised key, the title in relief, the
// controls and the tiles as glass keys.

// Glass keys on the sky: round icon buttons and outlined buttons.
export const glassKey = {
  background: 'linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.08))',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.5), 0 4px 0 rgba(4,14,40,.45), 0 10px 14px -6px rgba(0,0,0,.5)',
  '&:active': { transform: 'translateY(3px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.4), 0 1px 0 rgba(4,14,40,.45)' },
};

// The hills in front of the sky, darker towards the viewer.
export function HeroHills() {
  return (
    <Box component="svg" aria-hidden viewBox="0 0 362 90" preserveAspectRatio="none"
      sx={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 70, pointerEvents: 'none' }}>
      <path d="M0 60 C60 40 120 70 190 50 C250 34 310 58 362 44 L362 90 L0 90 Z" fill="rgba(10,30,70,.30)" />
      <path d="M0 74 C70 58 140 84 210 68 C270 56 320 74 362 64 L362 90 L0 90 Z" fill="rgba(6,20,52,.45)" />
    </Box>
  );
}

export const heroPanel = {
  borderRadius: '26px',
  boxShadow: '0 26px 40px -18px rgba(12,34,80,.75), 0 10px 16px -6px rgba(12,34,80,.35), inset 0 1px 0 rgba(255,255,255,.45), inset 0 -18px 30px rgba(4,12,32,.35)',
};

export function pillKey(pill: string) {
  return {
    background: `linear-gradient(180deg, ${lighten(pill, 0.45)}, ${pill})`,
    boxShadow: `0 3px 0 ${darken(pill, 0.3)}, 0 7px 10px -4px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.9)`,
  };
}
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
  const here = useHere();
  const wx = useCurrentWeather(here.airport);
  const sky = here.sky;
  const c = SKY[sky];
  return (
    <Box
      component="header"
      sx={{
        // A floating panel just inside the page gutter. `&&&&` outranks the margin reset a parent
        // Stack puts on its children.
        '&&&&': { mx: { xs: -0.25, sm: 0 }, mt: 0 },
        background: c.bg, color: '#fff', position: 'relative', overflow: 'hidden', ...heroPanel,
        px: 2.25, pt: 1.75, pb: 2.5,
        // Light controls on the sky, as glass keys.
        '& .MuiIconButton-root': { color: '#fff', width: 36, height: 36, ...glassKey },
        '& .MuiButton-outlined, & .MuiButton-outlined:hover': { color: '#fff', border: 0, borderRadius: '12px', ...glassKey },
        '& .MuiButton-text': { color: '#fff' },
        // Segmented choices (e.g. the map's Plano/Globo): a glass trough cut into the sky, white
        // labels, the chosen one a pale key whose edge stays inside the trough.
        '& .MuiToggleButtonGroup-root': {
          background: 'rgba(4,14,40,.35)', padding: '3px', borderRadius: '14px',
          boxShadow: 'inset 0 2px 5px rgba(0,0,0,.4), inset 0 -1px 0 rgba(255,255,255,.18)',
        },
        '& .MuiToggleButton-root': { color: 'rgba(255,255,255,.88)', fontWeight: 700, px: 1.25, py: 0.25, lineHeight: 1.6 },
        '& .MuiToggleButton-root.Mui-selected, & .MuiToggleButton-root.Mui-selected:hover': {
          color: '#0B1222', background: `linear-gradient(180deg, ${lighten(pill, 0.45)}, ${pill})`,
          boxShadow: `0 2px 0 ${darken(pill, 0.3)}, inset 0 1px 0 rgba(255,255,255,.9)`,
        },
        // Weather can draw light clouds behind the text: a soft shadow keeps it legible.
        '& .MuiTypography-root': { textShadow: '0 1px 3px rgba(0, 0, 0, 0.28)' },
      }}
    >
      <SkyWeather sky={sky} wx={wx} now={here.now} top={52} />
      <HeroHills />
      <Box display="flex" alignItems="center" gap={1} position="relative" minHeight={36}>
        {back && (
          <IconButton size="small" edge="start" onClick={() => navigate(-1)} aria-label="Voltar">
            <ArrowBack />
          </IconButton>
        )}
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', height: 24, px: 1.25, borderRadius: 12, ...pillKey(pill), color: '#0B1222', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.06em' }}>
          {label.toUpperCase()}
        </Box>
        {wx && (
          <Typography component="span" title={`${wx.label} em ${here.airport}`} sx={{ fontSize: '0.75rem', fontWeight: 700, color: c.soft, whiteSpace: 'nowrap' }}>
            {wx.tempC}° {here.airport}
          </Typography>
        )}
        <Box flexGrow={1} />
        {actions}
      </Box>
      <Box position="relative" mt={1}>
        <Typography component="h1" sx={{ fontSize: '1.95rem', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', '&&': { textShadow: '0 2px 0 rgba(0,0,0,.2), 0 10px 22px rgba(0,0,0,.4)' } }}>
          {title}
        </Typography>
        {subtitle && <Typography sx={{ mt: 0.25, fontSize: '0.88rem', color: c.soft }}>{subtitle}</Typography>}
        {children}
        {stats && stats.length > 0 && (
          <Box display="grid" gridTemplateColumns={`repeat(${stats.length}, minmax(0, 1fr))`} gap={1} mt={1.5}>
            {stats.map((s) => (
              <Box key={s.label} sx={{ borderRadius: '14px', px: 1.25, py: 1, background: 'linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,.07))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.45), 0 8px 12px -6px rgba(0,0,0,.45)' }}>
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
