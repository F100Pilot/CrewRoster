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
