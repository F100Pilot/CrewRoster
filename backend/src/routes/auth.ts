import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getFirestore } from '../config/firebase';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();
const db = getFirestore();
const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || '';
const JWT_EXPIRY = '1h';
const JWT_REFRESH_EXPIRY = '30d';

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  console.error('CRITICAL: JWT_SECRET and JWT_REFRESH_SECRET must be set!');
}

function validateCredentials(employeeNumber: string, password: string): string | null {
  if (!employeeNumber || typeof employeeNumber !== 'string') return 'Employee number is required.';
  if (employeeNumber.trim().length < 3) return 'Employee number must be at least 3 characters.';
  if (employeeNumber.length > 20) return 'Employee number must be 20 characters or fewer.';
  if (!/^[A-Za-z0-9]+$/.test(employeeNumber)) return 'Employee number must contain only letters and numbers.';
  if (!password || typeof password !== 'string') return 'Password is required.';
  if (password.length < 4) return 'Password must be at least 4 characters.';
  return null;
}

function generateTokens(userId: string, employeeNumber: string) {
  const accessToken = jwt.sign({ userId, employeeNumber }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
  const refreshToken = jwt.sign({ userId, employeeNumber }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRY });
  return { accessToken, refreshToken };
}

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { employeeNumber, password } = req.body;

    const validationError = validateCredentials(employeeNumber, password);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const snapshot = await db.collection('users')
      .where('employeeNumber', '==', employeeNumber)
      .limit(1)
      .get();

    if (snapshot.empty) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const doc = snapshot.docs[0];
    const user = { id: doc.id, ...doc.data() } as any;

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const { accessToken, refreshToken } = generateTokens(user.id, user.employeeNumber);

    await doc.ref.update({ refreshToken });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        employeeNumber: user.employeeNumber,
        fullName: user.fullName,
        base: user.base,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token required' });
      return;
    }

    let decoded: { userId: string; employeeNumber: string };
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { userId: string; employeeNumber: string };
    } catch {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    const doc = await db.collection('users').doc(decoded.userId).get();

    if (!doc.exists) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    const user = doc.data()!;
    if (user.refreshToken !== refreshToken) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    const tokens = generateTokens(decoded.userId, decoded.employeeNumber);
    await doc.ref.update({ refreshToken: tokens.refreshToken });

    res.json(tokens);
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await db.collection('users').doc(req.userId!).update({ refreshToken: null });
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const doc = await db.collection('users').doc(req.userId!).get();

    if (!doc.exists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = doc.data()!;
    res.json({
      id: doc.id,
      employeeNumber: user.employeeNumber,
      fullName: user.fullName,
      base: user.base,
      role: user.role,
      email: user.email || null,
      phone: user.phone || null,
      medicalValidity: user.medicalValidity?.toDate?.()?.toISOString() || null,
      lpcValidity: user.lpcValidity?.toDate?.()?.toISOString() || null,
    });
  } catch (err) {
    console.error('Auth me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
