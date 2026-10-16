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

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

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
