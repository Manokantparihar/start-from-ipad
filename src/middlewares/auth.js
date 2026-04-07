const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_fallback_key';

/**
 * Auth middleware — reads the HttpOnly cookie, verifies the JWT,
 * and sets req.userId so route handlers never trust client-supplied ids.
 */
function requireAuth(req, res, next) {
  try {
    const token = req.cookies && req.cookies.token;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId; // always comes from the verified token
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

module.exports = { requireAuth };
