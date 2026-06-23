// Single source for the app's display name and version, shown in the header, the welcome
// screen and the shared-day image.
//
// Versioning — 0.<decimal>.<centesimal>:
//   • new features  → bump the DECIMAL (minor):   0.8.0 → 0.9.0
//   • small fixes   → bump the CENTESIMAL (patch): 0.9.0 → 0.9.1
// Add a RELEASE_NOTES entry for every bump so the "Novidades" pop-up can announce it.
export const APP_NAME = 'CrewRoster';
export const APP_VERSION = '0.9.0';
export const APP_STAGE = 'Beta';
export const APP_VERSION_LABEL = `${APP_VERSION} ${APP_STAGE}`;

export interface ReleaseNote {
  version: string;
  date: string; // YYYY-MM-DD
  highlights: string[];
}

// Newest first.
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.9.0',
    date: '2026-06-23',
    highlights: [
      'Notificações CrewLink: vê as alterações (antes → depois) antes de confirmar.',
      'Diário de bordo permanente e editável (mantém-se ao limpar a escala).',
      'Mapa de voos, Estatísticas e Documentos & recência.',
      'Alertas de check-in no .ics e no Google Calendar.',
      'Modo escuro.',
      'Aviso de novidades sempre que a app é atualizada.',
    ],
  },
];

// True when version a is strictly newer than b (numeric, dotted).
export function versionGreater(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

// Release notes newer than the given version (what the user hasn't seen yet).
export function notesSince(version: string | null): ReleaseNote[] {
  if (!version) return [];
  return RELEASE_NOTES.filter((n) => versionGreater(n.version, version));
}
