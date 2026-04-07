const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../utils/db');

const router = express.Router();

// ─── Avatar Upload Setup ─────────────────────────────────────────────────────

const AVATAR_DIR = path.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(AVATAR_DIR)) {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.userId}${ext}`);
  }
});

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed.'));
    }
  }
});

// ─── GET /api/profile ────────────────────────────────────────────────────────
// Returns the current logged-in user's profile (no password).
router.get('/', async (req, res) => {
  try {
    const users = await db.getUsers();
    const user = users.find(u => u.id === req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        profileImage: user.profileImage || null,
        createdAt: user.createdAt || null,
        updatedAt: user.updatedAt || null
      }
    });
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─── PUT /api/profile ────────────────────────────────────────────────────────
// Updates name and/or email for the logged-in user.
router.put('/', async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name && !email) {
      return res.status(400).json({ error: 'Provide at least name or email to update.' });
    }

    const users = await db.getUsers();
    const idx = users.findIndex(u => u.id === req.userId);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    const user = users[idx];

    // Validate name
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return res.status(400).json({ error: 'Name cannot be empty.' });
      if (trimmed.length > 100) return res.status(400).json({ error: 'Name is too long (max 100 chars).' });
      user.name = trimmed;
    }

    // Validate email
    if (email !== undefined) {
      const normalized = String(email).trim().toLowerCase();
      // Use a simple, ReDoS-safe check: length + basic format
      if (normalized.length > 254 || !/^[^@\s]{1,64}@[^@\s]{1,255}$/.test(normalized) || normalized.indexOf('.') === -1) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      // Check uniqueness (ignore self)
      const conflict = users.find(u => u.email === normalized && u.id !== req.userId);
      if (conflict) {
        return res.status(409).json({ error: 'This email is already used by another account.' });
      }
      user.email = normalized;
    }

    user.updatedAt = new Date().toISOString();
    users[idx] = user;
    await db.saveUsers(users);

    return res.json({
      message: 'Profile updated successfully.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        profileImage: user.profileImage || null,
        updatedAt: user.updatedAt
      }
    });
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─── PUT /api/profile/password ───────────────────────────────────────────────
// Changes the password; requires current password for verification.
router.put('/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    if (newPassword === currentPassword) {
      return res.status(400).json({ error: 'New password must be different from current password.' });
    }

    const users = await db.getUsers();
    const idx = users.findIndex(u => u.id === req.userId);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    const user = users[idx];
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.updatedAt = new Date().toISOString();
    users[idx] = user;
    await db.saveUsers(users);

    return res.json({ message: 'Password changed successfully.' });
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/profile/avatar ────────────────────────────────────────────────
// Uploads or replaces the user's avatar image.
router.post('/avatar', (req, res, next) => {
  upload.single('avatar')(req, res, async (err) => {
    if (err) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Image is too large. Maximum size is 2 MB.'
          : err.message || 'Upload failed.';
      return res.status(400).json({ error: msg });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided.' });
    }

    try {
      const users = await db.getUsers();
      const idx = users.findIndex(u => u.id === req.userId);
      if (idx === -1) return res.status(404).json({ error: 'User not found' });

      // Remove any previous avatar file to avoid stale files on disk
      const prevImage = users[idx].profileImage;
      if (prevImage) {
        const prevFile = path.join(__dirname, '../../', prevImage);
        if (fs.existsSync(prevFile)) {
          try { fs.unlinkSync(prevFile); } catch { /* ignore if already gone */ }
        }
      }

      const avatarUrl = `/uploads/avatars/${req.file.filename}`;
      users[idx].profileImage = avatarUrl;
      users[idx].updatedAt = new Date().toISOString();
      await db.saveUsers(users);

      return res.json({
        message: 'Avatar uploaded successfully.',
        profileImage: avatarUrl
      });
    } catch {
      return res.status(500).json({ error: 'Server error' });
    }
  });
});

module.exports = router;
