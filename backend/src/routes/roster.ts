import { Router, Response } from 'express';
import { getFirestore } from '../config/firebase';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();
const db = getFirestore();

async function fetchFlight(flightNumber: string): Promise<any> {
  const flightSnap = await db.collection('flights')
    .where('flightNumber', '==', flightNumber)
    .limit(1)
    .get();
  if (!flightSnap.empty) {
    const f = flightSnap.docs[0].data();
    return {
      flightNumber: f.flightNumber,
      aircraftType: f.aircraftType || null,
      departureAirport: f.departureAirport,
      arrivalAirport: f.arrivalAirport,
      std: f.std?.toDate?.()?.toISOString() || null,
      sta: f.sta?.toDate?.()?.toISOString() || null,
    };
  }
  return null;
}

function mapDuty(doc: any, flight: any) {
  const duty = doc.data()!;
  return {
    id: doc.id,
    dutyCode: duty.dutyCode,
    dutyType: duty.dutyType,
    date: duty.date?.toDate?.()?.toISOString() || duty.date,
    reportingTime: duty.reportingTime || null,
    departureTime: duty.departureTime?.toDate?.()?.toISOString() || duty.departureTime || null,
    arrivalTime: duty.arrivalTime?.toDate?.()?.toISOString() || duty.arrivalTime || null,
    dutyTime: duty.dutyTime || null,
    blockTime: duty.blockTime || null,
    observations: duty.observations || null,
    isModified: duty.isModified || false,
    modifiedAt: duty.modifiedAt?.toDate?.()?.toISOString() || null,
    flight,
  };
}

// GET /api/roster/:year/:month
router.get('/:year/:month', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { year, month } = req.params;
    const y = parseInt(year);
    const m = parseInt(month);

    const monthStart = new Date(Date.UTC(y, m - 1, 1));
    const monthEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

    const snapshot = await db.collection('duties')
      .where('userId', '==', req.userId)
      .where('date', '>=', monthStart)
      .where('date', '<=', monthEnd)
      .orderBy('date', 'asc')
      .orderBy('reportingTime', 'asc')
      .get();

    const days: Record<string, any[]> = {};
    for (const doc of snapshot.docs) {
      const duty = doc.data();
      const dateKey = duty.date?.toDate?.()?.toISOString().split('T')[0] || duty.date;
      const flight = duty.flightNumber ? await fetchFlight(duty.flightNumber) : null;

      if (!days[dateKey]) days[dateKey] = [];
      days[dateKey].push(mapDuty(doc, flight));
    }

    res.json({ days });
  } catch (err) {
    console.error('Roster monthly error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/roster/daily/:date
router.get('/daily/:date', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.params;
    const dayStart = new Date(date + 'T00:00:00.000Z');
    const dayEnd = new Date(date + 'T23:59:59.999Z');

    const snapshot = await db.collection('duties')
      .where('userId', '==', req.userId)
      .where('date', '>=', dayStart)
      .where('date', '<=', dayEnd)
      .orderBy('date', 'asc')
      .orderBy('reportingTime', 'asc')
      .get();

    const duties = [];
    for (const doc of snapshot.docs) {
      const duty = doc.data();
      const flight = duty.flightNumber ? await fetchFlight(duty.flightNumber) : null;
      duties.push(mapDuty(doc, flight));
    }

    res.json({ duties });
  } catch (err) {
    console.error('Roster daily error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/roster/next
router.get('/next', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const snapshot = await db.collection('duties')
      .where('userId', '==', req.userId)
      .where('date', '>=', today)
      .orderBy('date', 'asc')
      .orderBy('reportingTime', 'asc')
      .limit(30)
      .get();

    const currentTime = now.toTimeString().substring(0, 5);
    let nextDutyDoc: any = null;
    let nextDutyId: string | null = null;

    for (const doc of snapshot.docs) {
      const duty = doc.data();
      const dutyDate = duty.date?.toDate?.();
      const dutyDateStr = dutyDate?.toISOString().split('T')[0];

      if (dutyDateStr > today.toISOString().split('T')[0]) {
        nextDutyDoc = duty;
        nextDutyId = doc.id;
        break;
      }
      if (dutyDateStr === today.toISOString().split('T')[0] && duty.reportingTime && duty.reportingTime >= currentTime) {
        nextDutyDoc = duty;
        nextDutyId = doc.id;
        break;
      }
    }

    if (!nextDutyDoc) {
      res.json({ duty: null });
      return;
    }

    const flight = nextDutyDoc.flightNumber ? await fetchFlight(nextDutyDoc.flightNumber) : null;

    res.json({
      duty: {
        id: nextDutyId,
        date: nextDutyDoc.date?.toDate?.()?.toISOString() || nextDutyDoc.date,
        dutyCode: nextDutyDoc.dutyCode,
        dutyType: nextDutyDoc.dutyType,
        reportingTime: nextDutyDoc.reportingTime || null,
        departureTime: nextDutyDoc.departureTime?.toDate?.()?.toISOString() || nextDutyDoc.departureTime || null,
        arrivalTime: nextDutyDoc.arrivalTime?.toDate?.()?.toISOString() || nextDutyDoc.arrivalTime || null,
        dutyTime: nextDutyDoc.dutyTime || null,
        blockTime: nextDutyDoc.blockTime || null,
        observations: nextDutyDoc.observations || null,
        flight,
      },
    });
  } catch (err) {
    console.error('Next duty error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/roster/stats
router.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    const snapshot = await db.collection('duties')
      .where('userId', '==', req.userId)
      .where('date', '>=', monthStart)
      .where('date', '<=', monthEnd)
      .get();

    let totalBlock = 0;
    let sectorCount = 0;
    let offCount = 0;

    snapshot.forEach((doc) => {
      const d = doc.data();
      if (d.dutyType === 'Flight Duty') {
        if (d.blockTime) {
          const val = typeof d.blockTime === 'number' ? d.blockTime : parseInt(d.blockTime) || 0;
          totalBlock += val;
        }
        if (d.flightNumber) sectorCount++;
      }
      if (d.dutyCode === 'OFF') offCount++;
    });

    res.json({
      blockHours: Math.round(totalBlock * 100) / 100,
      sectorCount,
      offDaysRemaining: offCount,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/roster/changes
router.get('/changes', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const snapshot = await db.collection('duties')
      .where('userId', '==', req.userId)
      .where('isModified', '==', true)
      .orderBy('modifiedAt', 'desc')
      .limit(20)
      .get();

    const changes = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        date: d.date?.toDate?.()?.toISOString() || d.date,
        dutyCode: d.dutyCode,
        dutyType: d.dutyType,
        reportingTime: d.reportingTime || null,
        observations: d.observations || null,
        modifiedAt: d.modifiedAt?.toDate?.()?.toISOString() || null,
      };
    });

    res.json({ changes });
  } catch (err) {
    console.error('Changes error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
