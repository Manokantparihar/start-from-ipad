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
    const [users, attempts, quizzes] = await Promise.all([
      db.getUsers(),
      db.getAttempts(),
      db.getQuizzes({ includeDeleted: true, includeUnpublished: true })
    ]);
    
    const user = findUserFromTokenPayload(users, payload);

    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Calculate current user's weekly rank dynamically
    const publicGamification = buildPublicGamification(user);
    let weeklyRank = publicGamification.weeklyRank;

    // If no rank assigned (less than 3 competitive users in sync), calculate dynamically
    if (!weeklyRank && Number(publicGamification.weeklyCompletedQuizzes) > 0) {
      // Build weekly metrics for all users
      const weeklyMetrics = users
        .filter((u) => u && u.id)
        .map((u) => {
          const gamif = buildPublicGamification(u);
          return {
            userId: u.id,
            name: u.name || 'Unknown',
            weeklyAccuracyPercent: Number(gamif.weeklyAccuracyPercent) || 0,
            weeklyCompletedQuizzes: Number(gamif.weeklyCompletedQuizzes) || 0
          };
        })
        .filter((entry) => Number(entry.weeklyCompletedQuizzes) > 0)
        .sort((a, b) => {
          if (b.weeklyAccuracyPercent !== a.weeklyAccuracyPercent) {
            return b.weeklyAccuracyPercent - a.weeklyAccuracyPercent;
          }
          if (b.weeklyCompletedQuizzes !== a.weeklyCompletedQuizzes) {
            return b.weeklyCompletedQuizzes - a.weeklyCompletedQuizzes;
          }
          return a.name.localeCompare(b.name);
        });

      // Find current user's rank (assign rank if at least 2 competitive users)
      if (weeklyMetrics.length >= 2) {
        const userIndex = weeklyMetrics.findIndex((entry) => entry.userId === user.id);
        if (userIndex >= 0) {
          weeklyRank = userIndex + 1;
        }
      }
    }

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        profileImage: user.profileImage || null,
        updatedAt: user.updatedAt || null,
        ...publicGamification,
        weeklyRank // Override with dynamically calculated rank
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
