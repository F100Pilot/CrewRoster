import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  writeBatch,
  Timestamp,
  limit,
  DocumentData,
} from 'firebase/firestore';
import { db } from './config';

// ---------- Roster ----------

export interface DutyData {
  id: string;
  date: string;
  dutyCode: string;
  dutyType: string;
  reportingTime: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  dutyTime: string | null;
  blockTime: number;
  flightNumber: string | null;
  departureAirport: string | null;
  arrivalAirport: string | null;
  observations: string | null;
  isModified: boolean;
  modifiedAt: string | null;
  flight?: FlightData | null;
}

export interface FlightData {
  flightNumber: string;
  aircraftType: string;
  departureAirport: string;
  arrivalAirport: string;
}

// Fetch monthly roster
export async function fetchMonthlyRoster(
  userId: string,
  year: number,
  month: number
): Promise<DutyData[]> {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  const q = query(
    collection(db, 'duties'),
    where('userId', '==', userId),
    where('date', '>=', Timestamp.fromDate(monthStart)),
    where('date', '<=', Timestamp.fromDate(monthEnd)),
    orderBy('date', 'asc'),
    orderBy('reportingTime', 'asc')
  );

  const snapshot = await getDocs(q);
  const duties = await enrichDuties(snapshot.docs);
  return duties;
}

// Fetch daily roster
export async function fetchDailyRoster(userId: string, date: string): Promise<DutyData[]> {
  const dayStart = new Date(date + 'T00:00:00.000Z');
  const dayEnd = new Date(date + 'T23:59:59.999Z');

  const q = query(
    collection(db, 'duties'),
    where('userId', '==', userId),
    where('date', '>=', Timestamp.fromDate(dayStart)),
    where('date', '<=', Timestamp.fromDate(dayEnd)),
    orderBy('date', 'asc'),
    orderBy('reportingTime', 'asc')
  );

  const snapshot = await getDocs(q);
  return enrichDuties(snapshot.docs);
}

// Fetch next duty
export async function fetchNextDuty(userId: string): Promise<DutyData | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const q = query(
    collection(db, 'duties'),
    where('userId', '==', userId),
    where('date', '>=', Timestamp.fromDate(today)),
    orderBy('date', 'asc'),
    orderBy('reportingTime', 'asc'),
    limit(30)
  );

  const snapshot = await getDocs(q);
  const duties = await enrichDuties(snapshot.docs);

  const todayStr = today.toISOString().split('T')[0];
  return duties.find((d) => {
    if (d.date > todayStr) return true;
    if (d.date === todayStr && d.reportingTime && d.reportingTime >= currentTime) return true;
    return false;
  }) || null;
}

// Fetch monthly stats
export async function fetchRosterStats(userId: string): Promise<{
  blockHours: number;
  sectorCount: number;
  offDaysRemaining: number;
}> {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

  const q = query(
    collection(db, 'duties'),
    where('userId', '==', userId),
    where('date', '>=', Timestamp.fromDate(monthStart)),
    where('date', '<=', Timestamp.fromDate(monthEnd))
  );

  const snapshot = await getDocs(q);
  let blockHours = 0;
  let sectorCount = 0;
  let offDaysRemaining = 0;

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    blockHours += data.blockTime || 0;
    if (data.flightNumber) sectorCount++;
    const d = data.date?.toDate?.();
    if (d && (data.dutyCode === 'OFF' || data.dutyType === 'Day Off') && d >= today) {
      offDaysRemaining++;
    }
  });

  return { blockHours, sectorCount, offDaysRemaining };
}

// Fetch recent changes
export async function fetchRecentChanges(userId: string): Promise<Array<{
  id: string;
  date: string;
  dutyCode: string;
  dutyType: string;
  modifiedAt: string;
}>> {
  const q = query(
    collection(db, 'duties'),
    where('userId', '==', userId),
    where('isModified', '==', true),
    orderBy('modifiedAt', 'desc'),
    limit(10)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      date: data.date?.toDate?.()?.toISOString()?.split('T')[0] || '',
      dutyCode: data.dutyCode,
      dutyType: data.dutyType,
      modifiedAt: data.modifiedAt?.toDate?.()?.toISOString() || '',
    };
  });
}

