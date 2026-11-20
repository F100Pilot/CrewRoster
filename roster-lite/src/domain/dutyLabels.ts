// Duty types in the words crew use, for chips and labels (the parser's types stay in English).
export const DUTY_TYPE_LABEL: Record<string, string> = {
  'Flight Duty': 'Voo', Positioning: 'Posicionamento', 'Standby Airport': 'Assistência no aeroporto',
  'Standby Home': 'Assistência em casa', Reserve: 'Reserva', 'Office Duty': 'Gabinete', Training: 'Formação',
  Simulator: 'Simulador', Medical: 'Médico', Absence: 'Ausência', Vacation: 'Férias', 'Day Off': 'Folga', Other: 'Serviço',
};
const dutyTypeLabel = (t: string): string => DUTY_TYPE_LABEL[t] ?? t;

// A duty's own word where its code says more than its type: S.EXT. is filed as office duty (it pays
// and counts like one) but it is an external service, not the office (user); IO is the irregularity.
const CODE_LABEL: Record<string, string> = { 'S.EXT.': 'Serviço externo', IO: 'Irregularidade operacional' };
export const dutyLabel = (d: { dutyType: string; dutyCode: string }): string =>
  CODE_LABEL[d.dutyCode] ?? (isGroundTransport(d) ? (/TAXI/.test(d.dutyCode) ? 'Táxi' : 'Transporte terrestre')
    : isPls(d) ? 'Livre de serviço' : dutyTypeLabel(d.dutyType));

// A PLS_… day (período livre de serviço) is NOT a folga — RUPT cl. 6.ª n.º 13, "dia livre de serviço": neither folga, rest
// nor holidays (a tester, Nov 2026; user: "o PLS ainda é identificado como folga no cartão?"). Filed as Day Off for the
// maths, shown as what it is.
export const isPls = (d: { dutyCode: string }): boolean => /^PLS_/i.test(d.dutyCode);

// A ground transport (GT-TAXI: a taxi to Alverca for a ferry, a tester's roster, Nov 2026) — duty in full (RRRGS cl. 12.2 e
// iv: "deslocação através de meios de superfície – 100%"), never flight time.
export const isGroundTransport = (d: { dutyCode: string }): boolean => /^GT(-[A-Z]+)?$/.test(d.dutyCode);
