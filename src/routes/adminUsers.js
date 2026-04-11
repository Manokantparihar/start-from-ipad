/**
 * Admin User Management API
 * All routes protected by auth + isAdmin middleware (applied in server.js).
 * Mounted at /api/admin/users
 *
 * Endpoints:
 *   GET    /                    – List all users (no password hashes)
 *   GET    /:id                 – Get a single user's details + attempt stats
 *   PATCH  /:id/role            – Promote or demote user role (user ↔ admin)
 *   PATCH  /:id/status          – Activate or ban a user account
 *   DELETE /:id                 – Permanently delete a user account
 */

const express = require('express');
const db = require('../utils/db');

const router = express.Router();

const ALLOWED_ROLES = ['user', 'admin'];
const ALLOWED_STATUSES = ['active', 'banned'];

/**
 * Strip sensitive fields before sending user data to the admin.
 */
function sanitizeUser(user) {
  const {
    password,
    passwordHash,
    ...safe
  } = user;
  void password;
  void passwordHash;
  return safe;
}

/**
 * Build a Map<userId, { totalAttempts, avgScore, lastAttemptAt }>
 * from all attempts in one pass — O(attempts).
 */
function buildAllUserStats(attempts) {
  const map = new Map();

  for (const a of attempts) {
    if (a.status !== 'completed') continue;
    const entry = map.get(a.userId) || { count: 0, scoreSum: 0, lastTs: null };
    entry.count += 1;

    const total = a.total || a.maxScore || 0;
    if (total > 0) {
      entry.scoreSum += Math.round(((a.score || 0) / total) * 100);
    }

    const ts = a.submittedAt || a.createdAt || 0;
    if (!entry.lastTs || ts > entry.lastTs) entry.lastTs = ts;
    map.set(a.userId, entry);
  }

  const result = new Map();
  for (const [userId, entry] of map.entries()) {
    result.set(userId, {
      totalAttempts: entry.count,
      avgScore: entry.count > 0 ? Math.round(entry.scoreSum / entry.count) : null,
      lastAttemptAt: entry.lastTs || null
    });
  }
  return result;
}

/**
 * Look up precomputed stats for a user.
 */
function buildUserStats(userId, statsMap) {
  return statsMap.get(userId) || { totalAttempts: 0, avgScore: null, lastAttemptAt: null };
}

// ─── GET / ───────────────────────────────────────────────────────────────────
// List all users with basic stats.
router.get('/', async (req, res) => {
  try {
    const [users, attempts] = await Promise.all([db.getUsers(), db.getAttempts()]);

    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(req.query.perPage) || 50));
    const search = String(req.query.search || '').trim().toLowerCase();
    const roleFilter = String(req.query.role || '').trim().toLowerCase();
    const statusFilter = String(req.query.status || '').trim().toLowerCase();

    // Build stats map once for all users — O(attempts)
    const statsMap = buildAllUserStats(attempts);

    let filtered = users;

    if (search) {
      filtered = filtered.filter(
        (u) =>
          String(u.name || '').toLowerCase().includes(search) ||
          String(u.email || '').toLowerCase().includes(search)
      );
    }

    if (roleFilter && ALLOWED_ROLES.includes(roleFilter)) {
      filtered = filtered.filter((u) => (u.role || 'user') === roleFilter);
    }

    if (statusFilter && ALLOWED_STATUSES.includes(statusFilter)) {
      filtered = filtered.filter((u) => (u.status || 'active') === statusFilter);
    }

    // Pre-compute sort keys to avoid repeated Date construction
    const withTs = filtered.map((u) => ({ u, ts: new Date(u.createdAt || 0).getTime() }));
    withTs.sort((a, b) => b.ts - a.ts);
    filtered = withTs.map(({ u }) => u);

    const total = filtered.length;

    // Aggregate summary stats across the entire filtered set (not just the page)
    const summary = filtered.reduce(
      (acc, u) => {
        const role = u.role || 'user';
        const status = u.status || 'active';
        if (role === 'admin') acc.admins += 1;
        if (status === 'active') acc.active += 1;
        if (status === 'banned') acc.banned += 1;
        return acc;
      },
      { total, admins: 0, active: 0, banned: 0 }
    );

    const paginated = filtered.slice((page - 1) * perPage, page * perPage);

    const result = paginated.map((u) => ({
      ...sanitizeUser(u),
      role: u.role || 'user',
      status: u.status || 'active',
      ...buildUserStats(u.id, statsMap)
    }));

    return res.json({
      users: result,
      summary,
      pagination: {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage)
      }
    });
  } catch (error) {
    console.error('[GET /api/admin/users]', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
// Get a single user with full attempt stats.
router.get('/:id', async (req, res) => {
  try {
    const [users, attempts] = await Promise.all([db.getUsers(), db.getAttempts()]);
    const user = users.find((u) => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const userAttempts = attempts
      .filter((a) => a.userId === user.id)
      .map(({ userId: _uid, ...rest }) => rest) // strip userId (redundant)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 20); // latest 20

    const statsMap = buildAllUserStats(attempts);

    return res.json({
      user: {
        ...sanitizeUser(user),
        role: user.role || 'user',
        status: user.status || 'active'
      },
      stats: buildUserStats(user.id, statsMap),
      recentAttempts: userAttempts
    });
  } catch (error) {
    console.error('[GET /api/admin/users/:id]', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─── PATCH /:id/role ──────────────────────────────────────────────────────────
// Change a user's role (user ↔ admin).
router.patch('/:id/role', async (req, res) => {
  try {
    const { role } = req.body;

    if (!role || !ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${ALLOWED_ROLES.join(', ')}` });
    }

    const users = await db.getUsers();
    const idx = users.findIndex((u) => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    // Prevent admin from demoting themselves
    if (users[idx].id === req.userId && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot remove your own admin role.' });
    }

    users[idx] = { ...users[idx], role, updatedAt: new Date().toISOString() };
    await db.saveUsers(users);

    return res.json({
      message: `User role updated to "${role}".`,
      user: sanitizeUser(users[idx])
    });
  } catch (error) {
    console.error('[PATCH /api/admin/users/:id/role]', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─── PATCH /:id/status ────────────────────────────────────────────────────────
// Ban or activate a user account.
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}` });
    }

    const users = await db.getUsers();
    const idx = users.findIndex((u) => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    // Prevent admin from banning themselves
    if (users[idx].id === req.userId && status === 'banned') {
      return res.status(400).json({ error: 'You cannot ban your own account.' });
    }

    users[idx] = { ...users[idx], status, updatedAt: new Date().toISOString() };
    await db.saveUsers(users);

    return res.json({
      message: `User account ${status === 'banned' ? 'banned' : 'activated'}.`,
      user: sanitizeUser(users[idx])
    });
  } catch (error) {
    console.error('[PATCH /api/admin/users/:id/status]', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
// Permanently delete a user account and all their attempts.
router.delete('/:id', async (req, res) => {
  try {
    const users = await db.getUsers();
    const idx = users.findIndex((u) => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    // Prevent admin from deleting themselves
    if (users[idx].id === req.userId) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    const targetId = users[idx].id;
    const updatedUsers = users.filter((u) => u.id !== targetId);
    await db.saveUsers(updatedUsers);

    // Also remove the user's attempts
    const attempts = await db.getAttempts();
    const filteredAttempts = attempts.filter((a) => a.userId !== targetId);
    await db.saveAttempts(filteredAttempts);

    return res.json({ message: 'User account permanently deleted.' });
  } catch (error) {
    console.error('[DELETE /api/admin/users/:id]', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
