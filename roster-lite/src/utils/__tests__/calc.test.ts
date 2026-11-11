import { describe, expect, it } from 'vitest';
import { evalExpression, isExpression } from '../calc';

describe('evalExpression', () => {
  it('adds payslip values written the Portuguese way', () => {
    expect(evalExpression('69 + 236,38')).toBe(305.38);
    expect(evalExpression('7.413,47 + 2.100,00')).toBe(9513.47);
    expect(evalExpression('236.38+69')).toBe(305.38);
  });
  it('knows × ÷ − and brackets, to the cent', () => {
    expect(evalExpression('6 × 10,46')).toBe(62.76);
    expect(evalExpression('(12144,95 − 2100) ÷ 3')).toBe(3348.32);
    expect(evalExpression('-5+10')).toBe(5);
  });
  it('a plain number is itself; nonsense and ÷ 0 give null', () => {
    expect(evalExpression('130')).toBe(130);
    expect(evalExpression('12+')).toBeNull();
    expect(evalExpression('abc')).toBeNull();
    expect(evalExpression('5/0')).toBeNull();
  });
  it('tells a sum from a plain number', () => {
    expect(isExpression('69+236,38')).toBe(true);
    expect(isExpression('305,38')).toBe(false);
  });
});
