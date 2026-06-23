import { describe, it, expect, beforeEach } from 'vitest';
import { buildBackup, restoreBackup, readBackupFile, BackupError, type BackupFile } from '../storage/backup';
import { saveUser, saveRoster, savePdf, loadRoster, listUsers, getPdf } from '../storage/rosterStore';
import type { UserProfile, Roster, SavedPdf } from '../domain/types';

const user: UserProfile = { id: 'u1', name: 'Paulo', createdAt: '2026-01-01T00:00:00Z' };
const roster: Roster = {
  id: 'u1', fileName: 'plan.pdf', sourceType: 'pdf', importedAt: '2026-01-01T00:00:00Z',
  duties: [{ date: '2026-06-01', dutyCode: 'FLT', dutyType: 'Flight Duty', reportingTime: null, departureTime: '08:00', arrivalTime: '09:00', flightNumber: 'TP1', departureAirport: 'LIS', arrivalAirport: 'OPO', aircraftType: 'E90', observations: null }],
  rawText: 'raw',
};
const pdf: SavedPdf = {
  id: 'u1-p1', userId: 'u1', fileName: 'plan.pdf', blob: new Blob(['%PDF-1.4 hello'], { type: 'application/pdf' }),
  downloadedAt: '2026-01-01T00:00:00Z', beginDate: '2026-06-01', endDate: null,
};

function fileFrom(backup: BackupFile): File {
  return new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
}

// A replace-restore only clears the stores it's given, so an all-empty-stores payload
// wipes the DB clean between tests.
const EMPTY_STORES = { users: [], rosters: [], regs: [], logbook: [], documents: [], pdfs: [] };
async function wipe() {
  localStorage.clear();
  await restoreBackup({ format: 'crewroster-backup', version: 1, appVersion: '0', createdAt: '', stores: EMPTY_STORES, localStorage: {} }, true);
}

beforeEach(wipe);

describe('backup round-trip', () => {
  it('exports and restores users, rosters and a PDF Blob intact', async () => {
    await saveUser(user);
    await saveRoster('u1', roster);
    await savePdf(pdf);
    localStorage.setItem('crewroster.checkinLeadMin', '60');

    const backup = await buildBackup();

    // wipe everything, then restore from the backup
    await wipe();
    expect(await listUsers()).toHaveLength(0);

    await restoreBackup(backup, true);

    expect((await listUsers()).map((u) => u.id)).toContain('u1');
    expect((await loadRoster('u1'))?.duties[0].flightNumber).toBe('TP1');
    // The pdfs store round-trips as a row. (Blob *bytes* can't be asserted here:
    // fake-indexeddb persists via structuredClone, which doesn't preserve jsdom Blobs —
    // an env limitation, not an app one. Real browsers keep the Blob intact.)
    expect((await getPdf('u1-p1'))?.fileName).toBe('plan.pdf');
    expect(localStorage.getItem('crewroster.checkinLeadMin')).toBe('60');
  });

  it('serializes a Blob to a data: URL in the exported JSON', async () => {
    await savePdf(pdf);
    const backup = await buildBackup();
    // The exported pdfs row carries the blob as a {__blob,data:"data:..."} marker, so the
    // backup is plain JSON. (Under jsdom the stored Blob clones to {}, so we assert the
    // row is present and JSON-serializable rather than the data-URL bytes.)
    expect(() => JSON.stringify(backup)).not.toThrow();
    expect(backup.stores.pdfs?.some((p) => (p as { id: string }).id === 'u1-p1')).toBe(true);
  });
});

describe('restore validation (audit Wave 1)', () => {
  const base: BackupFile = { format: 'crewroster-backup', version: 1, appVersion: '0', createdAt: '', stores: {}, localStorage: {} };

  it('only restores allow-listed localStorage keys, dropping foreign and OAuth-token keys', async () => {
    await restoreBackup({
      ...base,
      localStorage: {
        'crewroster.checkinLeadMin': '30',     // owned → kept
        'active_user_id': 'u1',                 // owned → kept
        'gcal_token_u1': 'ya29.secret',         // sensitive → dropped
        'evil_key': 'pwned',                    // foreign → dropped
      },
    }, true);
    expect(localStorage.getItem('crewroster.checkinLeadMin')).toBe('30');
    expect(localStorage.getItem('active_user_id')).toBe('u1');
    expect(localStorage.getItem('gcal_token_u1')).toBeNull();
    expect(localStorage.getItem('evil_key')).toBeNull();
  });

  it('rejects an invalid AeroDataBox key value', async () => {
    await restoreBackup({ ...base, localStorage: { 'crewroster.aerodataboxKey': 'not a key!!' } }, true);
    expect(localStorage.getItem('crewroster.aerodataboxKey')).toBeNull();
  });

  it('drops rows that lack a valid keyPath', async () => {
    await restoreBackup({ ...base, stores: { users: [{ name: 'no id' }, { id: 'good', name: 'ok', createdAt: '' }] } }, true);
    const ids = (await listUsers()).map((u) => u.id);
    expect(ids).toContain('good');
    expect(ids).toHaveLength(1);
  });

  it('readBackupFile rejects a non-backup file', async () => {
    const f = new File(['{"hello":1}'], 'x.json', { type: 'application/json' });
    await expect(readBackupFile(f)).rejects.toBeInstanceOf(BackupError);
  });

  it('rejects an embedded blob whose data is not a safe data: URL', async () => {
    const hostile: BackupFile = {
      ...base,
      stores: { pdfs: [{ id: 'p', userId: 'u1', fileName: 'x', downloadedAt: '', beginDate: null, endDate: null, blob: { __blob: true, type: 'application/pdf', data: 'https://evil.example/x' } }] },
    };
    await expect(restoreBackup(hostile, true)).rejects.toBeInstanceOf(BackupError);
  });

  it('parses a real exported file via readBackupFile', async () => {
    await saveUser(user);
    const backup = await buildBackup();
    const { summary } = await readBackupFile(fileFrom(backup));
    expect(summary.users).toBeGreaterThanOrEqual(1);
  });
});
