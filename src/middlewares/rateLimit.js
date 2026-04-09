function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function createRateLimiter({ windowMs, maxRequests, message }) {
  const buckets = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = getClientIp(req);
    const current = buckets.get(key);

    if (!current || now >= current.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (current.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ error: message || 'Too many requests, please try again later.' });
    }

    current.count += 1;
    buckets.set(key, current);
    return next();
  };
}

module.exports = {
  createRateLimiter
};
