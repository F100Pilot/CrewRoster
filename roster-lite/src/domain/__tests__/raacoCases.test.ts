import { describe, expect, it } from 'vitest';
import { raacoDays } from '../raaco';
import type { ParsedDuty } from '../types';

// The RAACO casebook: every real case a crew member reported (or a statement line we checked)
// becomes an entry here, so a later change to `raaco.ts` can never silently break a case that was
// already right. Human-readable record, open cases and the procedure: docs/ABONOS-CASOS.md — keep
// the two in step (same id).
//
// Privacy: airports, dates and times only (the shape of the roster); flight numbers are synthetic
// (TP9xxx) and nobody is named. The expected columns are what the company paid / the crew member
// confirmed: [pequeno-almoço, almoço, jantar, ceia + pernoita].

const base = (date: string, x: Partial<ParsedDuty>): ParsedDuty => ({
  date, dutyCode: 'FLT', dutyType: 'Flight Duty', flightNumber: null, departureAirport: null, arrivalAirport: null,
  departureTime: null, arrivalTime: null, reportingTime: null, aircraftType: 'E90', observations: null, ...x,
} as ParsedDuty);
const leg = (date: string, fn: string, a: string, z: string, off: string, on: string, rep: string | null = null) =>
  base(date, { flightNumber: fn, departureAirport: a, arrivalAirport: z, departureTime: off, arrivalTime: on, reportingTime: rep });
const dayX = (date: string) => base(date, { dutyType: 'Day Off', dutyCode: 'X' });

interface Case {
  id: string;
  since: string; // the version that fixed it
  reported: string; // what the crew member saw / the statement says (pt-PT, as reported)
  rule: string; // the rule we took from it
  base?: string;
  duties: ParsedDuty[];
  days?: Record<string, [number, number, number, number]>;
  nights?: string[]; // `${date} ${where} ${value}`, in order
}

