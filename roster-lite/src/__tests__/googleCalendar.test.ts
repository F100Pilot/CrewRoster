import { describe, expect, it } from 'vitest';
import { eventId, planSync, toGoogle, type GEvent } from '../services/googleCalendar';
import { rosterEvents } from '../utils/icsExport';
import type { ParsedDuty } from '../domain/types';

const duty = (over: Partial<ParsedDuty>): ParsedDuty => ({
  date: '2026-11-20', dutyCode: 'FLT', dutyType: 'Flight Duty', reportingTime: null, departureTime: null,
  arrivalTime: null, flightNumber: null, departureAirport: null, arrivalAirport: null, aircraftType: null,
  observations: null, ...over,
});

const flight = duty({ flightNumber: 'TP9001', departureAirport: 'LIS', arrivalAirport: 'FNC', departureTime: '15:20', arrivalTime: '17:10', reportingTime: '14:20' });
const off = duty({ date: '2026-11-21', dutyCode: 'OFF', dutyType: 'Day Off' });

describe('Google Calendar sync', () => {
  it('makes event ids Google accepts (a–v, 0–9, at least 5 chars), stable for the same duty', () => {
    const [e] = rosterEvents([flight], 0);
    const id = eventId(e.key);
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(eventId(rosterEvents([flight], 0)[0].key)).toBe(id);
  });

  it('keys equal duties on one day by their order, not the roster index', () => {
    const a = rosterEvents([off, flight], 0).map((e) => e.key);
    const b = rosterEvents([flight, off], 0).map((e) => e.key);
    expect(new Set(a)).toEqual(new Set(b));
  });

  it('maps timed and all-day events, with the check-in alarm as a pop-up reminder', () => {
    const [f, o] = rosterEvents([flight, off], 30).map(toGoogle);
    expect(f.start).toEqual({ dateTime: '2026-11-20T15:20:00Z' });
    expect(f.end).toEqual({ dateTime: '2026-11-20T17:10:00Z' });
    expect(f.reminders?.overrides).toEqual([{ method: 'popup', minutes: 90 }]);
    expect(o.start).toEqual({ date: '2026-11-21' });
    expect(o.end).toEqual({ date: '2026-11-22' });
    expect(o.reminders?.overrides).toEqual([]);
  });

  it('adds new duties, updates changed ones, removes those gone, and leaves the rest', () => {
    const wanted = rosterEvents([flight, off], 0).map(toGoogle);
    const moved = { ...wanted[0], start: { dateTime: '2026-11-20T16:00:00+01:00' } };
    const stale: GEvent = { id: eventId('2026-11-19|TP9999|0'), status: 'confirmed', summary: 'TP9999' };
    const notOurs: GEvent = { id: 'abc123', summary: 'Jantar' };
    const plan = planSync([moved, stale, notOurs], wanted);
    expect(plan.update.map((e) => e.id)).toEqual([wanted[0].id]);
    expect(plan.insert.map((e) => e.id)).toEqual([wanted[1].id]);
    expect(plan.remove).toEqual([stale.id]);
  });

  it('compares instants, so the offset Google echoes back is not a change', () => {
    const wanted = rosterEvents([flight], 0).map(toGoogle);
    const echoed = { ...wanted[0], start: { dateTime: '2026-11-20T15:20:00+00:00' }, end: { dateTime: '2026-11-20T17:10:00+00:00' } };
    expect(planSync([echoed], wanted)).toMatchObject({ insert: [], update: [], remove: [], unchanged: 1 });
  });

  it('brings back a cancelled event instead of skipping it', () => {
    const wanted = rosterEvents([flight], 0).map(toGoogle);
    const plan = planSync([{ ...wanted[0], status: 'cancelled' }], wanted);
    expect(plan.update).toHaveLength(1);
  });
});
