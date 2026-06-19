import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Roster, SavedPdf } from '../domain/types';

interface RosterDB extends DBSchema {
  rosters: {
    key: string;
    value: Roster;
  };
  pdfs: {
    key: string;
    value: SavedPdf;
    indexes: { downloadedAt: string };
  };
}

let dbPromise: Promise<IDBPDatabase<RosterDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<RosterDB>('crewroster-lite', 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('rosters')) {
          db.createObjectStore('rosters', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('pdfs')) {
          const store = db.createObjectStore('pdfs', { keyPath: 'id' });
          store.createIndex('downloadedAt', 'downloadedAt');
        }
      },
    });
  }
  return dbPromise;
}

// --- Roster (single, current) ---------------------------------------------

// Only one roster is kept at a time, under the fixed key 'current'.
export async function saveRoster(roster: Roster): Promise<void> {
  const db = await getDb();
  await db.put('rosters', roster);
}

export async function loadRoster(): Promise<Roster | undefined> {
  const db = await getDb();
  return db.get('rosters', 'current');
}

export async function clearRoster(): Promise<void> {
  const db = await getDb();
  await db.delete('rosters', 'current');
}

// --- Saved PDFs (history) --------------------------------------------------

export async function savePdf(pdf: SavedPdf): Promise<void> {
  const db = await getDb();
  await db.put('pdfs', pdf);
}

// Newest first.
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
