import express from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import validator from 'validator';
import { User } from '../models/User.js';
import { requireAuth, blockToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', async (req, res, next) => {
  try {
    // Role is never taken from the body: anyone who self-registers is a reporter.
    const { name, email, password, phone } = req.body;
    const fields = {};
    if (!name || String(name).trim().length < 2) fields.name = 'Name is required';
    if (!email || !validator.isEmail(String(email).trim())) fields.email = 'A valid email is required';
    if (!password || String(password).length < 8) fields.password = 'Password must be at least 8 characters';
    if (Object.keys(fields).length > 0) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Registration details are invalid', fields } });
    }
    const user = await User.create({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      password: String(password),
      phone: phone ? String(phone).trim() : null,
      role: 'reporter'
    });
    res.status(201).json(user);
  } catch (err) { next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Email and password required' } });
    const user = await User.findByEmail(email);
    if (!user || !await User.verifyPassword(user, password)) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }
    if (user.is_active !== 1) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Account is inactive' } });
    // The random id makes every issued token unique, so logs are not counted out by an earlier logout.
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE || '8h',
      jwtid: randomUUID()
    });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, is_active: user.is_active }, token });
  } catch (err) { next(err); }
});

router.post('/logout', requireAuth, (req, res) => {
  blockToken(req.token);
  res.json({ message: 'Logged out' });
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

export default router;
