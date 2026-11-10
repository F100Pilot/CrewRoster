// What the banner's sky shows besides the time of day: the weather over the airport the crew
// member is at (from Open-Meteo's current conditions) and, at night, the moon in its real phase.

export type Condition = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunder';

// WMO weather interpretation code (Open-Meteo `weather_code`) → what to draw. Cloud cover breaks
// the 0–3 codes' tie when the model reports it: a "mainly clear" sky at 70 % cover reads as cloudy.
export function conditionOf(code: number, cloudPct?: number | null): Condition {
  if (code >= 95) return 'thunder';
  if (code === 82) return 'thunder'; // violent showers: the same dark, heavy sky
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 61 && code <= 67) || code === 80 || code === 81) return 'rain';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code === 45 || code === 48) return 'fog';
  if (code === 3) return 'cloudy';
  if (cloudPct != null && cloudPct >= 75) return 'cloudy';
  if (code === 1 || code === 2) return 'partly';
  if (cloudPct != null && cloudPct >= 30) return 'partly';
  return 'clear';
}

// Whether the sun or the moon can be seen through it.
export function bodyVisible(c: Condition): boolean {
  return c === 'clear' || c === 'partly';
}

const SYNODIC = 29.530588853;
const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14); // a known new moon

// Moon phase as a fraction of the synodic month: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter.
// A mean-month approximation — within about a day, plenty to draw it.
export function moonPhase(d: Date): number {
  const days = (d.getTime() - NEW_MOON_REF) / 86_400_000;
  const p = (days / SYNODIC) % 1;
  return p < 0 ? p + 1 : p;
}

// SVG path of the lit part of the moon (as seen from the northern hemisphere: waxing lit on the
// right). The outer edge is a half circle; the terminator is a half ellipse whose width follows
// the phase.
export function moonLitPath(phase: number, cx: number, cy: number, r: number): string {
  const k = Math.cos(2 * Math.PI * phase);
  const rx = Math.abs(k) * r;
  const waxing = phase < 0.5;
  const top = `${cx} ${cy - r}`;
  const bottom = `${cx} ${cy + r}`;
  // Outer arc top → bottom: through the right when waxing, the left when waning.
  const outer = waxing ? 1 : 0;
  // Terminator bottom → top: bulges toward the lit side for a crescent (k > 0), away for gibbous.
  const inner = waxing ? (k > 0 ? 0 : 1) : (k > 0 ? 1 : 0);
  return `M ${top} A ${r} ${r} 0 0 ${outer} ${bottom} A ${rx} ${r} 0 0 ${inner} ${top} Z`;
}
