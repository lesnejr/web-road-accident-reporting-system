import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import reportRoutes from './routes/reports.js';
import trafficOfficerRoutes from './routes/trafficOfficer.js';
import adminRoutes from './routes/admin.js';
import categoryRoutes from './routes/categories.js';
import notificationRoutes from './routes/notifications.js';
import summaryRoutes from './routes/summaries.js';
import { errorHandler } from './middleware/errorHandler.js';
import { securityHeaders, rateLimit } from './middleware/security.js';

dotenv.config();

const app = express();

// Browser origins allowed to call the API directly. The Vite dev server proxies
// /api, so this mainly matters when the client runs on another host.
// Override with CORS_ORIGINS (comma separated) or CORS_ORIGINS=* to allow any.
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins.includes('*') ? true : allowedOrigins }));
app.use(securityHeaders);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Credential endpoints are rate limited per IP so passwords cannot be guessed at speed.
// ponytail: fixed window in memory, resets on restart; enough for one process
app.use('/api/auth/login', rateLimit({ max: 20, windowMs: 15 * 60 * 1000, message: 'Too many login attempts. Try again in a few minutes.' }));
app.use('/api/auth/register', rateLimit({ max: 10, windowMs: 60 * 60 * 1000, message: 'Too many registration attempts. Try again later.' }));

app.use('/api/auth', authRoutes);
// summaryRoutes MUST be before /api/reports to avoid :id catching /summaries
app.use('/api/summaries', summaryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/traffic-officer', trafficOfficerRoutes);
app.use('/api/accident-categories', categoryRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', adminRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
