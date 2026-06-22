import { describe, expect, it } from 'vitest';
import { inferDutyType } from '../domain/dutyType';

describe('inferDutyType', () => {
  const cases: [string, string][] = [
    ['FLT', 'Flight Duty'],
    ['SBY', 'Standby Airport'],
    ['A1', 'Standby Home'],
    ['A2', 'Standby Home'],
    ['A3', 'Standby Home'],
    ['SBY-H', 'Standby Home'],
    ['OFF', 'Day Off'],
    ['OFF_RQST', 'Day Off'],
    ['PLD_RQST', 'Day Off'],
    ['VAC', 'Vacation'],
    ['SIM', 'Simulator'],
    ['OFD', 'Office Duty'],
    ['TRG', 'Training'],
    ['MED', 'Medical'],
    ['RSV', 'Reserve'],
    ['POS', 'Positioning'],
    ['ZZZ', 'Other'],
  ];
  it.each(cases)('maps %s -> %s', (code, expected) => {
    expect(inferDutyType(code)).toBe(expected);
  });
});
