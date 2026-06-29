import { describe, it, expect } from 'vitest';
import { paginateEasa, hm, type EasaSector } from '../domain/easaLogbook';

const sec = (over: Partial<EasaSector> = {}): EasaSector => ({
  date: '2026-06-01', flightNumber: 'TP1', from: 'LIS', off: '08:00', to: 'OPO', on: '08:55',
  type: 'E90', reg: 'CS-TPA', blockMin: 55, nightMin: 0, ifrMin: 55, dayLdg: 1, nightLdg: 0,
  ...over,
});

describe('hm', () => {
  it('formats minutes as H:MM, blank for zero', () => {
    expect(hm(85)).toBe('1:25');
    expect(hm(60)).toBe('1:00');
    expect(hm(0)).toBe('');
    expect(hm(-5)).toBe('');
  });
});

describe('paginateEasa', () => {
  const rows = Array.from({ length: 5 }, () => sec({ blockMin: 60, ifrMin: 60, nightMin: 30 }));

  it('puts all block time in the PIC column when function is PIC', () => {
    const [p] = paginateEasa(rows, 'PIC', 16);
    expect(p.page.block).toBe(300);
    expect(p.page.pic).toBe(300);
    expect(p.page.copilot).toBe(0);
    expect(p.page.night).toBe(150);
    expect(p.page.ifr).toBe(300);
    expect(p.page.dayLdg).toBe(5);
  });

  it('puts all block time in the co-pilot column when function is COPILOT', () => {
    const [p] = paginateEasa(rows, 'COPILOT', 16);
    expect(p.page.copilot).toBe(300);
    expect(p.page.pic).toBe(0);
  });

  it('paginates and carries forward cumulative totals', () => {
    const many = Array.from({ length: 20 }, () => sec({ blockMin: 60 }));
    const pages = paginateEasa(many, 'PIC', 16);
    expect(pages).toHaveLength(2);
    expect(pages[0].rows).toHaveLength(16);
    expect(pages[1].rows).toHaveLength(4);
    expect(pages[0].broughtForward.block).toBe(0);
    expect(pages[0].total.block).toBe(16 * 60);
    expect(pages[1].broughtForward.block).toBe(16 * 60); // page 1's total carries in
    expect(pages[1].total.block).toBe(20 * 60); // grand total
    expect(pages[1].total.pic).toBe(20 * 60);
  });
});
