import { Router, Response } from 'express';
import { getFirestore } from '../config/firebase';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();
const db = getFirestore();

// GET /api/profile
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const doc = await db.collection('users').doc(req.userId!).get();

    if (!doc.exists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const u = doc.data()!;
    res.json({
      id: doc.id,
      employeeNumber: u.employeeNumber,
      fullName: u.fullName,
      base: u.base,
      role: u.role,
      email: u.email || null,
      phone: u.phone || null,
      medicalValidity: u.medicalValidity?.toDate?.()?.toISOString() || null,
      lpcValidity: u.lpcValidity?.toDate?.()?.toISOString() || null,
      createdAt: u.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: u.updatedAt?.toDate?.()?.toISOString() || null,
    });
  } catch (err) {
    console.error('Profile get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/profile
router.put('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { email, phone } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;

    await db.collection('users').doc(req.userId!).update(updates);

    res.json({ message: 'Profile updated' });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
