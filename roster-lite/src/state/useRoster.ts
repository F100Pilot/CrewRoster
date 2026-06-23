import { createContext, useContext } from 'react';
import type { CrewRole, DayChange, Roster, UserProfile } from '../domain/types';

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
  warnings: string[];
  sessionToken: string | null;
  importFile: (file: File) => Promise<void>;
  // Parse + diff without saving (review step), then commit the reviewed preview.
  previewImport: (file: File) => Promise<RosterImportPreview>;
  applyImport: (preview: RosterImportPreview) => Promise<void>;
  clear: () => Promise<void>;
  dismissChanges: () => Promise<void>;
  setSessionToken: (token: string | null) => void;
  // multi-user
  users: UserProfile[];
  activeUser: UserProfile | null;
  switchUser: (userId: string) => Promise<void>;
  createUser: (name: string, crewCode?: string, role?: CrewRole) => Promise<UserProfile>;
  renameUser: (userId: string, name: string, crewCode?: string, role?: CrewRole) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
}

export const RosterContext = createContext<RosterState | null>(null);

export function useRoster(): RosterState {
  const ctx = useContext(RosterContext);
  if (!ctx) throw new Error('useRoster must be used within <RosterProvider>');
  return ctx;
}
