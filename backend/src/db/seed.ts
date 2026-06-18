import 'dotenv/config';
import { getFirestore } from '../config/firebase';
import bcrypt from 'bcrypt';

async function seed() {
  const db = getFirestore();

  // Create demo user
  const passwordHash = await bcrypt.hash('demo123', 12);

  const usersSnap = await db.collection('users')
    .where('crewCode', '==', 'PT12345')
    .limit(1)
    .get();

  let userId: string;

  if (!usersSnap.empty) {
    const doc = usersSnap.docs[0];
    userId = doc.id;
    await doc.ref.update({
      passwordHash,
      fullName: 'João Silva',
      base: 'LIS',
      role: 'First Officer',
      email: 'joao.silva@portugalia.pt',
      medicalValidity: new Date('2025-06-30'),
      lpcValidity: new Date('2025-03-15'),
      updatedAt: new Date(),
    });
    console.log('Updated existing demo user');
  } else {
    const docRef = db.collection('users').doc();
    userId = docRef.id;
    await docRef.set({
      crewCode: 'PT12345',
      passwordHash,
      fullName: 'João Silva',
      base: 'LIS',
      role: 'First Officer',
      email: 'joao.silva@portugalia.pt',
      medicalValidity: new Date('2025-06-30'),
      lpcValidity: new Date('2025-03-15'),
      refreshToken: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('Created demo user');
  }

  // Create flights
  const flights = [
    { fn: 'TP1920', ac: 'E190', dep: 'LIS', arr: 'OPO' },
    { fn: 'TP1921', ac: 'E190', dep: 'OPO', arr: 'LIS' },
    { fn: 'TP1456', ac: 'E195', dep: 'LIS', arr: 'MAD' },
    { fn: 'TP1457', ac: 'E195', dep: 'MAD', arr: 'LIS' },
    { fn: 'TP0890', ac: 'E190', dep: 'LIS', arr: 'BCN' },
  ];

  for (const f of flights) {
    const snap = await db.collection('flights')
      .where('flightNumber', '==', f.fn)
      .limit(1)
      .get();

    if (snap.empty) {
      await db.collection('flights').add({
        flightNumber: f.fn,
        aircraftType: f.ac,
        departureAirport: f.dep,
        arrivalAirport: f.arr,
      });
    }
  }

  // Create duties for June 2026
  const duties = [
    { date: '2026-06-15', code: 'FLT', type: 'Flight Duty', report: '06:00', flight: 'TP1920', dep: 'LIS', arr: 'OPO' },
    { date: '2026-06-16', code: 'FLT', type: 'Flight Duty', report: '08:30', flight: 'TP1456', dep: 'LIS', arr: 'MAD' },
    { date: '2026-06-16', code: 'FLT', type: 'Flight Duty', report: '14:00', flight: 'TP1457', dep: 'MAD', arr: 'LIS' },
    { date: '2026-06-17', code: 'SBY', type: 'Standby Airport', report: '10:00', flight: null, dep: null, arr: null },
    { date: '2026-06-18', code: 'FLT', type: 'Flight Duty', report: '07:15', flight: 'TP0890', dep: 'LIS', arr: 'BCN' },
    { date: '2026-06-19', code: 'OFF', type: 'Day Off', report: null, flight: null, dep: null, arr: null },
    { date: '2026-06-20', code: 'OFF', type: 'Day Off', report: null, flight: null, dep: null, arr: null },
    { date: '2026-06-21', code: 'RES', type: 'Reserve', report: '12:00', flight: null, dep: null, arr: null },
    { date: '2026-06-22', code: 'FLT', type: 'Flight Duty', report: '06:45', flight: 'TP1921', dep: 'OPO', arr: 'LIS' },
    { date: '2026-06-25', code: 'VAC', type: 'Vacation', report: null, flight: null, dep: null, arr: null },
    { date: '2026-06-26', code: 'VAC', type: 'Vacation', report: null, flight: null, dep: null, arr: null },
    { date: '2026-06-27', code: 'VAC', type: 'Vacation', report: null, flight: null, dep: null, arr: null },
  ];

  // Delete existing duties for June 2026
  const monthStart = new Date('2026-06-01T00:00:00.000Z');
  const monthEnd = new Date('2026-06-30T23:59:59.999Z');
  const existingSnap = await db.collection('duties')
    .where('userId', '==', userId)
    .where('date', '>=', monthStart)
    .where('date', '<=', monthEnd)
    .get();

  const batch = db.batch();
  existingSnap.docs.forEach((doc) => batch.delete(doc.ref));

  for (const d of duties) {
    const dutyRef = db.collection('duties').doc();
    let departureTime = null;
    let arrivalTime = null;
    let blockTime = 0;

    if (d.report && d.flight) {
      const [h, m] = d.report.split(':').map(Number);
      const dateBase = new Date(d.date + 'T00:00:00.000Z');
      departureTime = new Date(dateBase.getTime() + (h + 1) * 3600000 + m * 60000);
      arrivalTime = new Date(dateBase.getTime() + (h + 3) * 3600000 + m * 60000);
      blockTime = 2; // hours
    }

    batch.set(dutyRef, {
      userId,
      date: new Date(d.date + 'T00:00:00.000Z'),
      dutyCode: d.code,
      dutyType: d.type,
      reportingTime: d.report || null,
      departureTime,
      arrivalTime,
      dutyTime: null,
      blockTime,
      flightNumber: d.flight || null,
      departureAirport: d.dep || null,
      arrivalAirport: d.arr || null,
      observations: null,
      isModified: false,
      modifiedAt: null,
      createdAt: new Date(),
    });
  }

  await batch.commit();

  console.log('Seed data created successfully!');
  console.log('Login with: CREW CODE: PT12345, Password: demo123');
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
