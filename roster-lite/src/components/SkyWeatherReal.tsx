import { useId } from 'react';
import { Box } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import type { Sky } from '../domain/dayPhase';
import { bodyVisible, moonLitPath, moonPhase, type Condition } from '../domain/skyWeather';
import type { CurrentWeather } from '../state/useCurrentWeather';

// The "Realista" sky of the banners (user, 0.9.3.68: "um novo layout para a meteo … realista e moderno"; the flat
// drawings stay as "Ilustrado", chosen in Settings → App). A photographic sky: a gradient from zenith to a hazy
// horizon by the time of day and how closed the weather is, volumetric clouds (SVG fractal noise displacing soft
// shapes, shaded underneath), a sun with bloom or a textured moon in its real phase, rain in two depths, snow out of
// focus, drifting fog and lightning. Same inputs as SkyWeather; everything stays behind the banner's text, with a
// scrim on the left so the white type keeps reading.

const OVERCAST = new Set<Condition>(['cloudy', 'drizzle', 'rain', 'snow', 'thunder', 'fog']);

// Sky gradient: zenith → middle → horizon.
function skyColors(sky: Sky, c: Condition): [string, string, string] {
  if (c === 'thunder') return sky === 'night' ? ['#020409', '#0A0F18', '#151C27'] : ['#232A36', '#363E4C', '#525A68'];
  if (c === 'fog') return sky === 'night' ? ['#0C121A', '#1A232E', '#2C3640'] : ['#8693A0', '#A9B3BD', '#D0D6DC'];
  if (OVERCAST.has(c)) {
    if (sky === 'night') return ['#04070D', '#0D1622', '#1A2633'];
    // An overcast day is a bright silver-grey, not dusk (user, Nov 2026: "mesmo de dia, a imagem realista … está
    // escura"); rain only a shade darker.
    if (sky === 'day') return c === 'cloudy' ? ['#6C7F94', '#95A3B3', '#C8D0D8'] : ['#5D6E81', '#8494A5', '#B6C0CA'];
    return ['#2C2838', '#55485A', '#8E6E6A'];
  }
  switch (sky) {
    case 'night': return ['#01040B', '#06142A', '#12304C'];
    case 'dawn': return ['#152049', '#4E4273', '#E89A6C'];
    case 'dusk': return ['#191438', '#5E3767', '#EE7D4C'];
    default: return ['#0B4590', '#2A70C2', '#84B8E4'];
  }
}

interface CloudTone { top: string; base: string; shade: string; opacity: number }
function cloudTone(sky: Sky, c: Condition): CloudTone {
  if (sky === 'night') return c === 'thunder'
    ? { top: '#2B3340', base: '#141A23', shade: '#07090D', opacity: 0.95 }
    : { top: '#56667C', base: '#26344A', shade: '#111926', opacity: 0.8 };
  if (c === 'thunder') return { top: '#6E7886', base: '#333B47', shade: '#1B2028', opacity: 0.97 };
  if (OVERCAST.has(c)) return sky === 'day'
    ? c === 'cloudy' ? { top: '#F5F7FA', base: '#C3CBD4', shade: '#929DAA', opacity: 0.95 }
      : { top: '#E9EDF1', base: '#AAB4BF', shade: '#7A8693', opacity: 0.95 }
    : { top: '#C2A9A6', base: '#6E5C69', shade: '#40354A', opacity: 0.92 };
  if (sky === 'day') return { top: '#FFFFFF', base: '#C7D1DD', shade: '#8E9CAE', opacity: 0.97 };
  return { top: '#FFE0C8', base: '#B48B93', shade: '#5E4762', opacity: 0.95 };
}

// Soft shapes the noise turns into cloud — [cx, cy, rx, ry] in a 320 × 140 box.
const SCATTERED: number[][] = [[220, 64, 70, 26], [262, 52, 46, 24], [180, 74, 50, 18], [292, 76, 38, 16]];
const SCATTERED_FAR: number[][] = [[70, 46, 54, 14], [118, 40, 34, 12]];
const DECK: number[][] = [
  [20, 18, 90, 34], [110, 10, 100, 36], [210, 16, 96, 34], [300, 12, 80, 32],
  [60, 52, 70, 22], [170, 48, 84, 24], [270, 54, 78, 24],
];
const DECK_LOW: number[][] = [[90, 92, 74, 18], [230, 98, 86, 20]];

