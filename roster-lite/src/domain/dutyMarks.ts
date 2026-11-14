import type { ParsedDuty } from './types';

// Roster marks the parser attaches to a duty's observations, in words: the check a simulator
// session is for (OPC / LPC), and flights or sessions given as the instructor. Shared by the day
// view and the roster list so both name them the same way.
export const MARK_LABEL: Record<string, string> = {
  LIFUS_INS: 'Line training · instrutor',
  CLTC: 'Line training · instrutor (CLTC)',
  CTRI: 'Line training · instrutor (CTRI)',
  FO_SAFETY: 'Copiloto extra (safety pilot)',
  FAM_INS: 'Familiarização · instrutor',
  W_INS: 'Line check · instrutor',
  OPC_INS: 'OPC · instrutor',
  LPC_INS: 'LPC · instrutor',
  OPC: 'OPC',
  LPC: 'LPC',
};

// Short forms for the roster list, where the chip sits beside the date.
export const MARK_SHORT: Record<string, string> = {
  LIFUS_INS: 'LIFUS · instr.',
  CLTC: 'LIFUS · instr.',
  CTRI: 'LIFUS · instr.',
  FO_SAFETY: 'FO safety',
  FAM_INS: 'FAM · instr.',
  W_INS: 'LC · instr.',
  OPC_INS: 'OPC · instr.',
  LPC_INS: 'LPC · instr.',
  OPC: 'OPC',
  LPC: 'LPC',
};

export const isInstructorMark = (m: string) => m.endsWith('_INS') || m === 'CLTC' || m === 'CTRI';

// A duty's observations split into known marks and the rest of the text.
export function splitMarks(text: string): { marks: string[]; rest: string } {
  const parts = text.split(/,\s*/).filter(Boolean);
  return { marks: [...new Set(parts.filter((p) => MARK_LABEL[p]))], rest: parts.filter((p) => !MARK_LABEL[p]).join(', ') };
}

// The distinct marks across a day's duties, in the order they first appear.
export function dayMarks(duties: ParsedDuty[]): string[] {
  return [...new Set(duties.flatMap((d) => (d.observations ? splitMarks(d.observations).marks : [])))];
}
