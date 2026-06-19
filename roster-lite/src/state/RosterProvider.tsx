import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Roster, UserProfile } from '../domain/types';
import { parseRosterFile } from '../parsing';
import {
  clearRoster, deleteUser as deleteUserDB, getActiveUserId,
  listUsers, loadRoster, migrateLegacySingleUser,
  saveRoster, saveUser, setActiveUserId,
} from '../storage/rosterStore';
import { clearUserGCalData } from '../utils/googleCalendar';
import { RosterContext, type RosterState } from './useRoster';

export function RosterProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [activeUser, setActiveUser] = useState<UserProfile | null>(null);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        await migrateLegacySingleUser();
        const allUsers = await listUsers();
        setUsers(allUsers);

        if (allUsers.length === 0) return;

        const savedId = getActiveUserId();
        const active = allUsers.find((u) => u.id === savedId) ?? allUsers[0];
        setActiveUserId(active.id);
        setActiveUser(active);

        const r = await loadRoster(active.id);
        setRoster(r ?? null);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const switchUser = useCallback(async (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    setActiveUserId(userId);
    setActiveUser(user);
    setRoster(null);
    setError(null);
    setWarnings([]);
    const r = await loadRoster(userId);
    setRoster(r ?? null);
  }, [users]);

  const createUser = useCallback(async (name: string, crewCode?: string): Promise<UserProfile> => {
    const user: UserProfile = {
      id: crypto.randomUUID(),
      name: name.trim(),
      crewCode: crewCode?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    await saveUser(user);
    setUsers((prev) => {
      const updated = [...prev, user];
      if (updated.length === 1) {
        setActiveUserId(user.id);
        setActiveUser(user);
      }
      return updated;
    });
    return user;
  }, []);

  const deleteUserFn = useCallback(async (userId: string) => {
    await deleteUserDB(userId);
    clearUserGCalData(userId);
    setUsers((prev) => {
      const updated = prev.filter((u) => u.id !== userId);
      if (activeUser?.id === userId) {
        const next = updated[0] ?? null;
        setActiveUserId(next?.id ?? null);
        setActiveUser(next);
        if (next) {
          loadRoster(next.id).then((r) => setRoster(r ?? null));
        } else {
          setRoster(null);
        }
      }
      return updated;
    });
  }, [activeUser]);

  const importFile = useCallback(async (file: File) => {
    if (!activeUser) return;
    setImporting(true);
    setError(null);
    setWarnings([]);
    try {
      const result = await parseRosterFile(file);
      const next: Roster = {
        id: activeUser.id,
        fileName: file.name,
        sourceType: result.sourceType,
        importedAt: new Date().toISOString(),
        duties: result.duties,
        rawText: result.rawText,
      };
      await saveRoster(activeUser.id, next);
      setRoster(next);
      setWarnings(result.warnings);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao ler o ficheiro.');
    } finally {
      setImporting(false);
    }
  }, [activeUser]);

  const clear = useCallback(async () => {
    if (!activeUser) return;
    await clearRoster(activeUser.id);
    setRoster(null);
    setWarnings([]);
    setError(null);
  }, [activeUser]);

  const value = useMemo<RosterState>(
    () => ({
      roster, loading, importing, error, warnings, sessionToken,
      importFile, clear, setSessionToken,
      users, activeUser,
      switchUser, createUser, deleteUser: deleteUserFn,
    }),
    [roster, loading, importing, error, warnings, sessionToken,
     importFile, clear, users, activeUser, switchUser, createUser, deleteUserFn]
  );

  return <RosterContext.Provider value={value}>{children}</RosterContext.Provider>;
}
