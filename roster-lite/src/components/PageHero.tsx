import type { ReactNode } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import SkyWeather, { SKY, useHere } from './SkyWeather';
import { useCurrentWeather } from '../state/useCurrentWeather';

export interface HeroStat { label: string; value: string }

// A page's banner, in the language of the "Hoje" header: the sky (time of day and weather where
// the crew member is), a coloured pill naming the
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
  const here = useHere();
  const wx = useCurrentWeather(here.airport);
  const sky = here.sky;
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
        // Weather can draw light clouds behind the text: a soft shadow keeps it legible.
        '& .MuiTypography-root': { textShadow: '0 1px 3px rgba(0, 0, 0, 0.28)' },
      }}
    >
      <SkyWeather sky={sky} wx={wx} now={here.now} top={52} />
      <Box display="flex" alignItems="center" gap={1} position="relative" minHeight={36}>
        {back && (
          <IconButton size="small" edge="start" onClick={() => navigate(-1)} aria-label="Voltar">
            <ArrowBack />
          </IconButton>
        )}
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', height: 24, px: 1.1, borderRadius: 12, bgcolor: pill, color: '#0B1222', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.06em' }}>
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
