import { describe, expect, it } from 'vitest';
import { describeAlert, documentAlerts } from '../domain/documentAlerts';
import type { CrewDocument } from '../domain/types';

const doc = (name: string, expiry: string): CrewDocument => ({ id: name, userId: 'u', name, expiry });

describe('documentAlerts', () => {
  const docs = [
    doc('Passaporte', '2027-06-01'), // far off — no alert
    doc('OPC', '2026-12-20'), // 52 days
    doc('Medical', '2026-11-21'), // 23 days
    doc('Licença', '2026-10-26'), // expired 3 days ago
  ];

  it('lists expired and soon-to-expire documents, soonest first', () => {
    expect(documentAlerts(docs, '2026-10-29').map((a) => [a.doc.name, a.days, a.level])).toEqual([
      ['Licença', -3, 'error'],
      ['Medical', 23, 'error'],
      ['OPC', 52, 'warning'],
    ]);
  });

  it('stops at 60 days', () => {
    expect(documentAlerts([doc('X', '2026-12-28')], '2026-10-29')).toHaveLength(1); // 60
    expect(documentAlerts([doc('X', '2026-12-29')], '2026-10-29')).toHaveLength(0); // 61
  });

  it('words the line', () => {
    const at = (expiry: string) => describeAlert(documentAlerts([doc('Medical', expiry)], '2026-10-29')[0]);
    expect(at('2026-11-21')).toBe('Medical expira em 23 dias');
    expect(at('2026-10-30')).toBe('Medical expira amanhã');
    expect(at('2026-10-29')).toBe('Medical expira hoje');
    expect(at('2026-10-28')).toBe('Medical expirou ontem');
    expect(at('2026-10-26')).toBe('Medical expirou há 3 dias');
  });
});
