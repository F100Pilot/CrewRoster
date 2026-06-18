import { Router, Response } from 'express';
import { getFirestore } from '../config/firebase';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();
const db = getFirestore();

// GET /api/notifications
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { unread } = req.query;

    let query;

    if (unread === 'true') {
      query = db.collection('notifications')
        .where('userId', '==', req.userId)
        .where('isRead', '==', false)
        .orderBy('createdAt', 'desc')
        .limit(50);
    } else {
      query = db.collection('notifications')
        .where('userId', '==', req.userId)
        .orderBy('createdAt', 'desc')
        .limit(50);
    }

    const snapshot = await query.get();

    const notifications = snapshot.docs.map((doc) => {
      const n = doc.data();
      return {
        id: doc.id,
        type: n.type,
        title: n.title,
        message: n.message,
        isRead: n.isRead || false,
        dutyDate: n.dutyDate || null,
        createdAt: n.createdAt?.toDate?.()?.toISOString() || null,
      };
    });

    res.json({ notifications });
  } catch (err) {
    console.error('Notifications get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const doc = await db.collection('notifications').doc(req.params.id).get();
    if (!doc.exists || doc.data()!.userId !== req.userId) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    await doc.ref.update({ isRead: true });
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Notification read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/notifications/read-all
router.put('/read-all', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const snapshot = await db.collection('notifications')
      .where('userId', '==', req.userId)
      .where('isRead', '==', false)
      .get();

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { isRead: true });
    });
    await batch.commit();

    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Notifications read-all error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
