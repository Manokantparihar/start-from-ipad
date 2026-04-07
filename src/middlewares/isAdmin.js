/**
 * isAdmin middleware – must be used AFTER auth middleware.
 * Only allows requests from users with role === "admin".
 * All other users receive 403 Forbidden.
 *
 * To grant admin access in dev: open data/users.json and set
 *   "role": "admin"
 * on the desired user record, then save the file.
 */
module.exports = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ error: 'Admin access only.' });
};
