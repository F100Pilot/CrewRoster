import { describe, it, expect } from 'vitest';
import { flicStandLinks } from '../domain/flic';

describe('flicStandLinks', () => {
  it('gives both boards for a hub-to-hub leg (LIS→OPO)', () => {
    const links = flicStandLinks('LIS', 'OPO');
    expect(links.map((l) => l.url)).toEqual([
      'https://flic.tap.pt/FLIC_UI/FLIC.aspx?Id=PGA-LIS_DEP',
      'https://flic.tap.pt/FLIC_UI/FLIC.aspx?Id=PGA-OPO_ARR',
    ]);
  });
  it('gives only the departure board when leaving a hub (LIS→AGP)', () => {
    expect(flicStandLinks('LIS', 'AGP').map((l) => l.label)).toEqual(['Partida LIS']);
  });
  it('gives only the arrival board when landing at a hub (AGP→OPO)', () => {
    expect(flicStandLinks('AGP', 'OPO').map((l) => l.label)).toEqual(['Chegada OPO']);
  });
  it('gives nothing when neither end is a hub', () => {
    expect(flicStandLinks('AGP', 'MAD')).toEqual([]);
    expect(flicStandLinks(null, null)).toEqual([]);
  });
});
