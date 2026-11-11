import { beforeEach, describe, expect, it } from 'vitest';
import { getPaySettings } from '../storage/settings';

describe('getPaySettings', () => {
  beforeEach(() => localStorage.clear());

  it('national SS exempt limit defaults to 51,90 €', () => {
    expect(getPaySettings('u1').exemptNationalSs).toBe(51.9);
  });

  it('moves the old saved default (54,49 €) to 51,90 €, keeps any other typed value', () => {
    localStorage.setItem('crewroster.pay.u1', JSON.stringify({ exemptNationalSs: 54.49 }));
    localStorage.setItem('crewroster.pay.u2', JSON.stringify({ exemptNationalSs: 50 }));
    expect(getPaySettings('u1').exemptNationalSs).toBe(51.9);
    expect(getPaySettings('u2').exemptNationalSs).toBe(50);
  });
});
