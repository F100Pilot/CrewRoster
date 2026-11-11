import { describe, expect, it } from 'vitest';
import { ebtBriefing, ebtBriefingText } from '../simSession';

describe('ebtBriefing', () => {
  it('day 1: 30-min briefing, 1-hour debriefing; day 2 the other way round', () => {
    expect(ebtBriefing({ dutyType: 'Simulator', dutyCode: 'LIS-EBT-1' })).toEqual({ day: 1, briefMin: 30, debriefMin: 60 });
    expect(ebtBriefing({ dutyType: 'Simulator', dutyCode: 'LIS-EBT-2' })).toEqual({ day: 2, briefMin: 60, debriefMin: 30 });
    expect(ebtBriefingText(ebtBriefing({ dutyType: 'Simulator', dutyCode: 'LIS-EBT-1' })!)).toBe('briefing 30 min · debriefing 1 h');
  });

  it('nothing for other simulator sessions or other duties', () => {
    expect(ebtBriefing({ dutyType: 'Simulator', dutyCode: 'LIS-OTHER' })).toBeNull();
    expect(ebtBriefing({ dutyType: 'Simulator', dutyCode: 'E90-FRA-1' })).toBeNull();
    expect(ebtBriefing({ dutyType: 'Training', dutyCode: 'LIS-EBT-1' })).toBeNull();
  });
});
