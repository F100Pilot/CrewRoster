import { Router, Response } from 'express';
import { getFirestore } from '../config/firebase';
import { AuthRequest, authenticate } from '../middleware/auth';
import ical, { ICalCalendarMethod } from 'ical-generator';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const db = getFirestore();

// GET /api/calendar/ics-feed/:token - Public ICS feed
router.get('/ics-feed/:token', async (req, res: Response) => {
  try {
    const { token } = req.params;

    const exportSnap = await db.collection('calendarExports')
      .where('icsToken', '==', token)
      .limit(1)
      .get();

    if (exportSnap.empty) {
      res.status(404).json({ error: 'Invalid calendar feed URL' });
      return;
    }

    const exportDoc = exportSnap.docs[0];
    const userId = exportDoc.data().userId;

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = userDoc.data()!;

    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const sixMonthsAhead = new Date(now.getFullYear(), now.getMonth() + 6, 0, 23, 59, 59, 999);

    const dutiesSnap = await db.collection('duties')
      .where('userId', '==', userId)
      .where('date', '>=', threeMonthsAgo)
      .where('date', '<=', sixMonthsAhead)
      .orderBy('date', 'asc')
      .orderBy('reportingTime', 'asc')
      .get();

    const cal = ical({
      name: `CrewRoster - ${user.fullName}`,
      description: `Roster for ${user.fullName} (${user.crewCode})`,
      method: ICalCalendarMethod.PUBLISH,
      prodId: { company: 'CrewRoster', product: 'ICS Feed', language: 'EN' },
      timezone: 'Europe/Lisbon',
    });

    for (const doc of dutiesSnap.docs) {
      const d = doc.data();
      const date = d.date?.toDate?.();
      const dateStr = date?.toISOString().split('T')[0] || '';

      if (d.departureTime && d.arrivalTime) {
        const start = d.departureTime.toDate?.() || new Date(d.departureTime);
        const end = d.arrivalTime.toDate?.() || new Date(d.arrivalTime);
        cal.createEvent({
          id: doc.id,
          start,
          end,
          summary: d.flightNumber
            ? `${d.dutyCode} ${d.flightNumber} ${d.departureAirport || ''}-${d.arrivalAirport || ''}`
            : `${d.dutyCode} - ${d.dutyType}`,
          description: d.observations || '',
          location: d.flightNumber ? `${d.departureAirport || ''} → ${d.arrivalAirport || ''}` : '',
          url: process.env.APP_URL || 'https://crewroster.com',
        });
      } else if (d.reportingTime && date) {
        const [hours, minutes] = (d.reportingTime as string).split(':').map(Number);
        const start = new Date(date);
        start.setHours(hours || 0, minutes || 0, 0, 0);
        const end = new Date(start.getTime() + 8 * 60 * 60 * 1000);
        cal.createEvent({
          id: doc.id,
          start,
          end,
          summary: d.flightNumber
            ? `${d.dutyCode} ${d.flightNumber} ${d.departureAirport || ''}-${d.arrivalAirport || ''}`
            : `${d.dutyCode} - ${d.dutyType}`,
          description: d.observations || '',
          url: process.env.APP_URL || 'https://crewroster.com',
        });
      } else if (dateStr) {
        cal.createEvent({
          id: doc.id,
          start: new Date(dateStr + 'T00:00:00'),
          allDay: true,
          summary: `${d.dutyCode} - ${d.dutyType}`,
          description: d.observations || '',
          url: process.env.APP_URL || 'https://crewroster.com',
        });
      }
    }

    await exportDoc.ref.update({ lastExportedAt: new Date() });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="crewroster-${user.crewCode}.ics"`);
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.send(cal.toString());
  } catch (err) {
    console.error('ICS feed error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/calendar/export - Get or create ICS token
router.get('/export', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const snap = await db.collection('calendarExports')
      .where('userId', '==', req.userId)
      .where('exportType', '==', 'ics_feed')
      .limit(1)
      .get();

    let token: string;
    if (!snap.empty) {
      token = snap.docs[0].data().icsToken;
    } else {
      token = uuidv4();
      await db.collection('calendarExports').add({
        userId: req.userId,
        exportType: 'ics_feed',
        icsToken: token,
        lastExportedAt: new Date(),
        createdAt: new Date(),
      });
    }

    const baseUrl = process.env.APP_URL || 'http://localhost:5001';
    const webcalBaseUrl = baseUrl.replace(/^https?:\/\//, 'webcal://');

    res.json({
      icsToken: token,
      icsUrl: `${baseUrl}/api/calendar/ics-feed/${token}`,
      webcalUrl: `${webcalBaseUrl}/api/calendar/ics-feed/${token}`,
      googleCalendarUrl: `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(`${baseUrl}/api/calendar/ics-feed/${token}`)}`,
    });
  } catch (err) {
    console.error('Calendar export error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/calendar/google-export
router.get('/google-export', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const dutiesSnap = await db.collection('duties')
      .where('userId', '==', req.userId)
      .orderBy('date', 'asc')
      .limit(1)
      .get();

    if (dutiesSnap.empty) {
      res.json({ googleCalendarUrl: null });
      return;
    }

    const d = dutiesSnap.docs[0].data();
    const dateStr = d.date?.toDate?.()?.toISOString().split('T')[0] || '';
    const title = d.flightNumber
      ? `${d.dutyCode} ${d.flightNumber} ${d.departureAirport || ''}-${d.arrivalAirport || ''}`
      : `${d.dutyCode} - ${d.dutyType}`;

    const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${dateStr.replace(/-/g, '')}/${dateStr.replace(/-/g, '')}`;

    res.json({
      googleCalendarUrl: googleUrl,
      message: 'For full roster sync, use the ICS feed subscription instead.',
    });
  } catch (err) {
    console.error('Google export error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
