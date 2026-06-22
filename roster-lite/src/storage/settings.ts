// App settings kept on this device only (localStorage). Currently just the AeroDataBox
// API key used to look up live flight info (aircraft registration, gate/terminal). The
// key is the user's own RapidAPI key; it stays in this browser and is sent to the proxy
// over HTTPS per request (the proxy never stores it). It is NOT per-user — it belongs to
// the device/account, shared across crew profiles.

const AERODATABOX_KEY = 'crewroster.aerodataboxKey';

// RapidAPI keys are long alphanumeric tokens; constrain to safe header characters so a
// pasted value can never inject a header when forwarded by the worker.
export const API_KEY_PATTERN = /^[A-Za-z0-9._-]{8,200}$/;

export function getAeroDataBoxKey(): string {
  try {
    return localStorage.getItem(AERODATABOX_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function setAeroDataBoxKey(key: string): void {
  try {
    const v = key.trim();
    if (v) localStorage.setItem(AERODATABOX_KEY, v);
    else localStorage.removeItem(AERODATABOX_KEY);
  } catch {
    // ignore (private mode / storage disabled)
  }
  window.dispatchEvent(new Event('aerodatabox-key-changed'));
}
