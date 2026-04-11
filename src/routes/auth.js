const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { buildPublicGamification } = require('../utils/gamification');
const config = require('../config');
const { createRateLimiter } = require('../middlewares/rateLimit');

const router = express.Router();
const JWT_SECRET = config.jwtSecret;
const authMutationRateLimiter = createRateLimiter({
  windowMs: config.authRateLimitWindowMs,
  maxRequests: config.authRateLimitMaxRequests,
  message: 'Too many auth requests, please try again later.'
});
const authSessionRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: Math.max(config.authRateLimitMaxRequests * 3, 120),
  message: 'Too many session checks, please try again later.'
});

function findUserFromTokenPayload(users, payload) {
  const tokenUserId = payload.userId || payload.id;
  if (tokenUserId) {
    const byId = users.find((u) => u.id === tokenUserId);
    if (byId) return byId;
  }

  const tokenEmail = String(payload.email || '').trim().toLowerCase();
  if (tokenEmail) {
    const byEmail = users.find((u) => String(u.email || '').trim().toLowerCase() === tokenEmail);
    if (byEmail) return byEmail;
  }

  return null;
}

// Register a new user
router.post('/register', authMutationRateLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const users = await db.getUsers();

    if (users.find((u) => u.email === normalizedEmail)) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      id: uuidv4(),
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: 'user',
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    await db.saveUsers(users);

    res.status(201).json({
      message: 'User registered successfully',
      userId: newUser.id
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', authMutationRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const users = await db.getUsers();

    const user = users.find((u) => u.email === normalizedEmail);
    if (!user) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Wrong password' });
    }

    if (user.status === 'banned') {
      return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
    }

    const token = jwt.sign(
      { userId: user.id, name: user.name, email: user.email, role: user.role || 'user' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      message: 'Logged in successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'user'
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Current user
router.get('/me', authSessionRateLimiter, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    // Re-read latest user from DB (source of truth for role)
    const users = await db.getUsers();
    const user = findUserFromTokenPayload(users, payload);

    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        profileImage: user.profileImage || null,
        updatedAt: user.updatedAt || null,
        ...buildPublicGamification(user)
      }
    });
  } catch (error) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: "Logged out" });
});

module.exports = router;
