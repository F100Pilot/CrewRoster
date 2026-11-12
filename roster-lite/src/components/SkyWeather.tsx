import { useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { useRoster } from '../state/useRoster';
import { baseOf } from '../domain/dutyStats';
import { dayContext, skyAt, type Sky } from '../domain/dayPhase';
import { bodyVisible, moonLitPath, moonPhase, type Condition } from '../domain/skyWeather';
import type { CurrentWeather } from '../state/useCurrentWeather';

// The banners' sky: the time of day at the airport the crew member is at, with the weather over
// it drawn on top — sun or moon (in its real phase), clouds, rain, snow, fog, lightning.

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

// Where the crew member is by the roster (base, or the layover airport) and the sky there,
// re-read every few minutes.
export function useHere(): { airport: string; sky: Sky; now: Date } {
  const { roster, activeUser } = useRoster();
  const base = baseOf(activeUser);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 5 * 60_000);
    return () => clearInterval(t);
  }, []);
  const airport = useMemo(
    () => (roster ? dayContext(roster.duties, now, base).location : base).toUpperCase(),
    [roster, now, base],
  );
  return { airport, sky: skyAt(airport, now).sky, now };
}

// A greyer sky under heavy weather, so the gradient doesn't stay postcard-blue in the rain.
const TINT: Partial<Record<Condition, string>> = {
  partly: 'rgba(70, 85, 105, 0.10)',
  cloudy: 'rgba(70, 82, 98, 0.42)',
  drizzle: 'rgba(66, 78, 94, 0.45)',
  rain: 'rgba(52, 62, 78, 0.55)',
  snow: 'rgba(150, 160, 175, 0.35)',
  thunder: 'rgba(30, 32, 48, 0.62)',
  fog: 'rgba(160, 170, 182, 0.38)',
};

const still = { '@media (prefers-reduced-motion: reduce)': { animation: 'none' } };
const drift = keyframes`from { transform: translateX(-18px); } to { transform: translateX(18px); }`;
const fall = keyframes`from { transform: translate(0, -30px) rotate(12deg); } to { transform: translate(-46px, 300px) rotate(12deg); }`;
const snowfall = keyframes`0% { transform: translate(0, -20px); } 50% { transform: translate(10px, 130px); } 100% { transform: translate(-6px, 290px); }`;
const flash = keyframes`0%, 88%, 100% { opacity: 0; } 89% { opacity: 0.7; } 90% { opacity: 0.1; } 92% { opacity: 0.55; } 94% { opacity: 0; }`;
const glow = keyframes`from { opacity: 0.85; } to { opacity: 1; }`;

// Clouds by how closed the sky is, kept to the right where the text is short; the first one sits
// by the sun / moon so a partly cloudy sky half covers it.
const CLOUDS = [
  { top: 30, right: 4, w: 84, dur: 34, delay: -6 },
  { top: 78, right: 2, w: 64, dur: 40, delay: -12 },
  { top: 0, right: 24, w: 96, dur: 48, delay: -20 },
  { top: 56, right: 30, w: 108, dur: 56, delay: -30 },
  { top: 110, right: 14, w: 92, dur: 44, delay: -2 },
];
const CLOUD_COUNT: Record<Condition, number> = { clear: 0, partly: 2, cloudy: 5, fog: 0, drizzle: 4, rain: 5, snow: 4, thunder: 5 };

function Cloud({ w, color, opacity }: { w: number; color: string; opacity: number }) {
  return (
    <svg width={w} height={w * 0.55} viewBox="0 0 64 35" style={{ display: 'block' }}>
      <g fill={color} opacity={opacity}>
        <circle cx="18" cy="22" r="11" />
        <circle cx="32" cy="15" r="14" />
        <circle cx="47" cy="22" r="10" />
        <rect x="18" y="20" width="29" height="13" rx="2" />
      </g>
    </svg>
  );
}

function Sun({ sky }: { sky: Sky }) {
  const low = sky !== 'day'; // dawn / dusk: a low, orange sun
  const core = low ? '#FFB36B' : '#FFD95A';
  // A ball, not a disc (3D look): lit from the top left, shaded bottom right, casting a shadow.
  return (
    <Box sx={{
      width: 50, height: 50, borderRadius: '50%',
      background: low
        ? 'radial-gradient(circle at 35% 30%, #FFE9B0 0%, #FFB347 50%, #E8642C 100%)'
        : 'radial-gradient(circle at 35% 30%, #FFF7D0 0%, #FFD24D 45%, #F29A1A 100%)',
      boxShadow: `0 0 0 8px ${core}29, 0 0 34px 14px ${core}55, inset -6px -8px 12px rgba(170,80,0,.35), 0 14px 16px -8px rgba(0,0,0,.4)`,
      animation: `${glow} 3.5s ease-in-out infinite alternate`, ...still,
    }} />
  );
}

