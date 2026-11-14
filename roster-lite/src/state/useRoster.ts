import { createContext, useContext } from 'react';
import type { CrewBase, CrewRole, DayChange, Roster, UserProfile } from '../domain/types';

// A parsed-but-not-yet-saved import: the roster that WOULD become current, the changes it
// introduces vs what's stored, and any parser warnings. Lets the UI show the diff and let
// the user apply or discard before anything is written.
export interface RosterImportPreview {
  next: Roster;
  changes: DayChange[];
  warnings: string[];
}

export interface RosterState {
  roster: Roster | null;
  loading: boolean;
  importing: boolean;
  error: string | null;
  // Set when the initial load from IndexedDB fails, so the app can show a recoverable
  // error screen instead of mistaking it for a fresh install (empty user list).
  loadError: string | null;
  warnings: string[];
  sessionToken: string | null;
  importFile: (file: File) => Promise<void>;
  // Parse + diff without saving (review step), then commit the reviewed preview.
  previewImport: (file: File) => Promise<RosterImportPreview>;
  applyImport: (preview: RosterImportPreview) => Promise<void>;
  clear: () => Promise<void>;
  dismissChanges: () => Promise<void>;
  // Mark an IO day as the "prevenir" (true), as not (false), or back to what the roster says (null).
  setPrevenir: (date: string, value: boolean | null) => void;
  // A flight on a day off: paid under RRRGS cl. 13, or the day kept for later; null = as the roster says.
  setOffDayPay: (date: string, value: 'paid' | 'kept' | null) => void;
  // Minutes of a reduced rest before the day (RRRGS cl. 2.8), or null to clear.
  setRestCut: (date: string, minutes: number | null) => void;
  // Re-read every PDF in the history (oldest first) into the roster; the count read, or null if none.
  reloadFromPdfs: () => Promise<number | null>;
  setSessionToken: (token: string | null) => void;
  // multi-user
  users: UserProfile[];
  activeUser: UserProfile | null;
  switchUser: (userId: string) => Promise<void>;
  createUser: (name: string, crewCode?: string, role?: CrewRole) => Promise<UserProfile>;
  renameUser: (userId: string, name: string, crewCode?: string, role?: CrewRole) => Promise<void>;
  setUserBase: (userId: string, base: CrewBase) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
}

export const RosterContext = createContext<RosterState | null>(null);

export function useRoster(): RosterState {
  const ctx = useContext(RosterContext);
  if (!ctx) throw new Error('useRoster must be used within <RosterProvider>');
  return ctx;
}
