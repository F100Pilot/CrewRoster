import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { parseCSV } from '../services/csvParser';
import { parseICS } from '../services/icsParser';
import { getFirestore } from '../config/firebase';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();
const db = getFirestore();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.csv', '.ics'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, CSV, ICS'));
    }
  },
});

// POST /api/import/upload
router.post('/upload', authenticate, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const { month, year } = req.body;
    const ext = path.extname(req.file.originalname).toLowerCase();

    let duties: Array<{
      date: string;
      dutyCode: string;
      dutyType: string;
      reportingTime: string | null;
      departureTime: string | null;
      arrivalTime: string | null;
      flightNumber: string | null;
      departureAirport: string | null;
      arrivalAirport: string | null;
      aircraftType: string | null;
      observations: string | null;
    }> = [];

    if (ext === '.csv') {
      duties = await parseCSV(req.file.buffer.toString('utf-8'));
    } else if (ext === '.ics') {
      duties = await parseICS(req.file.buffer.toString('utf-8'));
    } else if (ext === '.pdf') {
      res.status(400).json({ error: 'PDF parsing not yet implemented. Please use CSV or ICS export from NetLine CrewLink.' });
      return;
    }

    if (duties.length === 0) {
      res.status(400).json({ error: 'No duties found in the uploaded file' });
      return;
    }

    const targetMonth = parseInt(month) || new Date(duties[0].date).getMonth() + 1;
    const targetYear = parseInt(year) || new Date(duties[0].date).getFullYear();

    // Get existing duties for this user in the target month/year to detect changes
    const monthStart = new Date(Date.UTC(targetYear, targetMonth - 1, 1));
    const monthEnd = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999));

    const existingSnap = await db.collection('duties')
      .where('userId', '==', req.userId)
      .where('date', '>=', monthStart)
      .where('date', '<=', monthEnd)
      .get();

    // Build a map of existing duties by date+dutyCode for change detection
    const existingMap = new Map<string, any>();
    existingSnap.docs.forEach((doc) => {
      const d = doc.data();
      const dDate = d.date?.toDate?.()?.toISOString().split('T')[0] || d.date;
      const key = `${dDate}_${d.dutyCode}`;
      existingMap.set(key, { id: doc.id, ref: doc.ref, duty: d });
    });

    // Store flights (upsert pattern)
    const batch = db.batch();
    const newDutyKeys = new Set<string>();

    for (const duty of duties) {
      const dutyDate = new Date(duty.date + 'T00:00:00.000Z');
      const dutyRef = db.collection('duties').doc();
      const key = `${duty.date}_${duty.dutyCode}`;
      newDutyKeys.add(key);

      const dutyData: any = {
        userId: req.userId,
        date: dutyDate,
        dutyCode: duty.dutyCode,
        dutyType: duty.dutyType,
        reportingTime: duty.reportingTime || null,
        departureTime: duty.departureTime ? new Date(duty.departureTime) : null,
        arrivalTime: duty.arrivalTime ? new Date(duty.arrivalTime) : null,
        dutyTime: null,
        blockTime: null,
        flightNumber: duty.flightNumber || null,
        departureAirport: duty.departureAirport || null,
        arrivalAirport: duty.arrivalAirport || null,
        observations: duty.observations || null,
        isModified: false,
        modifiedAt: null,
        createdAt: new Date(),
      };

      // Check if this duty already existed (for change detection)
      const existing = existingMap.get(key);
      if (existing) {
        // Update existing duty instead of creating new one
        batch.update(existing.ref, {
          ...dutyData,
          isModified: JSON.stringify({
            dc: existing.duty.dutyCode,
            rt: existing.duty.reportingTime,
            fn: existing.duty.flightNumber,
          }) !== JSON.stringify({
            dc: duty.dutyCode,
            rt: duty.reportingTime,
            fn: duty.flightNumber,
          }),
          modifiedAt: new Date(),
          createdAt: existing.duty.createdAt,
        });
      } else {
        batch.set(dutyRef, dutyData);
      }

      // Ensure flight exists
      if (duty.flightNumber) {
        const flightSnap = await db.collection('flights')
          .where('flightNumber', '==', duty.flightNumber)
          .limit(1)
          .get();

        if (flightSnap.empty) {
          const flightRef = db.collection('flights').doc();
          batch.set(flightRef, {
            flightNumber: duty.flightNumber,
            aircraftType: duty.aircraftType || null,
            departureAirport: duty.departureAirport || '',
            arrivalAirport: duty.arrivalAirport || '',
          });
        }
      }
    }

    // Mark removed duties as cancelled (delete them)
    for (const [key, existing] of existingMap.entries()) {
      if (!newDutyKeys.has(key)) {
        batch.delete(existing.ref);
      }
    }

    await batch.commit();

    // Create notification about import
    await db.collection('notifications').add({
      userId: req.userId,
      type: 'import',
      title: 'Roster Imported',
      message: `Your roster for ${targetMonth}/${targetYear} has been imported with ${duties.length} duties.`,
      isRead: false,
      createdAt: new Date(),
    });

    res.json({
      message: `Successfully imported ${duties.length} duties for ${targetMonth}/${targetYear}`,
      dutiesCount: duties.length,
      month: targetMonth,
      year: targetYear,
    });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Failed to import file' });
  }
});

export default router;
