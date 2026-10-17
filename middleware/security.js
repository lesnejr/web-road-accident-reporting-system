// Plain security headers for a JSON API that also streams evidence files.
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
}

// Fixed-window limiter, in memory. A server restart clears it, which is
// acceptable for a single-process student deployment.
// ponytail: in-memory fixed window; move to a shared store if the API ever runs more than one process
export function rateLimit({ windowMs = 15 * 60 * 1000, max = 20, message = 'Too many attempts. Try again later.' } = {}) {
  const hits = new Map();

  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > 5000) {
      for (const [key, entry] of hits) if (now > entry.resetAt) hits.delete(key);
    }
    const key = req.ip || 'unknown';
    let entry = hits.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ error: { code: 'RATE_LIMITED', message } });
    }
    next();
  };
}
