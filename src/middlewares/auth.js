const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET env variable is not set. Using insecure fallback. Set JWT_SECRET in production.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_fallback_key';

/**
 * Auth middleware — reads the JWT from the cookie, verifies it,
 * attaches req.userId to the request, and calls next().
 * Returns 401 if the token is missing, invalid, or expired.
 */
function requireAuth(req, res, next) {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: no token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: invalid or expired token' });
  }
}

module.exports = requireAuth;
