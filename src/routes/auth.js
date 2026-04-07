const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_fallback_key';

// Register a new user
router.post('/register', async (req, res) => {
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
router.post('/login', async (req, res) => {
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

    const token = jwt.sign(
      { userId: user.id, name: user.name, email: user.email },
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
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Current user
router.get('/me', async (req, res) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    // Look up full user to include role
    const users = await db.getUsers();
    const user = users.find(u => u.id === payload.userId);

    return res.json({
      user: {
        id: payload.userId,
        name: user ? user.name : payload.name,
        email: user ? user.email : payload.email,
        role: user ? (user.role || 'user') : 'user'
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