const still = { '@media (prefers-reduced-motion: reduce)': { animation: 'none' } };
const drift = keyframes`from { transform: translateX(-14px); } to { transform: translateX(14px); }`;
const twinkle = keyframes`0%, 100% { opacity: .9; } 50% { opacity: .35; }`;
const rainNear = keyframes`from { transform: translate(0, -40px) rotate(10deg); } to { transform: translate(-58px, 320px) rotate(10deg); }`;
const rainFar = keyframes`from { transform: translate(0, -20px) rotate(8deg); } to { transform: translate(-36px, 300px) rotate(8deg); }`;
const snowfall = keyframes`0% { transform: translate(0, -20px); } 50% { transform: translate(12px, 130px); } 100% { transform: translate(-8px, 290px); }`;
const flash = keyframes`0%, 86%, 100% { opacity: 0; } 87% { opacity: .85; } 88.5% { opacity: .15; } 90% { opacity: .7; } 93% { opacity: 0; }`;
const breathe = keyframes`from { opacity: .9; transform: scale(1); } to { opacity: 1; transform: scale(1.04); }`;

function CloudLayer({ id, shapes, tone, seed, displace, blur, freq = '0.014 0.026', w = 320, h = 140, opacity = 1 }: {
  id: string; shapes: number[][]; tone: CloudTone; seed: number; displace: number; blur: number; freq?: string; w?: number; h?: number; opacity?: number;
}) {
  const f = `${id}-f${seed}`;
  const g = `${id}-g${seed}`;
  const shape = (dy: number, k = 1) => shapes.map(([cx, cy, rx, ry], i) => (
    <ellipse key={i} cx={cx} cy={cy + dy} rx={rx * k} ry={ry * k} />
  ));
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" style={{ display: 'block', overflow: 'visible', opacity }}>
      <defs>
        <filter id={f} x="-30%" y="-60%" width="160%" height="220%">
          <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves="4" seed={seed} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={displace} xChannelSelector="R" yChannelSelector="G" />
          <feGaussianBlur stdDeviation={blur} />
        </filter>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone.top} />
          <stop offset="100%" stopColor={tone.base} />
        </linearGradient>
      </defs>
      {/* The shaded underside, then the body lit from above, then the sunlit tops. */}
      <g filter={`url(#${f})`} fill={tone.shade} opacity={0.55 * tone.opacity}>{shape(7)}</g>
      <g filter={`url(#${f})`} fill={`url(#${g})`} opacity={tone.opacity}>{shape(0)}</g>
      <g filter={`url(#${f})`} fill={tone.top} opacity={0.5 * tone.opacity}>{shape(-6, 0.6)}</g>
    </svg>
  );
}

function Sun({ low, top }: { low: boolean; top: number }) {
  const size = low ? 230 : 210;
  return (
    <>
      <Box sx={{
        position: 'absolute', width: size, height: size, right: 48 - size / 2, top: (low ? top + 70 : top + 24) - size / 2,
        borderRadius: '50%',
        background: low
          ? 'radial-gradient(circle, #FFF4DA 0 6%, #FFC27A 10%, rgba(255,150,80,.55) 20%, rgba(255,120,70,.22) 38%, transparent 66%)'
          : 'radial-gradient(circle, #FFFFFF 0 7%, #FFF6D8 10%, rgba(255,236,170,.55) 17%, rgba(255,220,140,.2) 34%, transparent 64%)',
        animation: `${breathe} 5s ease-in-out infinite alternate`, ...still,
      }} />
      {/* A faint lens flare down the diagonal, as a camera would catch it. */}
      {!low && [[70, 52, 18, 0.1], [118, 92, 9, 0.12], [150, 120, 26, 0.06]].map(([dx, dy, r, a], i) => (
        <Box key={i} sx={{
          position: 'absolute', width: r * 2, height: r * 2, borderRadius: '50%',
          right: 48 + dx - r, top: top + 24 + dy - r,
          background: `radial-gradient(circle, rgba(255,255,255,${a * 1.6}) 0%, rgba(190,220,255,${a}) 60%, transparent 72%)`,
        }} />
      ))}
      {low && (
        <Box sx={{
          position: 'absolute', left: '-10%', right: '-10%', top: top + 46, height: 70,
          background: 'radial-gradient(60% 50% at 82% 50%, rgba(255,170,100,.35), transparent 70%)',
        }} />
      )}
    </>
  );
}

