import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AircraftReg, CrewDocument, LogbookRow, Roster, SavedPdf, UserProfile } from '../domain/types';
import { clearNotifications } from './notifications';

interface RosterDB extends DBSchema {
  rosters: { key: string; value: Roster };
  pdfs: {
    key: string;
    value: SavedPdf;
    indexes: { downloadedAt: string };
  };
  users: { key: string; value: UserProfile };
  // Aircraft registrations flown, kept apart from the roster so re-downloads (which
  // replace duties per-day) never erase the logbook's recorded tails.
  regs: { key: string; value: AircraftReg; indexes: { userId: string } };
  // The permanent logbook — accumulates operated sectors across rosters and survives
  // clearing the roster. Editable by hand.
  logbook: { key: string; value: LogbookRow; indexes: { userId: string } };
  // Crew documents with expiries (medical, licence, OPC/LPC…), per user.
  documents: { key: string; value: CrewDocument; indexes: { userId: string } };
}

let dbPromise: Promise<IDBPDatabase<RosterDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<RosterDB>('crewroster-lite', 6, {
      upgrade(db, oldVersion) {
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('rosters'))
            db.createObjectStore('rosters', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('pdfs')) {
            const s = db.createObjectStore('pdfs', { keyPath: 'id' });
            s.createIndex('downloadedAt', 'downloadedAt');
          }
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('users'))
            db.createObjectStore('users', { keyPath: 'id' });
        }
        if (oldVersion < 4) {
          if (!db.objectStoreNames.contains('regs')) {
            const s = db.createObjectStore('regs', { keyPath: 'key' });
            s.createIndex('userId', 'userId');
          }
        }
        if (oldVersion < 5) {
          if (!db.objectStoreNames.contains('logbook')) {
            const s = db.createObjectStore('logbook', { keyPath: 'key' });
            s.createIndex('userId', 'userId');
          }
        }
        if (oldVersion < 6) {
          if (!db.objectStoreNames.contains('documents')) {
            const s = db.createObjectStore('documents', { keyPath: 'id' });
            s.createIndex('userId', 'userId');
          }
        }
      },
    });
  }
  return dbPromise;
}

// ── User profiles ──────────────────────────────────────────────────────────

export async function listUsers(): Promise<UserProfile[]> {
  const db = await getDb();
  const all = await db.getAll('users');
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveUser(user: UserProfile): Promise<void> {
  const db = await getDb();
  await db.put('users', user);
}

// Remove the per-user localStorage keys that live outside IndexedDB (confirmed CrewLink
// notifications and the auto-capture stamp). Google Calendar keys are cleared separately
// by the provider's clearUserGCalData.
export function clearUserLocalData(userId: string): void {
  try {
    clearNotifications(userId);
    localStorage.removeItem(`crewroster.autoreg.${userId}`);
  } catch {
    // ignore (storage disabled)
  }
}

// Delete a profile and ALL of its data. Every store is wiped in a SINGLE transaction so a
// mid-way failure can't leave the user gone but its rows orphaned. Keys are read up front
// (awaiting inside a write tx can auto-commit it); 'pdfs' has no userId index so we fetch
// and filter it. Per-user localStorage is cleared after the DB commits.
export async function deleteUser(id: string): Promise<void> {
  const db = await getDb();
  const [regKeys, logKeys, docKeys, allPdfs] = await Promise.all([
    db.getAllKeysFromIndex('regs', 'userId', id),
    db.getAllKeysFromIndex('logbook', 'userId', id),
    db.getAllKeysFromIndex('documents', 'userId', id),
    db.getAll('pdfs'),
  ]);
  const pdfKeys = allPdfs.filter((p) => p.userId === id).map((p) => p.id);

  const tx = db.transaction(['users', 'rosters', 'regs', 'logbook', 'documents', 'pdfs'], 'readwrite');
  await Promise.all([
    tx.objectStore('users').delete(id),
    tx.objectStore('rosters').delete(id),
    ...regKeys.map((k) => tx.objectStore('regs').delete(k)),
    ...logKeys.map((k) => tx.objectStore('logbook').delete(k)),
    ...docKeys.map((k) => tx.objectStore('documents').delete(k)),
    ...pdfKeys.map((k) => tx.objectStore('pdfs').delete(k)),
    tx.done,
  ]);

  clearUserLocalData(id);
}

// ── Active user (localStorage) ─────────────────────────────────────────────────────

export function getActiveUserId(): string | null {
  return localStorage.getItem('active_user_id');
}

export function setActiveUserId(id: string | null): void {
  if (id) localStorage.setItem('active_user_id', id);
  else localStorage.removeItem('active_user_id');
}

// ── Roster (per user) ───────────────────────────────────────────────────────────

export async function saveRoster(userId: string, roster: Roster): Promise<void> {
  const db = await getDb();
  await db.put('rosters', { ...roster, id: userId });
}

export async function loadRoster(userId: string): Promise<Roster | undefined> {
  const db = await getDb();
  return db.get('rosters', userId);
}

export async function clearRoster(userId: string): Promise<void> {
  const db = await getDb();
  await db.delete('rosters', userId);
}

// ── Legacy migration ───────────────────────────────────────────────────────────────
// If the DB has a 'current' roster but no users yet, create a default user
// "Eu" and adopt the roster + any existing Google Calendar localStorage keys.

export async function migrateLegacySingleUser(): Promise<UserProfile | null> {
  const db = await getDb();
  const users = await db.getAll('users');
  if (users.length > 0) return null;

  const legacy = await db.get('rosters', 'current' as string);
  if (!legacy) return null;

  const defaultUser: UserProfile = {
    id: crypto.randomUUID(),
    name: 'Eu',
    createdAt: new Date().toISOString(),
  };

  await db.put('users', defaultUser);
  await db.put('rosters', { ...legacy, id: defaultUser.id });
  await db.delete('rosters', 'current' as string);

  // Migrate Google Calendar localStorage keys
  for (const suffix of ['client_id', 'token', 'expires', 'calendar_id']) {
    const val = localStorage.getItem(`gcal_${suffix}`);
    if (val) {
      localStorage.setItem(`gcal_${suffix}_${defaultUser.id}`, val);
      localStorage.removeItem(`gcal_${suffix}`);
    }
  }

  return defaultUser;
}

// ── Saved PDFs (unchanged) ───────────────────────────────────────────────────────

export async function savePdf(pdf: SavedPdf): Promise<void> {
  const db = await getDb();
  await db.put('pdfs', pdf);
}

export async function listPdfs(userId?: string): Promise<SavedPdf[]> {
  const db = await getDb();
  const all = await db.getAll('pdfs');
  const mine = userId ? all.filter((p) => p.userId === userId) : all;
  return mine.sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt));
}