// Enrich duties with flight info
async function enrichDuties(docs: any[]): Promise<DutyData[]> {
  const flightNumbers = Array.from(new Set(docs
    .map((d) => d.data().flightNumber)
    .filter(Boolean))) as string[];

  const flightMap = new Map<string, FlightData>();

  await Promise.all(
    flightNumbers.map(async (fn) => {
      const q = query(collection(db, 'flights'), where('flightNumber', '==', fn), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data();
        flightMap.set(fn, {
          flightNumber: data.flightNumber,
          aircraftType: data.aircraftType,
          departureAirport: data.departureAirport,
          arrivalAirport: data.arrivalAirport,
        });
      }
    })
  );

  return docs.map((d) => {
    const data = d.data();
    const fn = data.flightNumber;
    return {
      id: d.id,
      date: data.date?.toDate?.()?.toISOString()?.split('T')[0] || '',
      dutyCode: data.dutyCode,
      dutyType: data.dutyType,
      reportingTime: data.reportingTime || null,
      departureTime: data.departureTime?.toDate?.()?.toISOString() || null,
      arrivalTime: data.arrivalTime?.toDate?.()?.toISOString() || null,
      dutyTime: data.dutyTime || null,
      blockTime: data.blockTime || 0,
      flightNumber: fn || null,
      departureAirport: data.departureAirport || null,
      arrivalAirport: data.arrivalAirport || null,
      observations: data.observations || null,
      isModified: data.isModified || false,
      modifiedAt: data.modifiedAt?.toDate?.()?.toISOString() || null,
      flight: fn && flightMap.has(fn) ? flightMap.get(fn)! : null,
    };
  });
}

// ---------- Profile ----------

export async function fetchProfile(userId: string) {
  const docRef = doc(db, 'users', userId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Profile not found');
  const data = snap.data();
  return {
    id: snap.id,
    crewCode: data.crewCode,
    fullName: data.fullName,
    base: data.base,
    role: data.role,
    email: data.email || null,
    phone: data.phone || null,
    medicalValidity: data.medicalValidity?.toDate?.()?.toISOString() || null,
    lpcValidity: data.lpcValidity?.toDate?.()?.toISOString() || null,
  };
}

export async function updateProfile(userId: string, updates: { email?: string; phone?: string }) {
  const docRef = doc(db, 'users', userId);
  await updateDoc(docRef, { ...updates, updatedAt: new Date() });
}

// ---------- Notifications ----------

export async function fetchNotifications(
  userId: string,
  unreadOnly?: boolean
): Promise<Array<{
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}>> {
  let q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  if (unreadOnly) {
    q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('isRead', '==', false),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      type: data.type,
      title: data.title,
      message: data.message,
      isRead: data.isRead,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || '',
    };
  });
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const docRef = doc(db, 'notifications', notificationId);
  const snap = await getDoc(docRef);
  if (snap.exists() && snap.data().userId === userId) {
    await updateDoc(docRef, { isRead: true });
  }
}

export async function markAllNotificationsRead(userId: string) {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    where('isRead', '==', false)
  );
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  snapshot.docs.forEach((d) => batch.update(d.ref, { isRead: true }));
  await batch.commit();
}

// ---------- Calendar ----------

export async function exportCalendarToken(userId: string): Promise<string> {
  const docRef = doc(db, 'users', userId);
  const snap = await getDoc(docRef);

  // Reuse existing token or generate new one
  const existing = snap.data()?.icsToken;
  if (existing) return existing;

  // Generate a random token
  const token = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
  await updateDoc(docRef, { icsToken: token });
  return token;
}

// ---------- Import ----------

export async function importDuties(
  userId: string,
  duties: Array<{
    date: string;
    dutyCode: string;
    dutyType: string;
    reportingTime: string | null;
    flightNumber: string | null;
    departureAirport: string | null;
    arrivalAirport: string | null;
    blockTime: number;
  }>
): Promise<{ created: number; updated: number; deleted: number }> {
  const batch = writeBatch(db);
  let created = 0;
  let updated = 0;

  for (const duty of duties) {
    // Check for existing duty on same date
    const dayStart = new Date(duty.date + 'T00:00:00.000Z');
    const dayEnd = new Date(duty.date + 'T23:59:59.999Z');

    const existing = await getDocs(query(
      collection(db, 'duties'),
      where('userId', '==', userId),
      where('date', '>=', Timestamp.fromDate(dayStart)),
      where('date', '<=', Timestamp.fromDate(dayEnd)),
      where('dutyCode', '==', duty.dutyCode),
      limit(1)
    ));

    if (existing.empty) {
      const ref = doc(collection(db, 'duties'));
      batch.set(ref, {
        userId,
        date: Timestamp.fromDate(new Date(duty.date + 'T00:00:00.000Z')),
        dutyCode: duty.dutyCode,
        dutyType: duty.dutyType,
        reportingTime: duty.reportingTime || null,
        departureTime: null,
        arrivalTime: null,
        dutyTime: null,
        blockTime: duty.blockTime || 0,
        flightNumber: duty.flightNumber || null,
        departureAirport: duty.departureAirport || null,
        arrivalAirport: duty.arrivalAirport || null,
        observations: null,
        isModified: false,
        modifiedAt: null,
        createdAt: new Date(),
      });
      created++;
    } else {
      const existingRef = existing.docs[0].ref;
      batch.update(existingRef, {
        dutyType: duty.dutyType,
        reportingTime: duty.reportingTime || null,
        flightNumber: duty.flightNumber || null,
        departureAirport: duty.departureAirport || null,
        arrivalAirport: duty.arrivalAirport || null,
        blockTime: duty.blockTime || 0,
        isModified: true,
        modifiedAt: new Date(),
      });
      updated++;
    }
  }

  await batch.commit();
  return { created, updated, deleted: 0 };
}
