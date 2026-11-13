// Duty types in the words crew use, for chips and labels (the parser's types stay in English).
export const DUTY_TYPE_LABEL: Record<string, string> = {
  'Flight Duty': 'Voo', Positioning: 'Posicionamento', 'Standby Airport': 'Assistência no aeroporto',
  'Standby Home': 'Assistência em casa', Reserve: 'Reserva', 'Office Duty': 'Gabinete', Training: 'Formação',
  Simulator: 'Simulador', Medical: 'Médico', Absence: 'Ausência', Vacation: 'Férias', 'Day Off': 'Folga', Other: 'Serviço',
};
export const dutyTypeLabel = (t: string): string => DUTY_TYPE_LABEL[t] ?? t;

// A duty's own word where its code says more than its type: S.EXT. is filed as office duty (it pays
// and counts like one) but it is an external service, not the office (user); IO is the irregularity.
const CODE_LABEL: Record<string, string> = { 'S.EXT.': 'Serviço externo', IO: 'Irregularidade operacional' };
export const dutyLabel = (d: { dutyType: string; dutyCode: string }): string => CODE_LABEL[d.dutyCode] ?? dutyTypeLabel(d.dutyType);
