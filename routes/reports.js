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
import { detectFileType, sanitizeFileName } from '../utils/fileType.js';

const router = express.Router();
const UPLOAD_ROOT = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const upload = multer({ dest: UPLOAD_ROOT, limits: { fileSize: MAX_EVIDENCE_BYTES } });

router.use(requireAuth);

const STATUSES = ['submitted', 'under_review', 'needs_clarification', 'verified', 'assigned', 'in_progress', 'resolved', 'rejected'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SORTABLE = ['created_at', 'accident_date', 'status', 'report_reference'];

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
    const { status, category_id, date_from, date_to, q, sort, direction, page, limit } = req.query;
    if (status && !STATUSES.includes(String(status))) {
      return res.status(422).json({ error: { code: 'INVALID_FILTER', message: 'Unknown status filter' } });
    }
    if ((date_from && !DATE_RE.test(String(date_from))) || (date_to && !DATE_RE.test(String(date_to)))) {
      return res.status(422).json({ error: { code: 'INVALID_FILTER', message: 'Dates must be written as YYYY-MM-DD' } });
    }
    const categoryId = category_id ? Number(category_id) : null;
    if (category_id && !Number.isInteger(categoryId)) {
      return res.status(422).json({ error: { code: 'INVALID_FILTER', message: 'category_id must be a number' } });
    }
    const sortKey = sort ? String(sort) : 'created_at';
    if (sort && !SORTABLE.includes(sortKey)) {
      return res.status(422).json({ error: { code: 'INVALID_FILTER', message: `sort must be one of: ${SORTABLE.join(', ')}` } });
    }
    const sortDirection = direction ? String(direction).toLowerCase() : 'desc';
    if (direction && !['asc', 'desc'].includes(sortDirection)) {
      return res.status(422).json({ error: { code: 'INVALID_FILTER', message: 'direction must be asc or desc' } });
    }
    // Pagination only applies when page or limit is supplied; callers that do not
    // ask for it keep receiving the plain array they always have.
    let pageNumber = null;
    let pageLimit = null;
    if (page !== undefined || limit !== undefined) {
      pageNumber = page === undefined ? 1 : Number(page);
      pageLimit = limit === undefined ? 10 : Number(limit);
      if (!Number.isInteger(pageNumber) || pageNumber < 1) {
        return res.status(422).json({ error: { code: 'INVALID_FILTER', message: 'page must be a positive integer' } });
      }
      if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 100) {
        return res.status(422).json({ error: { code: 'INVALID_FILTER', message: 'limit must be an integer between 1 and 100' } });
      }
    }
    const filters = {
      status: status || null,
      categoryId,
      dateFrom: date_from || null,
      dateTo: date_to || null,
      search: q ? String(q).trim().slice(0, 100) || null : null,
      sort: sortKey,
      direction: sortDirection
    };
    if (pageNumber !== null) {
      const result = await Report.listPage(req.user, { ...filters, page: pageNumber, limit: pageLimit });
      return res.json(result);
    }
    const reports = await Report.list(req.user, filters);
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
    const filePath = path.resolve(process.cwd(), evidence.file_path);
    if (!filePath.startsWith(UPLOAD_ROOT)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Evidence file is missing from storage' } });
    // Only files stored as images are shown inline. Anything else downloads as an
    // attachment with a generic type, and the sandbox policy stops any script
    // inside a stored file from running with this site's origin.
    const isImage = /^image\//.test(String(evidence.mime_type));
    res.setHeader('Content-Type', isImage ? evidence.mime_type : 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', `${isImage ? 'inline' : 'attachment'}; filename="${sanitizeFileName(evidence.file_name)}"`);
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
    // The bytes decide the type; the browser-declared MIME type and filename are ignored.
    const mimeType = await detectFileType(req.file.path);
    if (!mimeType) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(422).json({ error: { code: 'UNSUPPORTED_FILE', message: 'Unsupported file type. Allowed: JPEG, PNG, GIF, WebP and PDF.' } });
    }
    const evidence = await Evidence.create({
      reportId: report.id,
      uploaderId: req.user.id,
      fileName: sanitizeFileName(req.file.originalname),
      filePath: req.file.path,
      mimeType,
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
    // Same visibility rules as GET /:id: reporters see their own reports, officers
    // only the reports assigned to them.
    if (req.user.role === 'reporter' && report.reporter_id !== req.user.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    if (req.user.role === 'traffic_officer' && report.assigned_to !== req.user.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    const history = await StatusHistory.findByReport(report.id);
    res.json(history);
  } catch (err) { next(err); }
});

export default router;
