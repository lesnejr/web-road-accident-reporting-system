import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

// Token ids invalidated by logout. In-memory, so a server restart clears it.
// ponytail: in-memory blocklist; move to a DB table if the API ever runs more than one process
const blockedTokenIds = new Set();

export function blockToken(token) {
  if (!token) return;
  try {
    const decoded = jwt.decode(token);
    if (decoded?.jti) blockedTokenIds.add(decoded.jti);
  } catch {
    // A token we cannot decode needs no blocking; every request verifies it anyway.
  }
}

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No token provided' } });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.jti && blockedTokenIds.has(decoded.jti)) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Session has been logged out' } });
    }
    const [rows] = await pool.query('SELECT id, name, email, role, phone, is_active FROM users WHERE id = ?', [decoded.id]);
    if (rows.length === 0) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
    }
    if (rows[0].is_active !== 1) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Account is inactive' } });
    }
    req.user = rows[0];
    req.token = token;
    next();
  } catch (err) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
  }
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    next();
  };
};

export const isActive = (req, res, next) => {
  if (req.user && req.user.is_active === 1) return next();
  return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Account is inactive' } });
};
