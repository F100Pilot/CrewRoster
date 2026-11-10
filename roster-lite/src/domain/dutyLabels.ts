// Duty types in the words crew use, for chips and labels (the parser's types stay in English).
export const DUTY_TYPE_LABEL: Record<string, string> = {
  'Flight Duty': 'Voo', Positioning: 'Posicionamento', 'Standby Airport': 'Assistência no aeroporto',
  'Standby Home': 'Assistência em casa', Reserve: 'Reserva', 'Office Duty': 'Gabinete', Training: 'Formação',
  Simulator: 'Simulador', Medical: 'Médico', Absence: 'Ausência', Vacation: 'Férias', 'Day Off': 'Folga', Other: 'Serviço',
};
export const dutyTypeLabel = (t: string): string => DUTY_TYPE_LABEL[t] ?? t;
