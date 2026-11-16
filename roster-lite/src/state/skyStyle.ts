import { useEffect, useState } from 'react';

// How the banners draw the sky (user, 0.9.3.68: "um novo layout para a meteo … realista e moderno", with a selector to
// keep the old one): 'illustrated' = the flat sun / cloud drawings since 0.8.30, 'realistic' = a photographic sky
// (SkyWeatherReal). A per-device preference, like the colour mode.
export type SkyStyle = 'illustrated' | 'realistic';

const KEY = 'crewroster.skyStyle';
const EVENT = 'sky-style-changed';

function getSkyStyle(): SkyStyle {
  try {
    return localStorage.getItem(KEY) === 'realistic' ? 'realistic' : 'illustrated';
  } catch {
    return 'illustrated';
  }
}

export function setSkyStyle(s: SkyStyle): void {
  try { localStorage.setItem(KEY, s); } catch { /* not persisted — this session only */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: s }));
}

// The current style, following changes made in Settings while a banner is on screen.
export function useSkyStyle(): SkyStyle {
  const [s, setS] = useState<SkyStyle>(getSkyStyle);
  useEffect(() => {
    const on = (e: Event) => setS((e as CustomEvent<SkyStyle>).detail ?? getSkyStyle());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return s;
}
