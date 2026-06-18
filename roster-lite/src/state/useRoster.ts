import { createContext, useContext } from 'react';
import type { Roster } from '../domain/types';

export interface RosterState {
  roster: Roster | null;
  loading: boolean; // initial hydration from IndexedDB
  importing: boolean; // a file is being parsed
  error: string | null;
  warnings: string[];
  importFile: (file: File) => Promise<void>;
  clear: () => Promise<void>;
}

export const RosterContext = createContext<RosterState | null>(null);

export function useRoster(): RosterState {
  const ctx = useContext(RosterContext);
  if (!ctx) throw new Error('useRoster must be used within <RosterProvider>');
  return ctx;
}
