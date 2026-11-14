import { describe, expect, it } from 'vitest';
import { dutyLabel } from '../domain/dutyLabels';

describe('dutyLabel', () => {
  it('names S.EXT. as an external service, not the office (user), and IO as the irregularity', () => {
    expect(dutyLabel({ dutyType: 'Office Duty', dutyCode: 'S.EXT.' })).toBe('Serviço externo');
    expect(dutyLabel({ dutyType: 'Office Duty', dutyCode: 'GAB1' })).toBe('Gabinete');
    expect(dutyLabel({ dutyType: 'Other', dutyCode: 'IO' })).toBe('Irregularidade operacional');
    expect(dutyLabel({ dutyType: 'Flight Duty', dutyCode: 'FLT' })).toBe('Voo');
  });
});
