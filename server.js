require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
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
const adminCoursesRoutes = require('./src/routes/adminCourses');
const coursesRoutes = require('./src/routes/courses');
const meRoutes = require('./src/routes/me');
const rewardsRoutes = require('./src/routes/rewards');
const authMiddleware = require('./src/middlewares/auth');
const isAdmin = require('./src/middlewares/isAdmin');
const { syncUsersToGamification } = require('./src/utils/gamification');
const db = require('./src/utils/db');
const appConfig = require('./src/config');
const { createRateLimiter } = require('./src/middlewares/rateLimit');

const app = express();
const PORT = appConfig.port;
const authRateLimiter = createRateLimiter({
  windowMs: appConfig.authRateLimitWindowMs,
  maxRequests: appConfig.authRateLimitMaxRequests,
  message: 'Too many auth requests, please try again later.'
});
const contactRateLimiter = createRateLimiter({
  windowMs: appConfig.contactRateLimitWindowMs,
  maxRequests: appConfig.contactRateLimitMaxRequests,
  message: 'Too many contact submissions, please try again later.'
});

const corsOriginValidator = (origin, callback) => {
  if (!origin) {
    return callback(null, true);
  }

  if (appConfig.corsAllowedOrigins.includes(origin)) {
    return callback(null, true);
  }

  return callback(new Error('CORS origin not allowed'));
};

// --- Middlewares ---
app.use(
  cors({
    origin: corsOriginValidator,
    credentials: true
  })
);
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);
app.use(express.json({ limit: appConfig.payloadLimit }));
app.use(express.urlencoded({ extended: true, limit: appConfig.payloadLimit }));
app.use(cookieParser());

// --- Routes ---
app.use('/api/auth', authRateLimiter, authRoutes);
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
// Courses + lessons: admin management and public listing/detail
app.use('/api/admin/courses', authMiddleware, isAdmin, adminCoursesRoutes);
app.use('/api/courses', coursesRoutes);
// Analytics – admin only
app.use('/api/admin/analytics', authMiddleware, isAdmin, adminAnalyticsRoutes);
// Import / Export – admin only
app.use('/api/admin', authMiddleware, isAdmin, adminImportExportRoutes);
// Notifications – user (auth required)
app.use('/api/notifications', authMiddleware, notificationRoutes);
app.use('/api/me', authMiddleware, meRoutes);
app.use('/api/rewards', authMiddleware, rewardsRoutes);
// Admin notifications – admin only
app.use('/api/admin/notifications', authMiddleware, isAdmin, adminNotificationRoutes);

// Serve uploaded avatars
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve all static files from the 'public' folder automatically!
app.use(express.static(path.join(__dirname, 'public')));

// --- Data Paths & Contact Setup ---
const DATA_DIR = appConfig.dataDir;
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'contact-submissions.jsonl');
const CONTACT_TARGET_EMAIL = appConfig.contactTargetEmail;

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
app.post('/api/contact', contactRateLimiter, async (req, res) => {
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

    await fsPromises.appendFile(SUBMISSIONS_FILE, `${JSON.stringify(record)}\n`, 'utf8');

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

async function bootstrapGamification() {
  const [users, attempts, quizzes, events, groups, gamificationConfig] = await Promise.all([
    db.getUsers(),
    db.getAttempts(),
    db.getQuizzes({ includeDeleted: true, includeUnpublished: true }),
    db.getEvents(),
    db.getGroups(),
    db.getGamificationConfig()
  ]);
  const syncedUsers = await syncUsersToGamification({
    users,
    attempts,
    quizzes,
    events,
    groups,
    config: gamificationConfig
  });
  await db.saveUsers(syncedUsers);
}

// --- Start the Server ---
(async () => {
  try {
    await bootstrapGamification();
  } catch (error) {
    console.error('Gamification bootstrap failed:', error);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Express server running on http://localhost:${PORT}`);
  });
})();
