import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CrewRole, Roster, UserProfile } from '../domain/types';
import { parseRosterFile } from '../parsing';
import { diffRosters } from '../domain/rosterDiff';
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
  // CrewLink sessions are per-user and kept in memory only (never persisted): each
  // crew member logs in with their own credentials. `sessionToken` is the active
  // user's token; the map holds every signed-in user's token for this tab.
  const [sessionToken, setSessionTokenState] = useState<string | null>(null);
  const sessionsByUser = useRef<Map<string, string>>(new Map());
  const activeUserRef = useRef<UserProfile | null>(null);
  activeUserRef.current = activeUser;

  // Set/clear the CrewLink session for whoever is active right now.
  const setSessionToken = useCallback((token: string | null) => {
    const uid = activeUserRef.current?.id;
    if (uid) {
      if (token) sessionsByUser.current.set(uid, token);
      else sessionsByUser.current.delete(uid);
    }
    setSessionTokenState(token);
  }, []);

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
    activeUserRef.current = user;
    setRoster(null);
    setError(null);
    setWarnings([]);
    // Restore this user's own CrewLink session (if they signed in this tab).
    setSessionTokenState(sessionsByUser.current.get(userId) ?? null);
    const r = await loadRoster(userId);
    setRoster(r ?? null);
  }, [users]);

  const createUser = useCallback(async (name: string, crewCode?: string, role: CrewRole = 'pilot'): Promise<UserProfile> => {
    const user: UserProfile = {
      id: crypto.randomUUID(),
      name: name.trim(),
      crewCode: crewCode?.trim() || undefined,
      role,
      createdAt: new Date().toISOString(),
    };
    await saveUser(user);
    setUsers((prev) => [...prev, user]);
    // Switch to the newly created profile: a new profile starts with its own (empty)
    // CrewLink session and its own roster, so the next download uses the right
    // credentials instead of inheriting the previous user's.
    setActiveUserId(user.id);
    setActiveUser(user);
    activeUserRef.current = user;
    setSessionTokenState(null);
    setRoster(null);
    setError(null);
    setWarnings([]);
    const r = await loadRoster(user.id);
    setRoster(r ?? null);
    return user;
  }, []);

  const renameUser = useCallback(async (userId: string, name: string, crewCode?: string, role?: CrewRole) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    const updated: UserProfile = {
      ...user,
      name: name.trim(),
      crewCode: crewCode?.trim() || undefined,
      role: role ?? user.role ?? 'pilot',
    };
    await saveUser(updated);
    setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    if (activeUser?.id === userId) setActiveUser(updated);
  }, [users, activeUser]);

  const deleteUserFn = useCallback(async (userId: string) => {
    await deleteUserDB(userId);
    clearUserGCalData(userId);
    sessionsByUser.current.delete(userId);
    setUsers((prev) => {
      const updated = prev.filter((u) => u.id !== userId);
      if (activeUser?.id === userId) {
        const next = updated[0] ?? null;
        setActiveUserId(next?.id ?? null);
        setActiveUser(next);
        activeUserRef.current = next;
        setSessionTokenState(next ? sessionsByUser.current.get(next.id) ?? null : null);
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
      // Diff against whatever the user had before, so we can highlight what changed.
      const previous = await loadRoster(activeUser.id);
      const changes = previous ? diffRosters(previous.duties, result.duties) : [];
      const next: Roster = {
        id: activeUser.id,
        fileName: file.name,
        sourceType: result.sourceType,
        importedAt: new Date().toISOString(),
        duties: result.duties,
        rawText: result.rawText,
        changes,
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

  // Acknowledge the "what changed" highlights so they don't show again on reload.
  const dismissChanges = useCallback(async () => {
    if (!activeUser || !roster?.changes?.length) return;
    const updated: Roster = { ...roster, changes: [] };
    await saveRoster(activeUser.id, updated);
    setRoster(updated);
  }, [activeUser, roster]);

  const value = useMemo<RosterState>(
    () => ({
      roster, loading, importing, error, warnings, sessionToken,
      importFile, clear, dismissChanges, setSessionToken,
      users, activeUser,
      switchUser, createUser, renameUser, deleteUser: deleteUserFn,
    }),
    [roster, loading, importing, error, warnings, sessionToken,
     importFile, clear, dismissChanges, users, activeUser, switchUser, createUser, renameUser, deleteUserFn]
  );

  return <RosterContext.Provider value={value}>{children}</RosterContext.Provider>;
}
