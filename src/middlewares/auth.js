const jwt = require('jsonwebtoken');
const db = require('../utils/db');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_fallback_key';

function findUserFromTokenPayload(users, decoded) {
  const tokenUserId = decoded.userId || decoded.id;
  if (tokenUserId) {
    const byId = users.find((u) => u.id === tokenUserId);
    if (byId) return byId;
  }

  const tokenEmail = String(decoded.email || '').trim().toLowerCase();
  if (tokenEmail) {
    const byEmail = users.find((u) => String(u.email || '').trim().toLowerCase() === tokenEmail);
    if (byEmail) return byEmail;
  }

  return null;
}

module.exports = async (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Look up full user (includes latest role) for RBAC
    const users = await db.getUsers();
    const user = findUserFromTokenPayload(users, decoded);

    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    req.userId = user.id;
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || 'user'
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
