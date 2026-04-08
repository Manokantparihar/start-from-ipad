/**
 * Admin Notification Routes – /api/admin/notifications
 *
 * All routes require auth + isAdmin middleware (applied in server.js).
 *
 * POST /api/admin/notifications/announce  – broadcast announcement to all or selected users
 * GET  /api/admin/notifications/logs      – list of all admin notification broadcasts (log)
 *
 * Rate limiting: admins limited to 10 broadcast requests per minute.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { sendEmail, buildAnnouncementEmail } = require('../utils/email');
const { createNotification } = require('./notifications');

const router = express.Router();

// ─── Rate limiter (admin broadcast) ──────────────────────────────────────────

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_ADMIN = 10;
const _adminRateCounts = new Map();

function adminRateLimiter(req, res, next) {
  const userId = req.user && req.user.id;
  if (!userId) return next();
  const now = Date.now();
  const entry = _adminRateCounts.get(userId);
  if (!entry || now > entry.resetAt) {
    _adminRateCounts.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return next();
  }
  entry.count += 1;
  if (entry.count > RATE_MAX_ADMIN) {
    return res.status(429).json({ error: 'Too many broadcast requests. Please wait.' });
  }
  return next();
}

// ─── POST /api/admin/notifications/announce ───────────────────────────────────

router.post('/announce', adminRateLimiter, async (req, res) => {
  try {
    const { title, message, sendEmail: doEmail, targetUserIds } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Announcement title is required.' });
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Announcement message is required.' });
    }
    if (title.trim().length > 200) {
      return res.status(400).json({ error: 'Title must be 200 characters or fewer.' });
    }
    if (message.trim().length > 2000) {
      return res.status(400).json({ error: 'Message must be 2000 characters or fewer.' });
    }

    const allUsers = await db.getUsers();

    // Determine target audience
    let targets;
    if (Array.isArray(targetUserIds) && targetUserIds.length > 0) {
      // Validate provided IDs are real users
      const idSet = new Set(targetUserIds.map(String));
      targets = allUsers.filter(u => idSet.has(u.id));
    } else {
      targets = allUsers; // broadcast to everyone
    }

    const cleanTitle = title.trim();
    const cleanMessage = message.trim();
    const now = new Date().toISOString();

    let inAppCount = 0;
    let emailSent = 0;
    let emailFailed = 0;
    const emailErrors = [];

    for (const user of targets) {
      // In-app notification (always)
      await createNotification({
        userId: user.id,
        type: 'announcement',
        title: cleanTitle,
        message: cleanMessage
      });
      inAppCount++;

      // Email notification (if opted-in and email requested)
      if (doEmail && user.emailNotifications !== false) {
        const { subject, html } = buildAnnouncementEmail({
          userName: user.name,
          title: cleanTitle,
          message: cleanMessage
        });
        const result = await sendEmail({ to: user.email, subject, html });
        if (result.sent) {
          emailSent++;
        } else {
          emailFailed++;
          emailErrors.push({ userId: user.id, error: result.error });
        }
      }
    }

    // Write delivery log entry
    const logs = await db.getNotificationLogs();
    const logEntry = {
      id: uuidv4(),
      adminId: req.user.id,
      adminName: req.user.name,
      title: cleanTitle,
      message: cleanMessage,
      sentAt: now,
      targetCount: targets.length,
      targetUserIds: targets.map(u => u.id),
      inAppCount,
      emailRequested: Boolean(doEmail),
      emailSent,
      emailFailed,
      emailErrors
    };
    logs.push(logEntry);
    await db.saveNotificationLogs(logs);

    res.json({
      message: 'Announcement sent.',
      inAppCount,
      emailSent,
      emailFailed,
      logId: logEntry.id
    });
  } catch (err) {
    console.error('[adminNotifications] announce error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/admin/notifications/logs ───────────────────────────────────────

router.get('/logs', async (req, res) => {
  try {
    const logs = await db.getNotificationLogs();
    // Return logs newest-first, omit individual emailErrors detail to keep payload small
    const summary = logs
      .slice()
      .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
      .map(({ emailErrors: _ignored, ...rest }) => rest);
    res.json({ logs: summary });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/admin/notifications/users ──────────────────────────────────────
// Returns minimal user list for the "select recipients" UI.

router.get('/users', async (req, res) => {
  try {
    const users = await db.getUsers();
    res.json({
      users: users.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role || 'user'
      }))
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
