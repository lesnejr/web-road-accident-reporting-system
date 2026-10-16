import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Report } from '../models/Report.js';
import { Evidence } from '../models/Evidence.js';
import { StatusHistory } from '../models/StatusHistory.js';
import { Notification } from '../models/Notification.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../utils/helpers.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/', limits: { fileSize: 10 * 1024 * 1024 } });

router.use(requireAuth);

router.post('/', requireRole('reporter', 'admin'), async (req, res, next) => {
  try {
    const report = await Report.create(req.body, req.user.id);
    await logAudit(req.user.id, 'CREATE_REPORT', 'report', report.id, req, { report_reference: report.report_reference });
    await Notification.create({
      userId: req.user.id,
      reportId: report.id,
      event: 'report.submitted',
      message: `Your report ${report.report_reference} has been submitted.`
    });
    res.status(201).json(report);
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status || null;
    const reports = await Report.list(req.user, status);
    res.json(reports);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
    if (req.user.role === 'reporter' && report.reporter_id !== req.user.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    if (req.user.role === 'traffic_officer' && report.assigned_to !== req.user.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    const evidence = await Evidence.findByReport(report.id);
    const history = await StatusHistory.findByReport(report.id);
    res.json({ ...report, evidence, status_history: history });
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole('reporter'), async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
    if (report.reporter_id !== req.user.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not your report' } });
    if (!['submitted','needs_clarification'].includes(report.status)) return res.status(422).json({ error: { code: 'INVALID_STATUS', message: 'Cannot edit in current status' } });
    const updated = await Report.update(report.id, req.body, req.user);
    await logAudit(req.user.id, 'UPDATE_REPORT', 'report', report.id, req, req.body);
    await Notification.create({
      userId: report.reporter_id,
      reportId: report.id,
      event: 'report.updated',
      message: `Your report ${report.report_reference} was updated.`
    });
    // Supplying the requested information itself moves the report back to Under Review.
    if (report.status === 'needs_clarification') {
      const backUnderReview = await Report.updateStatus(report.id, 'under_review', req.user.id, {
        notes: 'Reporter provided the requested information'
      });
      return res.json(backUnderReview);
    }
    res.json(updated);
  } catch (err) { next(err); }
});

router.get('/:id/evidence/:evidenceId', async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
    if (req.user.role === 'reporter' && report.reporter_id !== req.user.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    if (req.user.role === 'traffic_officer' && report.assigned_to !== req.user.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    const evidence = await Evidence.findById(req.params.evidenceId);
    if (!evidence || evidence.report_id !== report.id) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Evidence not found' } });
    }
    // Files live on disk outside the web root and are only streamed after this authorization check.
    const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
    const filePath = path.resolve(process.cwd(), evidence.file_path);
    if (!filePath.startsWith(uploadRoot)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Evidence file is missing from storage' } });
    res.setHeader('Content-Type', evidence.mime_type || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${String(evidence.file_name).replace(/["\r\n]/g, '')}"`);
    fs.createReadStream(filePath).on('error', next).pipe(res);
  } catch (err) { next(err); }
});

router.post('/:id/evidence', requireRole('reporter', 'admin', 'traffic_officer'), upload.single('file'), async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
    if (req.user.role === 'reporter' && report.reporter_id !== req.user.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    if (req.user.role === 'traffic_officer' && report.assigned_to !== req.user.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    if (!req.file) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' } });
    const evidence = await Evidence.create({
      reportId: report.id,
      uploaderId: req.user.id,
      fileName: req.file.originalname,
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      description: req.body.description
    });
    await logAudit(req.user.id, 'UPLOAD_EVIDENCE', 'evidence', evidence.id, req, { report_id: report.id });
    // Notify reporter if uploader is not reporter
    if (req.user.id !== report.reporter_id) {
      await Notification.create({
        userId: report.reporter_id,
        reportId: report.id,
        event: 'evidence.added',
        message: `New evidence added to your report ${report.report_reference}.`
      });
    }
    // Notify assigned officer if uploader is not officer
    if (report.assigned_to && req.user.id !== report.assigned_to) {
      await Notification.create({
        userId: report.assigned_to,
        reportId: report.id,
        event: 'evidence.added',
        message: `New evidence added to assigned report ${report.report_reference}.`
      });
    }
    res.status(201).json(evidence);
  } catch (err) { next(err); }
});

router.get('/:id/status-history', async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
    if (req.user.role === 'reporter' && report.reporter_id !== req.user.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    const history = await StatusHistory.findByReport(report.id);
    res.json(history);
  } catch (err) { next(err); }
});

export default router;
