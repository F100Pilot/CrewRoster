import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CrewRole, Roster, UserProfile } from '../domain/types';
import { parseRosterFile, PARSE_VERSION } from '../parsing';
import { diffRosters } from '../domain/rosterDiff';
import { mergeDuties } from '../domain/rosterMerge';
import {
  assignOrphanPdfs, clearRoster, deleteUser as deleteUserDB, getActiveUserId,
  listPdfs, listUsers, loadLogbook, loadRoster, migrateLegacySingleUser,
  putLogbookRows, saveRoster, saveUser, setActiveUserId,
} from '../storage/rosterStore';
import { mergeLogbook } from '../domain/logbook';
import { regMap } from '../domain/aircraftRegs';
import { clearUserGCalData } from '../utils/googleCalendar';
import { setCredentials } from '../storage/settings';
import { RosterContext, type RosterState, type RosterImportPreview } from './useRoster';

// Re-parse a stored PDF roster from its saved PDF(s) with the current parser, so improvements
// (crew, times, routes…) reach the user automatically on app entry — no need to re-download the
// schedule after a code change. Gated by PARSE_VERSION so it runs once per parser bump. The
// saved PDFs are re-parsed oldest→newest and merged on top of the existing roster, so dates whose
// source PDF is no longer kept aren't lost. Best-effort: needs the original PDF in history
// (in-app downloads keep it) and returns the roster unchanged on any failure.
async function reparseStoredRoster(roster: Roster, userId: string): Promise<Roster> {
  if (roster.sourceType !== 'pdf') return roster;
  if ((roster.parseVersion ?? 0) >= PARSE_VERSION) return roster;
  try {
    const pdfs = await listPdfs(userId);
    if (pdfs.length === 0) return roster; // no source PDF kept → can't re-parse (re-import path)
    const ordered = [...pdfs].sort((a, b) => a.downloadedAt.localeCompare(b.downloadedAt));
    let duties = roster.duties;
    let rawText = roster.rawText;
    let reparsed = false;
    for (const p of ordered) {
      try {
        const file = new File([p.blob], p.fileName, { type: 'application/pdf' });
        const result = await parseRosterFile(file);
        if (result.duties.length === 0) continue;
        duties = mergeDuties(duties, result.duties); // per-day override: re-parsed dates win
        rawText = result.rawText;
        reparsed = true;
      } catch {
        // A single unreadable/non-roster PDF must not abort the refresh — skip it.
      }
    }
    if (!reparsed) return roster;
    const updated: Roster = { ...roster, duties, rawText, parseVersion: PARSE_VERSION };
    await saveRoster(userId, updated);
    return updated;
  } catch {
    return roster;
  }
}

