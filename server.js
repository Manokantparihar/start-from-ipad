require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const authRoutes = require('./src/routes/auth');
const quizRoutes = require('./src/routes/quizzes');
const attemptRoutes = require('./src/routes/attempts');
const adminQuizRoutes = require('./src/routes/adminQuizzes');
const profileRoutes = require('./src/routes/profile');
const resourceRoutes = require('./src/routes/resources');
const adminAnalyticsRoutes = require('./src/routes/adminAnalytics');
const leaderboardRoutes = require('./src/routes/leaderboard');
const adminImportExportRoutes = require('./src/routes/adminImportExport');
const notificationRoutes = require('./src/routes/notifications');
const adminNotificationRoutes = require('./src/routes/adminNotifications');
const authMiddleware = require('./src/middlewares/auth');
const isAdmin = require('./src/middlewares/isAdmin');

const app = express();
const PORT = process.env.PORT || 5500;

// --- Middlewares ---
app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/attempts', attemptRoutes);
// Admin quiz management – protected by auth + isAdmin
app.use('/api/admin/quizzes', authMiddleware, isAdmin, adminQuizRoutes);
// User profile – protected by auth
app.use('/api/profile', authMiddleware, profileRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
// Resources: admin upload/delete under /api/admin/resources, public list/download under /api/resources
app.use('/api/admin/resources', authMiddleware, isAdmin, resourceRoutes);
app.use('/api/resources', resourceRoutes);
// Analytics – admin only
app.use('/api/admin/analytics', authMiddleware, isAdmin, adminAnalyticsRoutes);
// Import / Export – admin only
app.use('/api/admin', authMiddleware, isAdmin, adminImportExportRoutes);
// Notifications – user (auth required)
app.use('/api/notifications', authMiddleware, notificationRoutes);
// Admin notifications – admin only
app.use('/api/admin/notifications', authMiddleware, isAdmin, adminNotificationRoutes);

// Serve uploaded avatars
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve all static files from the 'public' folder automatically!
app.use(express.static(path.join(__dirname, 'public')));

// --- Data Paths & Contact Setup ---
const DATA_DIR = path.join(__dirname, 'data');
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'contact-submissions.jsonl');
const CONTACT_TARGET_EMAIL =
  process.env.CONTACT_TARGET_EMAIL || 'manokantparihar@gmail.com';

// Make sure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// --- Helper Functions ---
const forwardViaAjaxEndpoint = async ({ name, email, message }) => {
  const FORMSUBMIT_ENDPOINT = `https://formsubmit.co/ajax/${encodeURIComponent(
    CONTACT_TARGET_EMAIL
  )}`;

  try {
    const response = await fetch(FORMSUBMIT_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        email,
        message,
        _replyto: email,
        _subject: `New contact from ${name}`,
        _captcha: 'false'
      })
    });

    const payload = await response.json().catch(() => null);
    const ok =
      response.ok && (payload?.success === true || payload?.success === 'true');

    if (!ok) {
      return {
        success: false,
        message: payload?.message || 'AJAX forwarding failed'
      };
    }

    return { success: true, message: 'Email forwarded (AJAX)' };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// Contact API Route
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res
        .status(400)
        .json({ success: false, message: 'Missing required fields' });
    }

    const record = {
      submittedAt: new Date().toISOString(),
      name,
      email,
      message
    };

    fs.appendFileSync(SUBMISSIONS_FILE, `${JSON.stringify(record)}\n`, 'utf8');

    const forwarded = await forwardViaAjaxEndpoint({ name, email, message });

    return res.status(200).json({
      success: true,
      message: forwarded.success
        ? 'Message submitted and forwarded'
        : 'Message submitted locally',
      emailForwarded: forwarded.success
    });
  } catch (error) {
    console.error('Contact API Error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// --- Start the Server ---
app.listen(PORT, () => {
  console.log(`🚀 Express server running on http://localhost:${PORT}`);
});