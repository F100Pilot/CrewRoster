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
import { API_KEY_PATTERN } from './settings';

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

// We only ever store PDF blobs (saved CrewLink rosters), so the rebuilt Blob's type is
// constrained to that — a backup can't smuggle in an arbitrary MIME.
const ALLOWED_BLOB_TYPES = new Set(['application/pdf']);
const DATA_URL_RE = /^data:[\w.+-]+\/[\w.+-]+;base64,/i;
const MAX_BLOB_DATAURL = 25 * 1024 * 1024; // 25 MB ceiling per embedded file

// Rebuild a Blob from a serialized marker in an imported file. The string is fully
// attacker-controlled, so validate the scheme, cap the size, and force a safe MIME
// before handing it to fetch() — never fetch an arbitrary URL or trust the declared type.
async function dataUrlToBlob(s: SerializedBlob): Promise<Blob> {
  if (typeof s.data !== 'string' || !DATA_URL_RE.test(s.data)) {
    throw new BackupError('Conteúdo de ficheiro inválido na cópia de segurança.');
  }
  if (s.data.length > MAX_BLOB_DATAURL) {
    throw new BackupError('Um ficheiro embebido na cópia é demasiado grande.');
  }
  const raw = await (await fetch(s.data)).blob();
  const type = ALLOWED_BLOB_TYPES.has(s.type) ? s.type : 'application/pdf';
  return new Blob([raw], { type });
}

// Keys that must never be copied between objects — guards against prototype pollution
// from a hand-crafted backup file.
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

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
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(k)) continue;
    out[k] = isSerializedBlob(v) ? await dataUrlToBlob(v) : v;
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

// The keyPath of each store, so we can drop rows that don't carry a valid string key
// instead of letting a malformed/hostile row reach IndexedDB.
const STORE_KEYPATH: Record<BackupStore, string> = {
  users: 'id', rosters: 'id', regs: 'key', logbook: 'key', documents: 'id', pdfs: 'id',
};

function validRow(store: BackupStore, row: unknown): row is Record<string, unknown> {
  if (typeof row !== 'object' || row === null) return false;
  return typeof (row as Record<string, unknown>)[STORE_KEYPATH[store]] === 'string';
}

// localStorage keys the app owns and may restore. Anything else in an imported file is
// ignored, so a hostile backup can't set arbitrary trusted keys.
const LS_ALLOW_EXACT = new Set(['active_user_id']);
const LS_ALLOW_PREFIXES = [
  'crewroster.',            // aerodataboxKey, checkinLeadMin, lastSeenVersion, colorMode, autoreg.*
  'crewlink_notifications_',
  'gcal_client_id_',        // OAuth client id (not a secret) and the resolved calendar id…
  'gcal_calendar_id_',
  // …but NOT gcal_token_/gcal_expires_ — access tokens are never restored; re-auth instead.
];
const LS_MAX_VALUE = 256 * 1024; // 256 KB per key

function lsAllowed(key: string): boolean {
  return LS_ALLOW_EXACT.has(key) || LS_ALLOW_PREFIXES.some((p) => key.startsWith(p));
}

function restoreLocalStorage(ls: Record<string, string> | undefined): void {
  if (!ls || typeof ls !== 'object') return;
  for (const [k, v] of Object.entries(ls)) {
    if (typeof v !== 'string' || v.length > LS_MAX_VALUE || !lsAllowed(k)) continue;
    // Never let an imported file poison the API key with an invalid/hostile value.
    if (k === 'crewroster.aerodataboxKey' && !API_KEY_PATTERN.test(v.trim())) continue;
    try { localStorage.setItem(k, v); } catch { /* ignore */ }
  }
}

// Restore a parsed backup. `replace` clears existing stores first (recommended for a
// clean reinstall); the caller should reload the app afterwards to pick up the new state.
// Rows are validated and localStorage keys allow-listed, so importing a foreign/edited
// file can't inject arbitrary trusted state.
export async function restoreBackup(backup: BackupFile, replace: boolean): Promise<void> {
  const stores: Partial<Record<BackupStore, unknown[]>> = {};
  for (const [name, rows] of Object.entries(backup.stores)) {
    if (!(name in STORE_KEYPATH) || !Array.isArray(rows)) continue; // ignore unknown stores
    const store = name as BackupStore;
    const clean: unknown[] = [];
    for (const r of rows) {
      const row = await deserializeRow(r);
      if (validRow(store, row)) clean.push(row);
    }
    stores[store] = clean;
  }
  await importAllStores(stores, replace);
  restoreLocalStorage(backup.localStorage);
}
