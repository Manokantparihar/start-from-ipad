/**
 * User Notification Routes – /api/notifications
 *
 * All routes require authentication (authMiddleware applied in server.js).
 *
 * GET    /api/notifications          – list current user's notifications (latest first)
 * PATCH  /api/notifications/:id/read – mark one notification as read
 * PATCH  /api/notifications/read-all – mark all active (non-archived) user notifications as read
 * PATCH  /api/notifications/archive   – archive/unarchive selected notifications
 * PATCH  /api/notifications/:id/archive – archive one notification
 * DELETE /api/notifications/read      – clear only read notifications for current user
 * DELETE /api/notifications/:id      – dismiss (delete) one notification
 *
 * Rate limiting: 60 requests per user per minute to prevent abuse.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');

const router = express.Router();

// ─── Simple in-memory rate limiter ───────────────────────────────────────────
// Tracks request counts per userId, resets every WINDOW_MS milliseconds.

const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_MAX = 60;              // max requests per window per user

const _rateCounts = new Map(); // userId → { count, resetAt }

function rateLimiter(req, res, next) {
  const userId = req.userId;
  if (!userId) return next(); // auth middleware already blocks unauthenticated

  const now = Date.now();
  const entry = _rateCounts.get(userId);

  if (!entry || now > entry.resetAt) {
    _rateCounts.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return next();
  }

  entry.count += 1;
  if (entry.count > RATE_MAX) {
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }
  return next();
}

router.use(rateLimiter);

// ─── GET /api/notifications ───────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const userId = req.userId;
    const all = await db.getNotifications();
    const mine = all
      .filter(n => n.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const unreadCount = mine.filter(n => !n.read && !n.archived).length;
    res.json({ notifications: mine, unreadCount });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});


// ─── GET /api/notifications/unread-count ─────────────────────────────────────

router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.userId;
    const all = await db.getNotifications();
    const unreadCount = all.filter(n => n.userId === userId && !n.read && !n.archived).length;
    res.json({ unreadCount });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PATCH /api/notifications/read-all ───────────────────────────────────────

router.patch('/read-all', async (req, res) => {
  try {
    const userId = req.userId;
    const all = await db.getNotifications();
    let changed = 0;
    const updated = all.map(n => {
      if (n.userId === userId && !n.read && !n.archived) { changed++; return { ...n, read: true }; }
      return n;
    });
    if (changed > 0) await db.saveNotifications(updated);
    res.json({ message: `Marked ${changed} notification(s) as read.` });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PATCH /api/notifications/archive ───────────────────────────────────────

router.patch('/archive', async (req, res) => {
  try {
    const userId = req.userId;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const archived = req.body?.archived !== false;

    const normalizedIds = ids
      .map((id) => String(id || '').trim())
      .filter(Boolean);

    if (normalizedIds.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    const selected = new Set(normalizedIds);
    const all = await db.getNotifications();

    let changed = 0;
    const updated = all.map((notification) => {
      if (notification.userId !== userId || !selected.has(notification.id)) {
        return notification;
      }

      if (!!notification.archived === archived) {
        return notification;
      }

      changed += 1;
      return {
        ...notification,
        archived
      };
    });

    if (changed > 0) {
      await db.saveNotifications(updated);
    }

    return res.json({
      message: archived
        ? `Archived ${changed} notification(s).`
        : `Unarchived ${changed} notification(s).`,
      changed
    });
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─── DELETE /api/notifications/read ─────────────────────────────────────────

router.delete('/read', async (req, res) => {
  try {
    const userId = req.userId;
    const all = await db.getNotifications();
    const before = all.length;

    const filtered = all.filter((n) => !(n.userId === userId && n.read));
    const removed = before - filtered.length;

    if (removed > 0) {
      await db.saveNotifications(filtered);
    }

    return res.json({ message: `Cleared ${removed} read notification(s).`, removed });
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─── PATCH /api/notifications/:id/read ───────────────────────────────────────

router.patch('/:id/read', async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' });

    const all = await db.getNotifications();
    const idx = all.findIndex(n => n.id === id && n.userId === userId);
    if (idx === -1) return res.status(404).json({ error: 'Notification not found' });

    all[idx] = { ...all[idx], read: true };
    await db.saveNotifications(all);
    res.json({ notification: all[idx] });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PATCH /api/notifications/:id/archive ───────────────────────────────────

router.patch('/:id/archive', async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const archived = req.body?.archived !== false;
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' });

    const all = await db.getNotifications();
    const idx = all.findIndex(n => n.id === id && n.userId === userId);
    if (idx === -1) return res.status(404).json({ error: 'Notification not found' });

    all[idx] = { ...all[idx], archived };
    await db.saveNotifications(all);
    res.json({ notification: all[idx] });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── DELETE /api/notifications/:id ───────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' });

    const all = await db.getNotifications();
    const idx = all.findIndex(n => n.id === id && n.userId === userId);
    if (idx === -1) return res.status(404).json({ error: 'Notification not found' });

    all.splice(idx, 1);
    await db.saveNotifications(all);
    res.json({ message: 'Notification dismissed.' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Internal helper (used by other routes to create notifications) ───────────

/**
 * Create one in-app notification for a user.
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.type   – e.g. 'quiz_published', 'result_available', 'announcement', 'resource_published'
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {string} [opts.link] – optional deep-link URL
 */
async function createNotification({ userId, type, title, message, link }) {
  const all = await db.getNotifications();
  const notification = {
    id: uuidv4(),
    userId,
    type,
    title,
    message,
    link: link || null,
    read: false,
    archived: false,
    createdAt: new Date().toISOString()
  };
  all.push(notification);
  await db.saveNotifications(all);
  return notification;
}

module.exports = router;
module.exports.createNotification = createNotification;