const CASES: Case[] = [
  {
    id: 'C01-RAI-noite-depois-meia-noite',
    since: '0.8.34.1',
    reported: 'Praia (RAI): pernoita é 14 €; chegada depois da meia-noite local e a pernoita não aparecia.',
    rule: 'Pernoita = qualquer parte de 00:00–05:00 local passada na estadia, datada da véspera.',
    duties: [
      leg('2026-11-20', 'TP9031', 'LIS', 'RAI', '21:00', '01:15', '20:00'),
      leg('2026-11-21', 'TP9032', 'RAI', 'LIS', '11:00', '15:00', '10:00'),
    ],
    nights: ['2026-11-20 RAI 14'],
  },
  {
    id: 'C02-RAI-dia-X',
    since: '0.8.34.2',
    reported: 'Na primeira noite de um dia X fora de casa não tem a pernoita.',
    rule: 'Com dia X fora, as duas noites contam — também com regresso apresentado à meia-noite (limite inclusivo).',
    duties: [
      leg('2026-11-20', 'TP9041', 'LIS', 'RAI', '21:00', '01:15', '20:00'),
      dayX('2026-11-21'),
      leg('2026-11-22', 'TP9042', 'RAI', 'LIS', '02:00', '06:00', '01:00'),
    ],
    nights: ['2026-11-20 RAI 14', '2026-11-21 RAI 14'],
  },
  {
    id: 'C03-FNC-dia-X',
    since: '0.8.34.2',
    reported: '(controlo do C02 com chegada ao fim da tarde)',
    rule: 'Dia X fora: duas pernoitas, também sem chegada tardia.',
    duties: [
      leg('2026-11-20', 'TP9043', 'LIS', 'FNC', '19:00', '20:45', '18:00'),
      dayX('2026-11-21'),
      leg('2026-11-22', 'TP9044', 'FNC', 'LIS', '08:00', '09:30', '07:00'),
    ],
    nights: ['2026-11-20 FNC 10', '2026-11-21 FNC 10'],
  },
  {
    id: 'C04-DUB-26-09',
    since: '0.8.34.2',
    reported: 'DUB 26/09: faltava a pernoita da primeira noite (aterragem 23:43 local).',
    rule: 'Pernoita da primeira noite; ceia paga ao valor da Tabela 34 (Irlanda 35 €).',
    duties: [
      leg('2026-09-26', 'TP9051', 'LIS', 'TLS', '13:57', '15:42', '12:57'),
      leg('2026-09-26', 'TP9052', 'TLS', 'LIS', '16:33', '18:28'),
      leg('2026-09-26', 'TP9053', 'LIS', 'DUB', '20:17', '22:43'),
      dayX('2026-09-27'),
      leg('2026-09-28', 'TP9054', 'DUB', 'LIS', '04:33', '07:26', '03:33'),
    ],
    days: { '2026-09-26': [0, 0, 0, 45], '2026-09-27': [0, 35, 35, 45] },
  },
  {
    id: 'C05-VLC-14-10',
    since: '0.8.34.2',
    reported: 'VLC 14/10: faltava a pernoita da primeira noite.',
    rule: 'Pernoita da primeira noite; jantar e ceia ao valor de Espanha (33 €).',
    duties: [
      leg('2026-10-14', 'TP9061', 'LIS', 'OPO', '15:47', '16:32', '14:47'),
      leg('2026-10-14', 'TP9062', 'OPO', 'LIS', '17:29', '18:22'),
      leg('2026-10-14', 'TP9063', 'LIS', 'VLC', '20:25', '21:42'),
      dayX('2026-10-15'),
      leg('2026-10-16', 'TP9064', 'VLC', 'LIS', '03:54', '05:25', '02:54'),
    ],
    days: { '2026-10-14': [0, 0, 33, 43], '2026-10-15': [0, 33, 33, 43] },
  },
  {
    id: 'C06-BCN-12-07-ceia',
    since: '0.8.34.3',
    reported: 'BCN 12/07: só aparecia a pernoita (10 €), faltava a ceia.',
    rule: 'A ceia nunca é embarcada: paga sempre que devida, ao valor local se o serviço acaba fora da base.',
    duties: [
      base('2026-07-12', { dutyType: 'Standby Home', dutyCode: 'H9+', departureAirport: 'LIS', departureTime: '08:55', arrivalTime: '14:35' }),
      leg('2026-07-12', 'TP9071', 'LIS', 'BCN', '15:49', '17:37'),
      leg('2026-07-12', 'TP9072', 'BCN', 'LIS', '18:35', '20:34'),
      leg('2026-07-12', 'TP9073', 'LIS', 'BCN', '21:59', '23:45'),
      dayX('2026-07-13'),
      leg('2026-07-14', 'TP9074', 'BCN', 'LIS', '04:02', '06:02', '03:02'),
    ],
    days: { '2026-07-12': [0, 0, 0, 43], '2026-07-13': [0, 33, 33, 43] },
  },
  {
    id: 'C07-IO-prevenir',
    since: '0.9.2',
    reported: 'IO (irregularidade operacional) por causa do prevenir — chamado na apresentação para o teste de álcool, não fez o voo: os abonos desse dia são pagos e o duty conta. A app deixava o dia vazio.',
    rule: 'IO que começa à hora da apresentação do PSV planeado = prevenir: o período do IO é um PSV na base e paga as refeições cujas janelas apanha, pela Tabela 33 (almoço 18 €).',
    duties: [
      base('2026-11-01', {
        dutyType: 'Other', dutyCode: 'IO', departureAirport: 'LIS', reportingTime: '10:15', departureTime: '10:15', arrivalTime: '16:40',
        planned: { reportingTime: '10:15', departureTime: '11:15', arrivalTime: '15:30' },
      }),
    ],
    days: { '2026-11-01': [0, 18, 0, 0] },
  },
  {
    id: 'C07b-IO-prevenir-marcado',
    since: '0.9.2',
    reported: '(o mesmo, sem escala antiga guardada para comparar: o tripulante marca o dia como prevenir)',
    rule: 'Marcado à mão como prevenir conta igual ao detetado.',
    duties: [
      base('2026-11-01', { dutyType: 'Other', dutyCode: 'IO', departureAirport: 'LIS', reportingTime: '10:15', departureTime: '10:15', arrivalTime: '16:40', prevenir: true }),
    ],
    days: { '2026-11-01': [0, 18, 0, 0] },
  },
  {
    id: 'C08-IO-normal-MAN',
    since: '0.9.2.2',
    reported: 'IO normal (não é o prevenir): LIS→MAN, MAN→MAN e IO em MAN 11:00–15:08 UTC; fiquei em Manchester (H3) e voltei no dia seguinte em DH. "Teria de assumir as ajudas de lá."',
    rule: 'O IO faz parte do PSV desse dia: as refeições seguem as regras normais com o período do IO incluído, e a estadia onde o IO acaba paga a Tabela 34 local (Reino Unido 35 € + pernoita 10 €). Só o prevenir é especial.',
    duties: [
      leg('2026-04-08', 'TP9310', 'LIS', 'MAN', '06:12', '08:52', '05:12'),
      leg('2026-04-08', 'TP9311', 'MAN', 'MAN', '09:58', '10:47'),
      base('2026-04-08', { dutyType: 'Other', dutyCode: 'IO', departureAirport: 'MAN', reportingTime: '11:00', departureTime: '11:00', arrivalTime: '15:08' }),
      base('2026-04-09', { dutyType: 'Positioning', flightNumber: 'TP9313', departureAirport: 'MAN', arrivalAirport: 'LIS', departureTime: '17:07', arrivalTime: '19:40', reportingTime: '16:07' }),
    ],
    days: { '2026-04-08': [0, 35, 35, 45], '2026-04-09': [0, 35, 18, 0] },
  },
];

describe('RAACO casebook (real cases — none may regress)', () => {
  it.each(CASES.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const days = raacoDays(c.duties, c.base ?? 'LIS');
    for (const [date, cols] of Object.entries(c.days ?? {})) {
      const d = days.get(date);
      expect(d ? [d.breakfast, d.lunch, d.dinner, d.supperNight] : [0, 0, 0, 0], `${c.id} ${date} — ${c.rule}`).toEqual(cols);
    }
    if (c.nights) {
      expect([...days.values()].flatMap((d) => d.nights.map((n) => `${n.date} ${n.where} ${n.value}`)), `${c.id} — ${c.rule}`)
        .toEqual(c.nights);
    }
  });

  it('every case says what was reported and which rule it fixed', () => {
    const ids = CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CASES) expect(c.reported && c.rule && c.since && (c.days || c.nights)).toBeTruthy();
  });
});
