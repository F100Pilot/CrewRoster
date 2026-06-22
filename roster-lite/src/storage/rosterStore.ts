import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AircraftReg, Roster, SavedPdf, UserProfile } from '../domain/types';

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
}

let dbPromise: Promise<IDBPDatabase<RosterDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<RosterDB>('crewroster-lite', 4, {
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

export async function deleteUser(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('users', id);
  await db.delete('rosters', id);
  // Drop this profile's recorded aircraft registrations too.
  const tx = db.transaction('regs', 'readwrite');
  for (const key of await tx.store.index('userId').getAllKeys(id)) await tx.store.delete(key);
  await tx.done;
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
// Stable key per crew member + day + flight, so re-recording the same sector updates in
// place instead of duplicating.
export function regKey(userId: string, date: string, flightNumber: string): string {
  return `${userId}|${date}|${flightNumber}`;
}

export async function saveReg(entry: AircraftReg): Promise<void> {
  const db = await getDb();
  await db.put('regs', entry);
}

export async function loadRegs(userId: string): Promise<AircraftReg[]> {
  const db = await getDb();
  return db.getAllFromIndex('regs', 'userId', userId);
}
