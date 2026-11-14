import { beforeEach, describe, expect, it } from 'vitest';
import { getPaySettings } from '../storage/settings';

describe('getPaySettings', () => {
  beforeEach(() => localStorage.clear());

  it('national SS exempt limit defaults to 54,49 € (a real October payslip, to the cent)', () => {
    expect(getPaySettings('u1').exemptNationalSs).toBe(54.49);
  });

  it('moves the 51,90 € saved by 0.8.35.1 back to 54,49 €, keeps any other typed value', () => {
    localStorage.setItem('crewroster.pay.u1', JSON.stringify({ exemptNationalSs: 51.9 }));
    localStorage.setItem('crewroster.pay.u2', JSON.stringify({ exemptNationalSs: 50 }));
    expect(getPaySettings('u1').exemptNationalSs).toBe(54.49);
    expect(getPaySettings('u2').exemptNationalSs).toBe(50);
  });
});

describe('pay values by version (a raise never changes the months before)', () => {
  it('keeps each month on the figures saved for it; card notes stay global', async () => {
    const { getPaySettingsFor, savePayVersion, setPaySettings, getPaySettings, patchPayGlobal, getPayHistory } = await import('../storage/settings');
    const { DEFAULT_PAY_SETTINGS } = await import('../domain/payEstimate');
    const uid = 'ver-' + Math.random().toString(36).slice(2);
    // Before versions existed: one set, for every month.
    setPaySettings(uid, { ...DEFAULT_PAY_SETTINGS, enabled: true, vb: 7000 });
    expect(getPayHistory(uid)).toHaveLength(1);
    expect(getPaySettingsFor(uid, '2026-09').vb).toBe(7000);

    // A raise saved from the November work (December payslip): October and before keep 7000.
    savePayVersion(uid, '2026-11', { ...getPaySettings(uid), vb: 7413.47 });
    expect(getPaySettingsFor(uid, '2026-10').vb).toBe(7000);
    expect(getPaySettingsFor(uid, '2026-11').vb).toBe(7413.47);
    expect(getPaySettingsFor(uid, '2027-03').vb).toBe(7413.47);
    expect(getPaySettings(uid).vb).toBe(7413.47); // what Settings shows

    // The switch and the card's notes are one value for all months, never versioned.
    patchPayGlobal(uid, { lineChecks: { '2026-10': 2 } });
    expect(getPaySettingsFor(uid, '2026-10').lineChecks).toEqual({ '2026-10': 2 });
    expect(getPaySettingsFor(uid, '2026-12').enabled).toBe(true);
    expect(getPaySettingsFor(uid, '2026-10').enabled).toBe(true);

    // Saving from an earlier month takes over the later versions too (a later one with zeros kept
    // showing over what had just been saved — a user's report).
    savePayVersion(uid, '2026-12', { ...getPaySettings(uid), vb: 0 });
    savePayVersion(uid, '2026-11', { ...getPaySettings(uid), vb: 7500 });
    expect(getPaySettingsFor(uid, '2027-01').vb).toBe(7500);
    expect(getPaySettings(uid).vb).toBe(7500);
    expect(getPaySettingsFor(uid, '2026-10').vb).toBe(7000);

    // "Todos os meses" fixes a typo everywhere: one version, for every month.
    savePayVersion(uid, '', { ...getPaySettings(uid), vb: 7001 });
    expect(getPaySettingsFor(uid, '2026-10').vb).toBe(7001);
    expect(getPaySettingsFor(uid, '2027-01').vb).toBe(7001);
    expect(getPaySettings(uid).vb).toBe(7001);
    expect(getPayHistory(uid)).toHaveLength(1);
  });

  it('figures typed in the older installed app (current set only) win over the latest version', async () => {
    const { getPaySettingsFor, savePayVersion, setPaySettings, getPaySettings } = await import('../storage/settings');
    const { DEFAULT_PAY_SETTINGS } = await import('../domain/payEstimate');
    const uid = 'old-' + Math.random().toString(36).slice(2);
    setPaySettings(uid, { ...DEFAULT_PAY_SETTINGS, vb: 7000 });
    savePayVersion(uid, '2026-11', { ...getPaySettings(uid), vb: 0 });
    setPaySettings(uid, { ...getPaySettings(uid), vb: 7413.47 }); // the old app, writing as you type
    expect(getPaySettingsFor(uid, '2026-12').vb).toBe(7413.47);
    expect(getPaySettingsFor(uid, '2026-10').vb).toBe(7000);
  });
});
