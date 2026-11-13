import { describe, expect, it } from 'vitest';
import { monthText } from '../utils/shareMonth';
import type { ParsedDuty } from '../domain/types';

const duty = (over: Partial<ParsedDuty>): ParsedDuty => ({
  date: '2026-11-20', dutyCode: 'FLT', dutyType: 'Flight Duty', reportingTime: null, departureTime: null,
  arrivalTime: null, flightNumber: null, departureAirport: null, arrivalAirport: null, aircraftType: null,
  observations: null, ...over,
});

describe('monthText', () => {
  const duties = [
    duty({ flightNumber: 'TP9002', departureAirport: 'FNC', arrivalAirport: 'LIS', departureTime: '18:10', arrivalTime: '19:55' }),
    duty({ flightNumber: 'TP9001', departureAirport: 'LIS', arrivalAirport: 'FNC', departureTime: '15:20', arrivalTime: '17:10' }),
    duty({ date: '2026-11-21', flightNumber: 'TP9003', departureAirport: 'LIS', arrivalAirport: 'NCE', departureTime: '07:00', arrivalTime: '09:30' }),
    duty({ date: '2026-11-22', dutyCode: 'OFF', dutyType: 'Day Off' }),
    duty({ date: '2026-12-01', dutyCode: 'OFF', dutyType: 'Day Off' }),
  ];
  const text = monthText('2026-11', duties, 'LIS');

  it('lists each day once, the route in order, in local times', () => {
    expect(text).toContain('Escala de novembro 2026');
    expect(text).toContain('Sex, 20 nov — Voo LIS → FNC → LIS · 15:20–19:55');
    expect(text).toContain('Sáb, 21 nov — Voo LIS → NCE · 07:00–10:30 (fica em NCE)');
    expect(text).toContain('Dom, 22 nov — Folga');
  });

  it('keeps to the month and carries no flight crew or pay', () => {
    expect(text).not.toContain('dez');
    expect(text).not.toMatch(/€|TP900/);
  });
});