// Adopt any PDFs saved before history became per-user (no userId) for the given
// user — the oldest profile, i.e. the original owner. Idempotent: once claimed they
// have a userId and are skipped. Stops one user's PDFs leaking into another profile.
export async function assignOrphanPdfs(userId: string): Promise<void> {
  const db = await getDb();
  const all = await db.getAll('pdfs');
  const orphans = all.filter((p) => !p.userId);
  if (orphans.length === 0) return;
  const tx = db.transaction('pdfs', 'readwrite');
  for (const pdf of orphans) tx.store.put({ ...pdf, userId });
  await tx.done;
}

export async function getPdf(id: string): Promise<SavedPdf | undefined> {
  const db = await getDb();
  return db.get('pdfs', id);
}

export async function deletePdf(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('pdfs', id);
}

// ── Aircraft registrations (per user) ───────────────────────────────────────────────
// Stable key per crew member + day + flight + route, so re-recording the same sector
// updates in place — while two sectors of the same flight number on one day (e.g. a
// round trip) stay distinct instead of overwriting each other.
export function regKey(
  userId: string, date: string, flightNumber: string,
  dep: string | null, arr: string | null,
): string {
  return `${userId}|${date}|${flightNumber}|${dep ?? ''}-${arr ?? ''}`;
}

export async function saveReg(entry: AircraftReg): Promise<void> {
  const db = await getDb();
  await db.put('regs', entry);
}

export async function loadRegs(userId: string): Promise<AircraftReg[]> {
  const db = await getDb();
  return db.getAllFromIndex('regs', 'userId', userId);
}

// ── Permanent logbook (per user) ─────────────────────────────────────────────────────
// Stable key per crew member + day + flight + route — same scheme as regKey — so re-
// importing a roster updates a sector in place instead of duplicating it.
export function logbookRowKey(
  userId: string, date: string, flightNumber: string,
  dep: string | null, arr: string | null,
): string {
  return `${userId}|${date}|${flightNumber}|${dep ?? ''}-${arr ?? ''}`;
}

export async function loadLogbook(userId: string): Promise<LogbookRow[]> {
  const db = await getDb();
  return db.getAllFromIndex('logbook', 'userId', userId);
}

// Upsert a batch of rows (new sectors merged from a roster, or one edited by hand).
export async function putLogbookRows(rows: LogbookRow[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('logbook', 'readwrite');
  for (const r of rows) tx.store.put(r);
  await tx.done;
}

export async function deleteLogbookRow(key: string): Promise<void> {
  const db = await getDb();
  await db.delete('logbook', key);
}

// ── Crew documents (per user) ────────────────────────────────────────────────────────

export async function loadDocuments(userId: string): Promise<CrewDocument[]> {
  const db = await getDb();
  return db.getAllFromIndex('documents', 'userId', userId);
}

export async function putDocument(doc: CrewDocument): Promise<void> {
  const db = await getDb();
  await db.put('documents', doc);
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('documents', id);
}

// ── Full backup / restore ────────────────────────────────────────────────────────────
// Every object store, so the user can export the whole app to a file and restore it
// after reinstalling. 'pdfs' rows carry a Blob — the backup layer (de)serializes those.
export const BACKUP_STORES = ['users', 'rosters', 'regs', 'logbook', 'documents', 'pdfs'] as const;
export type BackupStore = (typeof BACKUP_STORES)[number];

export async function exportAllStores(): Promise<Record<BackupStore, unknown[]>> {
  const db = await getDb();
  const out = {} as Record<BackupStore, unknown[]>;
  for (const name of BACKUP_STORES) out[name] = await db.getAll(name);
  return out;
}

// Write rows back. When `replace` is true each store is cleared first, so the imported
// file becomes the exact state; otherwise rows are merged (upsert by key).
export async function importAllStores(
  data: Partial<Record<BackupStore, unknown[]>>,
  replace: boolean,
): Promise<void> {
  const db = await getDb();
  for (const name of BACKUP_STORES) {
    const rows = data[name];
    if (!Array.isArray(rows)) continue;
    const tx = db.transaction(name, 'readwrite');
    if (replace) await tx.store.clear();
    for (const row of rows) tx.store.put(row as never);
    await tx.done;
  }
}
