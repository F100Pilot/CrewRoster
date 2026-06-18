import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Roster } from '../domain/types';

interface RosterDB extends DBSchema {
  rosters: {
    key: string;
    value: Roster;
  };
}

let dbPromise: Promise<IDBPDatabase<RosterDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<RosterDB>('crewroster-lite', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('rosters')) {
          db.createObjectStore('rosters', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

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
