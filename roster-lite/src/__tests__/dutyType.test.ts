import { describe, expect, it } from 'vitest';
import { inferDutyType } from '../domain/dutyType';

describe('inferDutyType', () => {
  const cases: [string, string][] = [
    ['FLT', 'Flight Duty'],
    ['SBY', 'Standby Airport'],
    ['A1', 'Standby Home'],
    ['A2+', 'Standby Home'],
    ['A3++', 'Standby Home'],
    ['A8', 'Standby Home'],
    ['H7+', 'Standby Home'],
    ['H509', 'Standby Home'],
    ['H23+', 'Standby Home'],
    ['R24', 'Standby Home'],
    ['SBY-H', 'Standby Home'],
    ['OFF', 'Day Off'],
    ['OFF_RQST', 'Day Off'],
    ['PLS_RECOV', 'Day Off'],
    ['PLS_IRREG', 'Day Off'],
    ['VAC', 'Vacation'],
    ['F', 'Vacation'],
    ['PLIC', 'Vacation'],
    ['RLIC', 'Vacation'],
    ['WPNC', 'Training'],
    ['V_EXAM', 'Training'],
    ['FP1_INST', 'Training'],
    ['FP2_INST', 'Training'],
    ['FP1', 'Training'],
    ['FP2', 'Training'],
    ['RGTC1', 'Training'],
    ['RGTC2', 'Training'],
    ['RLIC', 'Vacation'],
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
