import { describe, expect, it } from 'vitest';
import { parseCsv } from '../parsing/csv/parseCsv';

describe('parseCsv', () => {
  it('parses NetLine-style CSV with header aliases', () => {
    const csv = [
      'Date,Code,Report,STD,STA,Flight,Dep,Arr,AC',
      '2026-06-18,FLT,05:30,06:30,07:25,TP1920,LIS,OPO,E190',
      '2026-06-19,OFF,,,,,,,',
    ].join('\n');
    const duties = parseCsv(csv);
    expect(duties).toHaveLength(2);
    expect(duties[0]).toMatchObject({
      date: '2026-06-18',
      dutyCode: 'FLT',
      dutyType: 'Flight Duty',
      flightNumber: 'TP1920',
      departureAirport: 'LIS',
      arrivalAirport: 'OPO',
      aircraftType: 'E190',
    });
    expect(duties[1].dutyType).toBe('Day Off');
  });

  it('detects semicolon delimiter', () => {
    const csv = 'Date;DutyCode\n2026-06-18;SBY';
    const duties = parseCsv(csv);
    expect(duties).toHaveLength(1);
    expect(duties[0].dutyType).toBe('Standby Airport');
  });

  it('keeps a quoted field that contains a newline as one cell', () => {
    const csv = [
      'Date,Code,Observations',
      '2026-06-18,FLT,"line one',
      'line two"',
      '2026-06-19,OFF,ok',
    ].join('\n');
    const duties = parseCsv(csv);
    expect(duties).toHaveLength(2);
    expect(duties[0].observations).toBe('line one\nline two');
    expect(duties[1].dutyCode).toBe('OFF');
  });
});
