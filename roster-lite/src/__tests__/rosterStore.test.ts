import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveUser, listUsers, saveRoster, loadRoster, deleteUser,
  saveReg, loadRegs, putLogbookRows, loadLogbook, putDocument, loadDocuments,
  savePdf, listPdfs, regKey, logbookRowKey,
} from '../storage/rosterStore';
import { addNotification, listNotifications } from '../storage/notifications';
import type { UserProfile, Roster, AircraftReg, LogbookRow, CrewDocument, SavedPdf } from '../domain/types';

const user = (id: string): UserProfile => ({ id, name: id, createdAt: '2026-01-01T00:00:00Z' });
const roster = (id: string): Roster => ({
  id, fileName: 'r.pdf', sourceType: 'pdf', importedAt: '2026-01-01T00:00:00Z', duties: [], rawText: '',
});
const reg = (uid: string): AircraftReg => ({
  key: regKey(uid, '2026-06-01', 'TP1', 'LIS', 'OPO'), userId: uid, date: '2026-06-01',
  flightNumber: 'TP1', dep: 'LIS', arr: 'OPO', reg: 'CS-AAA', model: null, recordedAt: '',
});
const logRow = (uid: string): LogbookRow => ({
  key: logbookRowKey(uid, '2026-06-01', 'TP1', 'LIS', 'OPO'), userId: uid, date: '2026-06-01',
  flightNumber: 'TP1', from: 'LIS', to: 'OPO', off: '08:00', on: '09:00', aircraft: 'E90', reg: '',
});
const doc = (uid: string): CrewDocument => ({ id: `${uid}-d1`, userId: uid, name: 'Medical', expiry: '2027-01-01' });
const pdf = (uid: string): SavedPdf => ({
  id: `${uid}-p1`, userId: uid, fileName: 'x.pdf', blob: new Blob(['x'], { type: 'application/pdf' }),
  downloadedAt: '2026-01-01T00:00:00Z', beginDate: null, endDate: null,
});

beforeEach(() => localStorage.clear());

describe('rosterStore CRUD', () => {
  it('saves and lists users and rosters', async () => {
    await saveUser(user('u-crud'));
    expect((await listUsers()).some((u) => u.id === 'u-crud')).toBe(true);
    await saveRoster('u-crud', roster('u-crud'));
    expect((await loadRoster('u-crud'))?.fileName).toBe('r.pdf');
  });
});

describe('deleteUser completeness (audit Wave 1)', () => {
  it('removes the user and EVERY store of its data, including PDFs', async () => {
    const uid = 'u-del';
    await saveUser(user(uid));
    await saveRoster(uid, roster(uid));
    await saveReg(reg(uid));
    await putLogbookRows([logRow(uid)]);
    await putDocument(doc(uid));
    await savePdf(pdf(uid));
    addNotification(uid, 'a change');
    localStorage.setItem(`crewroster.autoreg.${uid}`, '2026-06-01');

    await deleteUser(uid);

    expect((await listUsers()).some((u) => u.id === uid)).toBe(false);
    expect(await loadRoster(uid)).toBeUndefined();
    expect(await loadRegs(uid)).toHaveLength(0);
    expect(await loadLogbook(uid)).toHaveLength(0);
    expect(await loadDocuments(uid)).toHaveLength(0);
    expect(await listPdfs(uid)).toHaveLength(0); // previously orphaned
    expect(listNotifications(uid)).toHaveLength(0);
    expect(localStorage.getItem(`crewroster.autoreg.${uid}`)).toBeNull();
  });

  it('leaves other users untouched', async () => {
    await saveUser(user('keep'));
    await savePdf(pdf('keep'));
    await saveUser(user('drop'));
    await savePdf(pdf('drop'));
    await deleteUser('drop');
    expect((await listUsers()).some((u) => u.id === 'keep')).toBe(true);
    expect(await listPdfs('keep')).toHaveLength(1);
  });
});