function Moon({ now }: { now: Date }) {
  const phase = moonPhase(now);
  return (
    <svg width="46" height="46" viewBox="0 0 46 46" style={{ display: 'block', filter: 'drop-shadow(0 0 10px rgba(240,236,220,0.45))' }}>
      <circle cx="23" cy="23" r="20" fill="rgba(255,255,255,0.10)" />
      <defs>
        <radialGradient id="moon3d" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#FFFFFF" /><stop offset="55%" stopColor="#ECE8D8" /><stop offset="100%" stopColor="#B9B6A6" />
        </radialGradient>
      </defs>
      <path d={moonLitPath(phase, 23, 23, 20)} fill="url(#moon3d)" />
    </svg>
  );
}

export default function SkyWeather({ sky, wx, now, top = 46 }: {
  sky: Sky; wx: CurrentWeather | null; now: Date; top?: number;
}) {
  const c = wx?.condition ?? 'clear';
  const night = sky === 'night';
  const clouds = CLOUDS.slice(0, CLOUD_COUNT[c]);
  const heavy = c === 'rain' || c === 'thunder' || c === 'drizzle' || c === 'snow';
  const cloudColor = heavy || c === 'cloudy' ? (night ? '#5B6B7E' : '#C9D3DE') : '#FFFFFF';
  // Clouds stay translucent so the banner's white text keeps reading over them.
  const cloudOpacity = night ? 0.5 : heavy || c === 'cloudy' ? 0.5 : 0.8;
  const drops = c === 'rain' || c === 'thunder' ? 30 : c === 'drizzle' ? 16 : 0;
  return (
    <Box aria-hidden="true" sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {TINT[c] && <Box sx={{ position: 'absolute', inset: 0, bgcolor: TINT[c] }} />}
      {night && bodyVisible(c) && <Stars />}
      {bodyVisible(c) && (
        <Box sx={{ position: 'absolute', top, right: 22 }}>{night ? <Moon now={now} /> : <Sun sky={sky} />}</Box>
      )}
      {clouds.map((k, i) => (
        <Box key={i} sx={{
          position: 'absolute', top: top - 22 + k.top, right: `${k.right}%`, opacity: c === 'partly' && i > 0 ? 0.7 : 1,
          animation: `${drift} ${k.dur}s ease-in-out ${k.delay}s infinite alternate`, ...still,
        }}>
          <Cloud w={k.w} color={cloudColor} opacity={cloudOpacity} />
        </Box>
      ))}
      {Array.from({ length: drops }, (_, i) => (
        <Box key={`r${i}`} sx={{
          position: 'absolute', top: 0, left: `${(i * 37) % 100}%`,
          width: '1.5px', height: c === 'drizzle' ? 8 : 15, borderRadius: 1, bgcolor: 'rgba(210, 228, 255, 0.55)',
          animation: `${fall} ${(c === 'drizzle' ? 1.3 : 0.75) + ((i * 7) % 5) * 0.08}s linear ${-((i * 0.17) % 1.3)}s infinite`, ...still,
        }} />
      ))}
      {c === 'snow' && Array.from({ length: 22 }, (_, i) => (
        <Box key={`s${i}`} sx={{
          position: 'absolute', top: 0, left: `${(i * 41) % 100}%`, width: i % 3 ? 4 : 5, height: i % 3 ? 4 : 5,
          borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.85)',
          animation: `${snowfall} ${4.5 + (i % 4) * 0.8}s linear ${-(i * 0.45)}s infinite`, ...still,
        }} />
      ))}
      {c === 'fog' && [0, 1, 2].map((i) => (
        <Box key={`f${i}`} sx={{
          position: 'absolute', left: '-10%', width: '120%', top: `${28 + i * 24}%`, height: 22,
          borderRadius: 11, bgcolor: 'rgba(255,255,255,0.22)', filter: 'blur(7px)',
          animation: `${drift} ${18 + i * 6}s ease-in-out ${-i * 5}s infinite alternate`, ...still,
        }} />
      ))}
      {c === 'thunder' && (
        <>
          <Box sx={{ position: 'absolute', inset: 0, bgcolor: '#EEF2FF', opacity: 0, animation: `${flash} 7s linear infinite`, ...still }} />
          <Box sx={{ position: 'absolute', top: top + 4, right: '30%', opacity: 0, animation: `${flash} 7s linear infinite`, ...still }}>
            <svg width="26" height="44" viewBox="0 0 26 44"><path d="M15 0 L2 25 H12 L8 44 L24 16 H14 L19 0 Z" fill="#FFF3B0" /></svg>
          </Box>
        </>
      )}
    </Box>
  );
}
