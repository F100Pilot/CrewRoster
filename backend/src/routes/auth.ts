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

function validateCredentials(crewCode: string, password: string): string | null {
  if (!crewCode || typeof crewCode !== 'string') return 'CREW CODE is required.';
  if (crewCode.trim().length < 3) return 'CREW CODE must be at least 3 characters.';
  if (crewCode.length > 20) return 'CREW CODE must be 20 characters or fewer.';
  if (!/^[A-Za-z0-9 .-]+$/.test(crewCode)) return 'CREW CODE must contain only letters, numbers, spaces, dots, and hyphens.';
  if (!password || typeof password !== 'string') return 'Password is required.';
  if (password.length < 4) return 'Password must be at least 4 characters.';
  return null;
}

function generateTokens(userId: string, crewCode: string) {
  const accessToken = jwt.sign({ userId, crewCode }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
  const refreshToken = jwt.sign({ userId, crewCode }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRY });
  return { accessToken, refreshToken };
}

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { crewCode, password, fullName, base, role, email, registrationSecret } = req.body;

    // Require a setup secret to prevent public registration
    const requiredSecret = process.env.REGISTRATION_SECRET;
    if (!requiredSecret) {
      res.status(500).json({ error: 'Registration is not configured. Set REGISTRATION_SECRET env var.' });
      return;
    }
    if (registrationSecret !== requiredSecret) {
      res.status(403).json({ error: 'Invalid registration secret.' });
      return;
    }

    const validationError = validateCredentials(crewCode, password);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      res.status(400).json({ error: 'Full name is required.' });
      return;
    }
    if (fullName.trim().length > 100) {
      res.status(400).json({ error: 'Full name is too long (max 100 characters).' });
      return;
    }
    if (base && base.length > 10) {
      res.status(400).json({ error: 'Base code is too long (max 10 characters).' });
      return;
    }
    if (role && role.length > 50) {
      res.status(400).json({ error: 'Role is too long (max 50 characters).' });
      return;
    }
    if (email && (typeof email !== 'string' || email.length > 100 || !email.includes('@'))) {
      res.status(400).json({ error: 'Invalid email address.' });
      return;
    }

    // Check if crewCode already exists
    const existing = await db.collection('users')
      .where('crewCode', '==', crewCode)
      .limit(1)
      .get();

    if (!existing.empty) {
      res.status(409).json({ error: 'A user with this CREW CODE already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const docRef = db.collection('users').doc();

    await docRef.set({
      crewCode,
      passwordHash,
      fullName: fullName.trim(),
      base: base || null,
      role: role || null,
      email: email || null,
      phone: null,
      medicalValidity: null,
      lpcValidity: null,
      refreshToken: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.status(201).json({
      message: 'User registered successfully. You can now log in.',
      user: { id: docRef.id, crewCode, fullName, base, role },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { crewCode, password } = req.body;

    const validationError = validateCredentials(crewCode, password);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const snapshot = await db.collection('users')
      .where('crewCode', '==', crewCode)
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

    const { accessToken, refreshToken } = generateTokens(user.id, user.crewCode);

    await doc.ref.update({ refreshToken });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        crewCode: user.crewCode,
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

    let decoded: { userId: string; crewCode: string };
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { userId: string; crewCode: string };
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

    const tokens = generateTokens(decoded.userId, decoded.crewCode);
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
      crewCode: user.crewCode,
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
