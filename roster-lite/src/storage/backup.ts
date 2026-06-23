// Full app backup / restore to a single JSON file.
//
// Use case: before uninstalling (or clearing browser data), export everything to a file;
// after reinstalling, import that file to get every roster, logbook, document, saved PDF,
// recorded tail and setting back exactly as it was.
//
// Everything lives in this origin's IndexedDB and localStorage, so the backup captures
// both. Saved PDFs are stored as Blobs in IndexedDB — those are serialized to data URLs
// (base64) for JSON and rebuilt on import.
import { exportAllStores, importAllStores, type BackupStore } from './rosterStore';
import { downloadBlob } from '../utils/download';
import { APP_VERSION } from '../version';

const BACKUP_FORMAT = 'crewroster-backup';
const BACKUP_VERSION = 1;

export interface BackupFile {
  format: string;
  version: number;
  appVersion: string;
  createdAt: string;
  stores: Record<string, unknown[]>;
  localStorage: Record<string, string>;
}

export interface BackupSummary {
  users: number;
  rosters: number;
  sectors: number;
  documents: number;
  pdfs: number;
}

// Marker wrapping a serialized Blob inside the JSON.
interface SerializedBlob {
  __blob: true;
  type: string;
  data: string; // data URL
}

function isSerializedBlob(v: unknown): v is SerializedBlob {
  return typeof v === 'object' && v !== null && (v as SerializedBlob).__blob === true;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  // fetch() resolves data: URLs natively and gives back a Blob with the right type.
  return (await fetch(dataUrl)).blob();
}

// Replace any Blob field on a row with a serialized marker (used for the 'pdfs' store).
async function serializeRow(row: unknown): Promise<unknown> {
  if (typeof row !== 'object' || row === null) return row;
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const [k, v] of Object.entries(out)) {
    if (v instanceof Blob) out[k] = { __blob: true, type: v.type, data: await blobToDataUrl(v) };
  }
  return out;
}

async function deserializeRow(row: unknown): Promise<unknown> {
  if (typeof row !== 'object' || row === null) return row;
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const [k, v] of Object.entries(out)) {
    if (isSerializedBlob(v)) out[k] = await dataUrlToBlob(v.data);
  }
  return out;
}

function countSectors(stores: Record<string, unknown[]>): number {
  return Array.isArray(stores.logbook) ? stores.logbook.length : 0;
}

function summarize(stores: Record<string, unknown[]>): BackupSummary {
  const len = (s: string) => (Array.isArray(stores[s]) ? stores[s].length : 0);
  return {
    users: len('users'),
    rosters: len('rosters'),
    sectors: countSectors(stores),
    documents: len('documents'),
    pdfs: len('pdfs'),
  };
}

// Build the in-memory backup object (all stores + all localStorage for this app).
export async function buildBackup(): Promise<BackupFile> {
  const raw = await exportAllStores();
  const stores: Record<string, unknown[]> = {};
  for (const [name, rows] of Object.entries(raw)) {
    stores[name] = await Promise.all(rows.map(serializeRow));
  }
  const ls: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) ls[key] = localStorage.getItem(key) ?? '';
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    stores,
    localStorage: ls,
  };
}

// Serialize the backup and trigger a download. Returns a summary for the UI.
export async function downloadBackup(): Promise<BackupSummary> {
  const backup = await buildBackup();
  const json = JSON.stringify(backup);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(new Blob([json], { type: 'application/json' }), `crewroster-backup-${stamp}.json`);
  return summarize(backup.stores);
}

export class BackupError extends Error {}

// Parse + validate a backup file without writing anything (for a confirm preview).
export async function readBackupFile(file: File): Promise<{ backup: BackupFile; summary: BackupSummary }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new BackupError('Ficheiro inválido (não é JSON).');
  }
  const backup = parsed as BackupFile;
  if (!backup || backup.format !== BACKUP_FORMAT || typeof backup.stores !== 'object') {
    throw new BackupError('Este ficheiro não é uma cópia de segurança do CrewRoster.');
  }
  if (backup.version > BACKUP_VERSION) {
    throw new BackupError('A cópia foi criada por uma versão mais recente da app. Atualiza primeiro.');
  }
  return { backup, summary: summarize(backup.stores) };
}

// Restore a parsed backup. `replace` clears existing stores first (recommended for a
// clean reinstall); the caller should reload the app afterwards to pick up the new state.
export async function restoreBackup(backup: BackupFile, replace: boolean): Promise<void> {
  const stores: Partial<Record<BackupStore, unknown[]>> = {};
  for (const [name, rows] of Object.entries(backup.stores)) {
    stores[name as BackupStore] = await Promise.all((rows as unknown[]).map(deserializeRow));
  }
  await importAllStores(stores, replace);
  if (backup.localStorage && typeof backup.localStorage === 'object') {
    for (const [k, v] of Object.entries(backup.localStorage)) {
      try { localStorage.setItem(k, v); } catch { /* ignore */ }
    }
  }
}
