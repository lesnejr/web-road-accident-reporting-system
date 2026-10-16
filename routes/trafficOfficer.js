import express from 'express';
import { Report } from '../models/Report.js';
import { Notification } from '../models/Notification.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit, transitionError } from '../utils/helpers.js';

const router = express.Router();
router.use(requireAuth, requireRole('traffic_officer', 'admin'));

const STATUSES = ['submitted', 'under_review', 'needs_clarification', 'verified', 'assigned', 'in_progress', 'resolved', 'rejected'];

const statusLabels = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  needs_clarification: 'Additional Information Required',
  verified: 'Verified',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  rejected: 'Rejected'
};

async function notifyStatusChange(report, oldStatus, newStatus, actorId, notes) {
  const actor = actorId === report.reporter_id ? 'You' : 'Officer';
  const message = `${actor} changed status of ${report.report_reference} from ${statusLabels[oldStatus] || oldStatus} to ${statusLabels[newStatus] || newStatus}.${notes ? ` Notes: ${notes}` : ''}`;
  await Notification.create({ userId: report.reporter_id, reportId: report.id, event: `report.${newStatus}`, message });
  if (report.assigned_to && report.assigned_to !== actorId && report.assigned_to !== report.reporter_id) {
    await Notification.create({ userId: report.assigned_to, reportId: report.id, event: `report.${newStatus}`, message });
  }
  if (actorId !== report.reporter_id) {
    await Notification.create({ userId: report.reporter_id, reportId: report.id, event: `report.${newStatus}`, message });
  }
}

router.get('/reports', async (req, res, next) => {
  try {
    const reports = await Report.list(req.user);
    const assigned = reports.filter(r => r.assigned_to === req.user.id);
    res.json(assigned);
  } catch (err) { next(err); }
});

router.get('/reports/assigned', async (req, res, next) => {
  try {
    const reports = await Report.list(req.user);
    const assigned = reports.filter(r => r.assigned_to === req.user.id);
    res.json(assigned);
  } catch (err) { next(err); }
});

router.patch('/reports/:id/status', async (req, res, next) => {
  try {
    const { status, reason } = req.body;
    if (!STATUSES.includes(status)) {
      return res.status(422).json({ error: { code: 'INVALID_STATUS', message: 'Unknown status' } });
    }
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
    if (report.assigned_to !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not assigned to you' } });
    }
    const transitionProblem = transitionError(report, status, req.user, reason);
    if (transitionProblem) {
      return res.status(409).json({ error: { code: 'INVALID_TRANSITION', message: transitionProblem } });
    }
    const oldStatus = report.status;
    const updated = await Report.updateStatus(report.id, status, req.user.id, { notes: reason });
    await logAudit(req.user.id, 'UPDATE_STATUS', 'report', report.id, req, { old_status: report.status, new_status: status, reason });
    await notifyStatusChange(report, oldStatus, status, req.user.id, reason);
    res.json(updated);
  } catch (err) { next(err); }
});

router.post('/reports/:id/findings', async (req, res, next) => {
  try {
    const { findings } = req.body;
    if (!findings) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'findings required' } });
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
    if (report.assigned_to !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not assigned to you' } });
    const updated = await Report.addFindings(report.id, findings, req.user.id);
    await logAudit(req.user.id, 'ADD_FINDINGS', 'report', report.id, req, { findings });
    // Notify reporter
    await Notification.create({
      userId: report.reporter_id,
      reportId: report.id,
      event: 'findings.added',
      message: `Officer added findings to your report ${report.report_reference}.`
    });
    res.json(updated);
  } catch (err) { next(err); }
});

export default router;
