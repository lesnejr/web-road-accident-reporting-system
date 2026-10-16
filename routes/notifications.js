import express from 'express';
import { Notification } from '../models/Notification.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { unread, page, limit } = req.query;
    const result = await Notification.listByUser(req.user.id, {
      unreadOnly: unread === 'true',
      page: page || 1,
      limit: limit || 20
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/unread-count', async (req, res, next) => {
  try {
    const count = await Notification.unreadCount(req.user.id);
    res.json({ count });
  } catch (err) { next(err); }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    const notif = await Notification.markRead(req.params.id, req.user.id);
    if (!notif) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Notification not found' } });
    res.json(notif);
  } catch (err) { next(err); }
});

router.post('/read-all', async (req, res, next) => {
  try {
    await Notification.markAllRead(req.user.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