export function RosterProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [activeUser, setActiveUser] = useState<UserProfile | null>(null);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  // CrewLink sessions are per-user and kept in memory only (never persisted): each
  // crew member logs in with their own credentials. `sessionToken` is the active
  // user's token; the map holds every signed-in user's token for this tab.
  const [sessionToken, setSessionTokenState] = useState<string | null>(null);
  const sessionsByUser = useRef<Map<string, string>>(new Map());
  const activeUserRef = useRef<UserProfile | null>(null);
  activeUserRef.current = activeUser;
  // Serializes imports so concurrent merges don't clobber each other.
  const importLock = useRef<Promise<unknown>>(Promise.resolve());

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

        // Claim PDFs saved before history was per-user — but ONLY when a single profile
        // exists, so we never hand one crew member's downloads to another. With multiple
        // profiles the owner is ambiguous, so orphans are left unclaimed.
        if (allUsers.length === 1) await assignOrphanPdfs(allUsers[0].id);

        const savedId = getActiveUserId();
        const active = allUsers.find((u) => u.id === savedId) ?? allUsers[0];
        setActiveUserId(active.id);
        setActiveUser(active);

        const r = await loadRoster(active.id);
        setRoster(r ?? null);
        // Re-parse the stored PDF(s) if they predate the current parser. Runs in the background
        // so startup isn't blocked; the roster refreshes in place once it resolves.
        if (r) {
          reparseStoredRoster(r, active.id).then((updated) => {
            if (updated !== r && activeUserRef.current?.id === active.id) setRoster(updated);
          });
        }
      } catch (e) {
        // A failed IndexedDB read must NOT look like a first launch (which would prompt
        // re-onboarding over unreadable-this-session data). Surface a recoverable error.
        setLoadError(e instanceof Error ? e.message : 'Não foi possível carregar os dados.');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Keep the permanent logbook in sync with the active roster centrally — so Statistics, Map and
  // Documents have data even when the Diário (logbook) page was never opened (it used to be the
  // only place that built the logbook). mergeLogbook only upserts new/changed sectors and never
  // overwrites hand-edited rows, so this is safe to run on every roster load/import. Best-effort.
  useEffect(() => {
    const uid = activeUser?.id;
    const duties = roster?.duties;
    if (!uid || !duties || duties.length === 0) return;
    let alive = true;
    (async () => {
      try {
        const [existing, regs] = await Promise.all([loadLogbook(uid), regMap(uid)]);
        const upserts = mergeLogbook(existing, duties, uid, regs);
        if (upserts.length && alive) {
          await putLogbookRows(upserts);
          // Let already-mounted pages (Stats/Map/Documents) refresh once the sync lands.
          window.dispatchEvent(new Event('logbook-updated'));
        }
      } catch {
        // logbook sync is best-effort; the Diário page also merges on open as a fallback.
      }
    })();
    return () => { alive = false; };
  }, [activeUser, roster]);

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
    // Guard against a stale load: if the user switched again while we awaited, don't
    // clobber the now-active user's view with this (older) result.
    if (activeUserRef.current?.id === userId) setRoster(r ?? null);
    if (r) {
      reparseStoredRoster(r, userId).then((updated) => {
        if (updated !== r && activeUserRef.current?.id === userId) setRoster(updated);
      });
    }
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
    if (r) {
      reparseStoredRoster(r, user.id).then((updated) => {
        if (updated !== r && activeUserRef.current?.id === user.id) setRoster(updated);
      });
    }
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
    setCredentials(userId, null); // drop this profile's saved CrewLink credentials too
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
    const userId = activeUser.id;
    setImporting(true);
    setError(null);
    setWarnings([]);
    // Serialize imports: two concurrent downloads/imports must not both read the same
    // stored roster and have the second overwrite the first's merge (lost download).
    const run = importLock.current.then(async () => {
      try {
        const result = await parseRosterFile(file);
        // Merge into whatever the user had before so separate downloads accumulate, then
        // diff old-vs-merged to highlight what changed (only dates inside the new
        // download's window can differ, since the rest is kept verbatim).
        const previous = await loadRoster(userId);
        const mergedDuties = mergeDuties(previous?.duties ?? [], result.duties);
        const changes = previous ? diffRosters(previous.duties, mergedDuties) : [];
        const next: Roster = {
          id: userId,
          fileName: file.name,
          sourceType: result.sourceType,
          importedAt: new Date().toISOString(),
          duties: mergedDuties,
          rawText: result.rawText,
          changes,
          parseVersion: PARSE_VERSION,
        };
        await saveRoster(userId, next);
        if (activeUserRef.current?.id === userId) {
          setRoster(next);
          setWarnings(result.warnings);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao ler o ficheiro.');
      }
    });
    importLock.current = run.catch(() => {});
    await run;
    setImporting(false);
  }, [activeUser]);

  // Parse + merge + diff WITHOUT saving — for the "review changes first" flow. Returns
  // what would become current, plus the changes it introduces.
  const previewImport = useCallback(async (file: File): Promise<RosterImportPreview> => {
    if (!activeUser) throw new Error('Sem utilizador ativo.');
    const userId = activeUser.id;
    const result = await parseRosterFile(file);
    const previous = await loadRoster(userId);
    const mergedDuties = mergeDuties(previous?.duties ?? [], result.duties);
    const changes = previous ? diffRosters(previous.duties, mergedDuties) : [];
    const next: Roster = {
      id: userId,
      fileName: file.name,
      sourceType: result.sourceType,
      importedAt: new Date().toISOString(),
      duties: mergedDuties,
      rawText: result.rawText,
      changes,
      parseVersion: PARSE_VERSION,
    };
    return { next, changes, warnings: result.warnings };
  }, [activeUser]);

  // Commit a previewed import. Serialized through the same lock as importFile so a
  // concurrent download can't clobber it.
  const applyImport = useCallback(async (preview: RosterImportPreview) => {
    const userId = preview.next.id;
    const run = importLock.current.then(async () => {
      await saveRoster(userId, preview.next);
      if (activeUserRef.current?.id === userId) {
        setRoster(preview.next);
        setWarnings(preview.warnings);
      }
    });
    importLock.current = run.catch(() => {});
    await run;
  }, []);

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
      roster, loading, importing, error, loadError, warnings, sessionToken,
      importFile, previewImport, applyImport, clear, dismissChanges, setSessionToken,
      users, activeUser,
      switchUser, createUser, renameUser, deleteUser: deleteUserFn,
    }),
    [roster, loading, importing, error, loadError, warnings, sessionToken, setSessionToken,
     importFile, previewImport, applyImport, clear, dismissChanges, users, activeUser, switchUser, createUser, renameUser, deleteUserFn]
  );

  return <RosterContext.Provider value={value}>{children}</RosterContext.Provider>;
}
