import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Roster, SavedPdf, UserProfile } from '../domain/types';

interface RosterDB extends DBSchema {
  rosters: { key: string; value: Roster };
  pdfs: {
    key: string;
    value: SavedPdf;
    indexes: { downloadedAt: string };
  };
  users: { key: string; value: UserProfile };
}

let dbPromise: Promise<IDBPDatabase<RosterDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<RosterDB>('crewroster-lite', 3, {
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

export async function listPdfs(): Promise<SavedPdf[]> {
  const db = await getDb();
  const all = await db.getAll('pdfs');
  return all.sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt));
}

export async function getPdf(id: string): Promise<SavedPdf | undefined> {
  const db = await getDb();
  return db.get('pdfs', id);
}

export async function deletePdf(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('pdfs', id);
}
