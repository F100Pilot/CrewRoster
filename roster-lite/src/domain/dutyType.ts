// Ported from backend/src/services/csvParser.ts. Maps a NetLine/CrewLink duty code
// to a human-readable duty type. Extend the lists as real PGA codes are discovered.
export function inferDutyType(dutyCode: string): string {
  const code = (dutyCode || '').toUpperCase();
  if (['FLT', 'FDP', 'FP', 'FD'].includes(code)) return 'Flight Duty';
  if (['SBY', 'SBY-A', 'STA'].includes(code)) return 'Standby Airport';
  if (['SBY-H', 'STH'].includes(code)) return 'Standby Home';
  // Assistances (standby with a time window), used by both pilots and cabin crew:
  // A1/A2+/A3++…, H7+/H509/R24.
  if (/^A\d\+{0,2}$/.test(code)) return 'Standby Home';
  if (/^H(\d+\+|\d{3})$/.test(code) || code === 'R24') return 'Standby Home';
  if (['OFF', 'DO', 'DOF'].includes(code)) return 'Day Off';
  if (/_RQST$/.test(code)) return 'Day Off'; // requested days off (OFF_RQST, …)
  if (/^PLS_/.test(code)) return 'Day Off'; // Período Livre de Serviço (PLS_RECOV, …)
  if (['VAC', 'VACATION', 'AN', 'F', 'PLIC', 'SLIC', 'RLIC'].includes(code)) return 'Vacation';
  if (['SIM', 'SIMU', 'TRN'].includes(code)) return 'Simulator';
  if (['WPNC', 'VPNC', 'W_EXAM', 'V_EXAM'].includes(code)) return 'Training'; // line checks / exams
  if (/_INST$/.test(code)) return 'Training'; // instruction, as instructor (FP1_INST, …)
  if (/^FP\d$/.test(code)) return 'Training'; // instruction, as trainee (FP1, FP2)
  if (/^RGTC\d*$/.test(code)) return 'Training'; // recurrent ground instruction (trainee)
  if (['OFD', 'OFFICE', 'GRD'].includes(code)) return 'Office Duty';
  if (['TRG', 'TRNG', 'TR'].includes(code)) return 'Training';
  if (['MED', 'MC', 'MEDICAL'].includes(code)) return 'Medical';
  if (/^FAL(\(.*\))?$/.test(code)) return 'Absence'; // Falta (ausência): FAL, FAL(PD), …
  if (['RSV', 'R'].includes(code)) return 'Reserve';
  if (['POS', 'DH'].includes(code)) return 'Positioning';
  return 'Other';
}
