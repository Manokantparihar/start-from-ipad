const jwt = require('jsonwebtoken');
const db = require('../utils/db');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_fallback_key';

module.exports = async (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Attach userId for backward compatibility
    req.userId = decoded.userId;
    // Look up full user (includes role) for RBAC
    const users = await db.getUsers();
    const user = users.find(u => u.id === decoded.userId);
    req.user = user
      ? { id: user.id, name: user.name, email: user.email, role: user.role || 'user' }
      : { id: decoded.userId, name: decoded.name, email: decoded.email, role: 'user' };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
