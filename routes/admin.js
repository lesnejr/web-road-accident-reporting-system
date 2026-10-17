import express from 'express';
import validator from 'validator';
import { Report } from '../models/Report.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import { Notification } from '../models/Notification.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit, transitionError } from '../utils/helpers.js';

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/dashboard', async (req, res, next) => {
  try {
    const reports = await Report.list(req.user);
    const statusCounts = reports.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
    const recent = reports.slice(0, 10);
    const pendingAssign = reports.filter(r => r.status === 'submitted' || r.status === 'under_review').length;
    res.json({ total: reports.length, statusCounts, recent, pendingAssign });
  } catch (err) { next(err); }
});

router.get('/users', async (req, res, next) => {
  try {
    const role = req.query.role || null;
    const isActive = req.query.is_active !== undefined ? Number(req.query.is_active) : undefined;
    const users = await User.list({ role, is_active: isActive });
    res.json(users);
  } catch (err) { next(err); }
});

router.get('/audit-logs', async (req, res, next) => {
  try {
    const { page, limit, userId, action, entityType } = req.query;
    const result = await AuditLog.list({ page, limit, userId, action, entityType });
    res.json(result);
  } catch (err) { next(err); }
});

const STAFF_ROLES = ['reporter', 'traffic_officer', 'admin'];

router.post('/users', async (req, res, next) => {
  try {
    const { name, email, password, role, phone } = req.body;
    const fields = {};
    if (!name || String(name).trim().length < 2) fields.name = 'Name is required';
    if (!email || !validator.isEmail(String(email).trim())) fields.email = 'A valid email is required';
    if (!password || String(password).length < 8) fields.password = 'Password must be at least 8 characters';
    if (!STAFF_ROLES.includes(role)) fields.role = 'Role must be reporter, traffic_officer or admin';
    if (Object.keys(fields).length > 0) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Account details are invalid', fields } });
    }
    const user = await User.create({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      password: String(password),
      role,
      phone: phone ? String(phone).trim() : null
    });
    await logAudit(req.user.id, 'CREATE_USER', 'user', user.id, req, { role });
    res.status(201).json(user);
  } catch (err) { next(err); }
});

router.patch('/users/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = await User.findById(id);
    if (!target) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    const { name, phone, is_active } = req.body;
    if (is_active !== undefined && Number(is_active) === 0 && id === req.user.id) {
      return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'You cannot deactivate your own account' } });
    }
    const update = {};
    if (name !== undefined) update.name = String(name).trim();
    if (phone !== undefined) update.phone = phone;
    if (is_active !== undefined) update.is_active = Number(is_active) ? 1 : 0;
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Nothing to update' } });
    }
    // An administrator must never lock the system out of its last account.
    if (target.role === 'admin' && target.is_active === 1 && update.is_active === 0) {
      const activeAdmins = await User.countActiveAdmins();
      if (activeAdmins <= 1) {
        return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'The last active administrator cannot be deactivated' } });
      }
    }
    const user = await User.update(id, update);
    await logAudit(req.user.id, 'UPDATE_USER', 'user', id, req, update);
    res.json(user);
  } catch (err) { next(err); }
});

router.patch('/users/:id/role', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { role } = req.body;
    if (!STAFF_ROLES.includes(role)) {
      return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Role must be reporter, traffic_officer or admin' } });
    }
    const target = await User.findById(id);
    if (!target) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    if (id === req.user.id && role !== 'admin') {
      return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'You cannot change your own role' } });
    }
    if (target.role === 'admin' && target.is_active === 1 && role !== 'admin') {
      const activeAdmins = await User.countActiveAdmins();
      if (activeAdmins <= 1) {
        return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'The last active administrator cannot be demoted' } });
      }
    }
    const user = await User.update(id, { role });
    await logAudit(req.user.id, 'USER_ROLE_CHANGED', 'user', id, req, { from: target.role, to: role });
    res.json(user);
  } catch (err) { next(err); }
});

async function notifyStatusChange(report, oldStatus, newStatus, actorId, notes) {
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
  const actor = actorId === report.reporter_id ? 'You' : 'Admin';
  const message = `${actor} changed status of ${report.report_reference} from ${statusLabels[oldStatus] || oldStatus} to ${statusLabels[newStatus] || newStatus}.${notes ? ` Notes: ${notes}` : ''}`;
  await Notification.create({ userId: report.reporter_id, reportId: report.id, event: `report.${newStatus}`, message });
  if (report.assigned_to && report.assigned_to !== actorId && report.assigned_to !== report.reporter_id) {
    await Notification.create({ userId: report.assigned_to, reportId: report.id, event: `report.${newStatus}`, message });
  }
}

const STATUSES = ['submitted', 'under_review', 'needs_clarification', 'verified', 'assigned', 'in_progress', 'resolved', 'rejected'];

router.patch('/reports/:id/verify', async (req, res, next) => {
  try {
    const { status, verification_notes, reason } = req.body;
    if (!STATUSES.includes(status)) return res.status(422).json({ error: { code: 'INVALID_STATUS', message: 'Invalid status' } });
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
    const transitionProblem = transitionError(report, status, req.user, verification_notes || reason);
    if (transitionProblem) {
      return res.status(409).json({ error: { code: 'INVALID_TRANSITION', message: transitionProblem } });
    }
    const oldStatus = report.status;
    let updated;
    if (status === 'assigned') {
      const { assignedTo } = req.body;
      if (!assignedTo) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'assignedTo required' } });
      const officer = await User.findById(Number(assignedTo));
      if (!officer || officer.role !== 'traffic_officer' || officer.is_active !== 1) {
        return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose an active traffic officer' } });
      }
      updated = await Report.assign(report.id, officer.id, req.user.id);
      // Notify assigned officer
      await Notification.create({
        userId: officer.id,
        reportId: report.id,
        event: 'report.assigned',
        message: `You have been assigned to report ${report.report_reference}.`
      });
    } else {
      updated = await Report.updateStatus(report.id, status, req.user.id, { notes: verification_notes || reason });
    }
    await logAudit(req.user.id, 'VERIFY_REPORT', 'report', report.id, req, { old_status: report.status, new_status: status, verification_notes });
    await notifyStatusChange(report, oldStatus, status, req.user.id, verification_notes);
    res.json(updated);
  } catch (err) { next(err); }
});

export default router;
