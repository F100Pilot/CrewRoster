// Single source for the app's display name and version, shown in the header, the welcome
// screen and the shared-day image.
//
// Versioning — 0.9.<centesimal>.<milésima>: every update bumps the 4th place (user rule, Nov 2026), and adds a
// RELEASE_NOTES entry in releaseNotes.ts so the "Novidades" pop-up can announce it.
export const APP_NAME = 'CrewRoster';
export const APP_VERSION = '0.9.3.101';
const APP_STAGE = 'Beta';
export const APP_VERSION_LABEL = `${APP_VERSION} ${APP_STAGE}`;

// The release notes live in releaseNotes.ts, loaded only when the "Novidades" pop-up has something to show — 74 KB
// that used to sit in the first paint (review, Nov 2026). Add a note there for every bump.

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
