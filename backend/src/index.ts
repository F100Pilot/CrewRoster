import 'dotenv/config';
import * as functions from 'firebase-functions';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import rosterRoutes from './routes/roster';
import profileRoutes from './routes/profile';
import notificationsRoutes from './routes/notifications';
import calendarRoutes from './routes/calendar';
import importRoutes from './routes/import';
import { errorHandler } from './middleware/errorHandler';

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL || '',
  'https://crewroster-app.web.app',
  'https://crewroster-app.firebaseapp.com',
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, mobile, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      callback(null, true); // Allow all origins for now, tighten later
    }
  },
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/roster', rosterRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/import', importRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

// Run as standalone server on non-Firebase environments (e.g. Render)
if (process.env.FUNCTIONS_CONTROL_API === undefined) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`CrewRoster API running on port ${PORT}`);
  });
}

// Export as Cloud Function (used when deployed to Firebase)
export const api = functions.https.onRequest(app);
