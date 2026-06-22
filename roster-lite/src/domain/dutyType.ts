// Ported from backend/src/services/csvParser.ts. Maps a NetLine/CrewLink duty code
// to a human-readable duty type. Extend the lists as real PGA codes are discovered.
export function inferDutyType(dutyCode: string): string {
  const code = (dutyCode || '').toUpperCase();
  if (['FLT', 'FDP', 'FP', 'FD'].includes(code)) return 'Flight Duty';
  if (['SBY', 'SBY-A', 'STA'].includes(code)) return 'Standby Airport';
  if (/^A\d{1,2}$/.test(code)) return 'Standby Home'; // PGA home standby slots A1, A2, A3…
  if (['SBY-H', 'STH'].includes(code)) return 'Standby Home';
  if (['OFF', 'DO', 'DOF'].includes(code)) return 'Day Off';
  if (/^(OFF|PLS)_RQST$/.test(code)) return 'Day Off'; // requested days off
  if (['VAC', 'VACATION', 'AN'].includes(code)) return 'Vacation';
  if (['SIM', 'SIMU', 'TRN'].includes(code)) return 'Simulator';
  if (['OFD', 'OFFICE', 'GRD'].includes(code)) return 'Office Duty';
  if (['TRG', 'TRNG', 'TR'].includes(code)) return 'Training';
  if (['MED', 'MC', 'MEDICAL'].includes(code)) return 'Medical';
  if (['RSV', 'R'].includes(code)) return 'Reserve';
  if (['POS', 'DH'].includes(code)) return 'Positioning';
  return 'Other';
}