function Moon({ id, now, top }: { id: string; now: Date; top: number }) {
  const phase = moonPhase(now);
  const lit = moonLitPath(phase, 30, 30, 22);
  return (
    <Box sx={{ position: 'absolute', right: 26, top: top - 6, width: 60, height: 60 }}>
      <Box sx={{ position: 'absolute', inset: -40, borderRadius: '50%', background: 'radial-gradient(circle, rgba(220,228,240,.22) 0%, rgba(200,214,235,.08) 35%, transparent 62%)' }} />
      <svg width="60" height="60" viewBox="0 0 60 60" style={{ position: 'relative', display: 'block' }}>
        <defs>
          <radialGradient id={`${id}-m`} cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#FBFAF4" /><stop offset="70%" stopColor="#E3DFD2" /><stop offset="100%" stopColor="#C4C0B2" />
          </radialGradient>
          <filter id={`${id}-maria`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="11" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.43  0 0 0 0 0.45  1.9 0 0 0 -0.82" />
          </filter>
          <clipPath id={`${id}-lit`}><path d={lit} /></clipPath>
        </defs>
        {/* Earthshine on the dark part, then the lit part with its maria. */}
        <circle cx="30" cy="30" r="22" fill="rgba(200,210,230,0.07)" />
        <path d={lit} fill={`url(#${id}-m)`} />
        <rect x="8" y="8" width="44" height="44" filter={`url(#${id}-maria)`} clipPath={`url(#${id}-lit)`} opacity="0.45" />
      </svg>
    </Box>
  );
}

const STARS = Array.from({ length: 46 }, (_, i) => ({
  x: (i * 61 + 13) % 100, y: (i * 37 + 7) % 78, r: [0.6, 0.8, 1, 1.4][i % 4], d: 2.5 + (i % 5) * 0.9, delay: -(i % 7) * 0.6,
}));

export default function SkyWeatherReal({ sky, wx, now, top = 46 }: {
  sky: Sky; wx: CurrentWeather | null; now: Date; top?: number;
}) {
  const id = `sw${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const c = wx?.condition ?? 'clear';
  const night = sky === 'night';
  const [z, m, hz] = skyColors(sky, c);
  const tone = cloudTone(sky, c);
  const deck = OVERCAST.has(c) && c !== 'fog';
  const rain = c === 'rain' || c === 'thunder' ? 1 : c === 'drizzle' ? 0.5 : 0;
  return (
    <Box aria-hidden="true" sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <Box sx={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${z} 0%, ${m} 58%, ${hz} 100%)` }} />

      {night && bodyVisible(c) && STARS.map((s, i) => (
        <Box key={i} sx={{
          position: 'absolute', left: `${s.x}%`, top: `${s.y}%`, width: s.r * 2, height: s.r * 2, borderRadius: '50%',
          bgcolor: '#fff', boxShadow: s.r > 1 ? '0 0 4px rgba(255,255,255,.8)' : undefined,
          animation: `${twinkle} ${s.d}s ease-in-out ${s.delay}s infinite`, ...still,
        }} />
      ))}

      {bodyVisible(c) && (night ? <Moon id={id} now={now} top={top} /> : <Sun low={sky !== 'day'} top={top} />)}

      {c === 'partly' && (
        <>
          <Box sx={{ position: 'absolute', top: top + 58, right: '18%', width: '40%', height: 70, opacity: 0.4, animation: `${drift} 70s ease-in-out -20s infinite alternate`, ...still }}>
            <CloudLayer id={id} shapes={SCATTERED_FAR} tone={tone} seed={3} displace={38} blur={2.2} />
          </Box>
          {/* Kept on the right, where the banner's text is short, half over the sun. */}
          <Box sx={{ position: 'absolute', top: top - 34, right: '-12%', width: '62%', height: 110, animation: `${drift} 50s ease-in-out -8s infinite alternate`, ...still }}>
            <CloudLayer id={id} shapes={SCATTERED} tone={tone} seed={7} displace={46} blur={1.6} />
          </Box>
        </>
      )}

      {deck && (
        <>
          <Box sx={{ position: 'absolute', top: -18, left: '-8%', width: '116%', height: '72%', animation: `${drift} 80s ease-in-out -30s infinite alternate`, ...still }}>
            <CloudLayer id={id} shapes={DECK} tone={tone} seed={5} displace={72} blur={2.6} freq="0.02 0.03" />
          </Box>
          <Box sx={{ position: 'absolute', top: '22%', left: '-6%', width: '112%', height: '55%', opacity: 0.9, animation: `${drift} 60s ease-in-out -12s infinite alternate-reverse`, ...still }}>
            <CloudLayer id={id} shapes={DECK_LOW} tone={{ ...tone, top: tone.base, base: tone.shade }} seed={9} displace={60} blur={2.2} freq="0.022 0.032" />
          </Box>
        </>
      )}

      {rain > 0 && [0, 1].map((near) => Array.from({ length: Math.round((near ? 26 : 34) * rain) }, (_, i) => (
        <Box key={`r${near}-${i}`} sx={{
          position: 'absolute', top: 0, left: `${(i * (near ? 41 : 29) + near * 11) % 104}%`,
          width: near ? '1.4px' : '1px', height: near ? 24 : 12, borderRadius: 1,
          background: `linear-gradient(180deg, transparent, rgba(222,236,255,${near ? 0.62 : 0.32}))`,
          animation: `${near ? rainNear : rainFar} ${(near ? 0.62 : 0.95) + ((i * 7) % 5) * 0.07}s linear ${-((i * 0.19) % 1.2)}s infinite`, ...still,
        }} />
      )))}

      {c === 'snow' && Array.from({ length: 30 }, (_, i) => {
        const near = i % 4 === 0;
        const s = near ? 7 : 2 + (i % 3);
        return (
          <Box key={`s${i}`} sx={{
            position: 'absolute', top: 0, left: `${(i * 43) % 100}%`, width: s, height: s, borderRadius: '50%',
            bgcolor: `rgba(255,255,255,${near ? 0.55 : 0.85})`, filter: near ? 'blur(1.5px)' : undefined,
            animation: `${snowfall} ${(near ? 3.8 : 5.2) + (i % 4) * 0.7}s linear ${-(i * 0.43)}s infinite`, ...still,
          }} />
        );
      })}

      {c === 'fog' && (
        <>
          <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(225,230,236,.08), rgba(225,230,236,.32))' }} />
          {[0, 1, 2, 3].map((i) => (
            <Box key={`f${i}`} sx={{
              position: 'absolute', left: '-20%', width: '140%', top: `${18 + i * 20}%`, height: 34,
              background: 'radial-gradient(50% 50% at 50% 50%, rgba(235,240,245,.45), transparent 70%)', filter: 'blur(6px)',
              animation: `${drift} ${22 + i * 7}s ease-in-out ${-i * 6}s infinite alternate`, ...still,
            }} />
          ))}
        </>
      )}

      {c === 'thunder' && (
        <>
          <Box sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(70% 55% at 70% 25%, rgba(225,232,255,.9), rgba(200,210,255,.25) 60%, transparent 80%)', opacity: 0, animation: `${flash} 8s linear infinite`, ...still }} />
          <Box sx={{ position: 'absolute', top: top + 6, right: '26%', opacity: 0, animation: `${flash} 8s linear infinite`, ...still }}>
            <svg width="40" height="110" viewBox="0 0 40 110" style={{ overflow: 'visible' }}>
              <defs>
                <filter id={`${id}-bolt`} x="-100%" y="-20%" width="300%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <polyline points="22,0 16,22 24,30 12,54 20,60 6,92 9,110" fill="none" stroke="#F3F6FF" strokeWidth="2.2" strokeLinejoin="round" filter={`url(#${id}-bolt)`} />
              <polyline points="16,22 4,36 8,44" fill="none" stroke="#E2E8FF" strokeWidth="1.2" strokeLinejoin="round" filter={`url(#${id}-bolt)`} />
            </svg>
          </Box>
        </>
      )}

      {/* Keeps the banner's white type reading over bright skies and clouds: the text on the left and the top line. */}
      <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(4,10,24,.42) 0%, rgba(4,10,24,.16) 48%, transparent 72%)' }} />
      <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(4,10,24,.34) 0%, transparent 26%)' }} />
    </Box>
  );
}
