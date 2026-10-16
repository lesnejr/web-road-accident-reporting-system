import express from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM accident_categories ORDER BY name');
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Category name is required', fields: { name: 'Required' } } });
    const [result] = await pool.query('INSERT INTO accident_categories (name, description) VALUES (?, ?)', [name, req.body.description || null]);
    const [rows] = await pool.query('SELECT * FROM accident_categories WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await pool.query('SELECT * FROM accident_categories WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Category not found' } });
    const name = req.body.name !== undefined ? String(req.body.name).trim() : existing[0].name;
    if (!name) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Category name is required', fields: { name: 'Required' } } });
    const description = req.body.description !== undefined ? req.body.description : existing[0].description;
    await pool.query('UPDATE accident_categories SET name = ?, description = ? WHERE id = ?', [name, description, id]);
    const [rows] = await pool.query('SELECT * FROM accident_categories WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
