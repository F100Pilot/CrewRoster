// Lets any page open the Settings dialog (owned by Layout) on a given tab, e.g. the pay page's
// "Definições" button jumping straight to Vencimento.
export type SettingsTab = 'perfil' | 'vencimento' | 'app' | 'dados' | 'ajuda';
export const SETTINGS_TAB_KEY = 'crewroster.settingsTab';
export const OPEN_SETTINGS_EVENT = 'open-settings';

export function openSettings(tab?: SettingsTab): void {
  if (tab) {
    try { localStorage.setItem(SETTINGS_TAB_KEY, tab); } catch { /* opens on the remembered tab */ }
  }
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

// The work month the Vencimento page has open, so Settings → Vencimento shows that payslip's figures
// and "Só este recibo" saves for it (user, 0.9.3.47: the change went to the next payslip instead).
let viewedPayMonth: string | null = null;
export const setViewedPayMonth = (month: string | null): void => { viewedPayMonth = month; };
export const getViewedPayMonth = (): string | null => viewedPayMonth;
