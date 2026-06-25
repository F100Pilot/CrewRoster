import { describe, it, expect } from 'vitest';
import { flicLegsFor } from '../domain/flic';

describe('flicLegsFor', () => {
  it('gives both boards for a hub-to-hub leg (LIS→OPO)', () => {
    const legs = flicLegsFor('LIS', 'OPO');
    expect(legs.map((l) => l.boardId)).toEqual(['PGA-LIS_DEP', 'PGA-OPO_ARR']);
    expect(legs.map((l) => l.boardUrl)).toEqual([
      'https://flic.tap.pt/FLIC_UI/FLIC.aspx?Id=PGA-LIS_DEP',
      'https://flic.tap.pt/FLIC_UI/FLIC.aspx?Id=PGA-OPO_ARR',
    ]);
  });
  it('gives only the departure board when leaving a hub (LIS→AGP)', () => {
    const legs = flicLegsFor('LIS', 'AGP');
    expect(legs.map((l) => l.boardId)).toEqual(['PGA-LIS_DEP']);
    expect(legs[0].kind).toBe('dep');
    expect(legs[0].hub).toBe('LIS');
  });
  it('gives only the arrival board when landing at a hub (AGP→OPO)', () => {
    const legs = flicLegsFor('AGP', 'OPO');
    expect(legs.map((l) => l.boardId)).toEqual(['PGA-OPO_ARR']);
    expect(legs[0].kind).toBe('arr');
  });
  it('gives nothing when neither end is a hub', () => {
    expect(flicLegsFor('AGP', 'MAD')).toEqual([]);
    expect(flicLegsFor(null, null)).toEqual([]);
  });
});
