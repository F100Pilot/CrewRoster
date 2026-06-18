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

app.use(cors({
  origin: true,
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

// Export as Cloud Function
export const api = functions.https.onRequest(app);
