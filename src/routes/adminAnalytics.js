/**
 * Admin Analytics API
 * All routes protected by auth + isAdmin middleware (applied in server.js).
 * Mounted at /api/admin/analytics
 *
 * Endpoints:
 *   GET /overview           – totals: users, quizzes, attempts, avg score
 *   GET /quiz-stats         – per-quiz attempt counts & avg scores
 *   GET /score-distribution – bucketed score percentages
 *   GET /user-stats         – top & bottom scorers (username only, no PII)
 *   GET /attempts-over-time – daily / weekly / monthly attempt counts (?period=daily|weekly|monthly)
 *   GET /recent-activity    – last N attempts with basic info (?limit=20)
 */
const express = require('express');
const db = require('../utils/db');

const router = express.Router();

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Build a Map<userId, username> from the users array.
 * Returns only the username – never email / password.
 */
function buildUserMap(users) {
  const map = new Map();
  for (const u of users) {
    map.set(u.id, u.username || u.name || 'Unknown');
  }
  return map;
}

/**
 * Compute score percentage for an attempt.
 * Returns a number 0–100.
 */
function scorePct(attempt) {
  const total = attempt.total || attempt.maxScore || 0;
  if (!total) return 0;
  return Math.round(((attempt.score || 0) / total) * 100);
}

/**
 * Format a timestamp (number or ISO string) to a YYYY-MM-DD string.
 */
function toDateStr(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

/**
 * Return the ISO week string "YYYY-Www" for a date string.
 */
function toWeekStr(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  // Simple week-of-year (1-indexed, 7-day blocks from Jan 1)
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((d - startOfYear) / 86400000) + 1;
  const weekNum = Math.ceil(dayOfYear / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Return the YYYY-MM string for a date string.
 */
function toMonthStr(dateStr) {
  if (!dateStr) return null;
  return dateStr.slice(0, 7);
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/analytics/overview
 * Returns high-level totals.
 */
router.get('/overview', async (req, res) => {
  try {
    const [users, quizzes, attempts] = await Promise.all([
      db.getUsers(),
      db.getQuizzes({ includeDeleted: true, includeUnpublished: true }),
      db.getAttempts()
    ]);

    const completed = attempts.filter(a => a.status === 'completed' || a.score !== undefined);
    const totalScore = completed.reduce((sum, a) => sum + scorePct(a), 0);
    const avgScore = completed.length ? Math.round(totalScore / completed.length) : 0;

    res.json({
      totalUsers: users.length,
      totalQuizzes: quizzes.filter(q => !q.isDeleted).length,
      totalAttempts: completed.length,
      avgScore
    });
  } catch (err) {
    console.error('Analytics overview error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/admin/analytics/quiz-stats
 * Returns per-quiz attempt count and average score, sorted by most attempted.
 */
router.get('/quiz-stats', async (req, res) => {
  try {
    const attempts = await db.getAttempts();
    const completed = attempts.filter(a => a.status === 'completed' || a.score !== undefined);

    const statsMap = new Map(); // quizId → { title, count, totalPct }
    for (const a of completed) {
      if (!statsMap.has(a.quizId)) {
        statsMap.set(a.quizId, { title: a.quizTitle || a.quizId, count: 0, totalPct: 0 });
      }
      const s = statsMap.get(a.quizId);
      s.count++;
      s.totalPct += scorePct(a);
    }

    const list = Array.from(statsMap.values()).map(s => ({
      title: s.title,
      attempts: s.count,
      avgScore: s.count ? Math.round(s.totalPct / s.count) : 0
    }));

    list.sort((a, b) => b.attempts - a.attempts);
    res.json(list);
  } catch (err) {
    console.error('Analytics quiz-stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/admin/analytics/score-distribution
 * Returns counts of attempts in each 20-point percentage bucket.
 */
router.get('/score-distribution', async (req, res) => {
  try {
    const attempts = await db.getAttempts();
    const completed = attempts.filter(a => a.status === 'completed' || a.score !== undefined);

    const buckets = [
      { range: '0–20%', min: 0, max: 20, count: 0 },
      { range: '21–40%', min: 21, max: 40, count: 0 },
      { range: '41–60%', min: 41, max: 60, count: 0 },
      { range: '61–80%', min: 61, max: 80, count: 0 },
      { range: '81–100%', min: 81, max: 100, count: 0 }
    ];

    for (const a of completed) {
      const pct = scorePct(a);
      for (const b of buckets) {
        if (pct >= b.min && pct <= b.max) {
          b.count++;
          break;
        }
      }
    }

    res.json(buckets.map(b => ({ range: b.range, count: b.count })));
  } catch (err) {
    console.error('Analytics score-distribution error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/admin/analytics/user-stats
 * Returns top 10 and bottom 10 scorers by average score.
 * Only exposes username, not email or password.
 */
router.get('/user-stats', async (req, res) => {
  try {
    const [users, attempts] = await Promise.all([db.getUsers(), db.getAttempts()]);
    const userMap = buildUserMap(users);

    const completed = attempts.filter(a => a.status === 'completed' || a.score !== undefined);

    const statsMap = new Map(); // userId → { username, count, totalPct }
    for (const a of completed) {
      if (!statsMap.has(a.userId)) {
        statsMap.set(a.userId, {
          username: userMap.get(a.userId) || 'Unknown',
          count: 0,
          totalPct: 0
        });
      }
      const s = statsMap.get(a.userId);
      s.count++;
      s.totalPct += scorePct(a);
    }

    const list = Array.from(statsMap.values())
      .filter(s => s.count > 0)
      .map(s => ({
        username: s.username,
        attempts: s.count,
        avgScore: Math.round(s.totalPct / s.count)
      }));

    list.sort((a, b) => b.avgScore - a.avgScore);
    res.json({
      topScorers: list.slice(0, 10),
      bottomScorers: list.slice(-10).reverse()
    });
  } catch (err) {
    console.error('Analytics user-stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/admin/analytics/attempts-over-time?period=daily|weekly|monthly
 * Returns attempt counts grouped by the chosen period.
 */
router.get('/attempts-over-time', async (req, res) => {
  try {
    const period = ['daily', 'weekly', 'monthly'].includes(req.query.period)
      ? req.query.period
      : 'daily';

    const attempts = await db.getAttempts();
    const completed = attempts.filter(a => a.status === 'completed' || a.score !== undefined);

    const countsMap = new Map(); // period-key → count

    for (const a of completed) {
      const dateStr = toDateStr(a.completedAt || a.createdAt || a.startedAt);
      if (!dateStr) continue;

      let key;
      if (period === 'weekly') key = toWeekStr(dateStr);
      else if (period === 'monthly') key = toMonthStr(dateStr);
      else key = dateStr;

      if (!key) continue;
      countsMap.set(key, (countsMap.get(key) || 0) + 1);
    }

    const result = Array.from(countsMap.entries())
      .map(([period, count]) => ({ period, count }))
      .sort((a, b) => a.period.localeCompare(b.period));

    res.json(result);
  } catch (err) {
    console.error('Analytics attempts-over-time error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/admin/analytics/recent-activity?limit=20
 * Returns the most recent quiz attempts with basic (non-PII) info.
 */
router.get('/recent-activity', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const [users, attempts] = await Promise.all([db.getUsers(), db.getAttempts()]);
    const userMap = buildUserMap(users);

    const completed = attempts
      .filter(a => a.status === 'completed' || a.score !== undefined)
      .sort((a, b) => {
        const ta = a.completedAt || a.createdAt || 0;
        const tb = b.completedAt || b.createdAt || 0;
        return tb - ta;
      })
      .slice(0, limit)
      .map(a => ({
        username: userMap.get(a.userId) || 'Unknown',
        quizTitle: a.quizTitle || a.quizId,
        score: a.score || 0,
        total: a.total || a.maxScore || 0,
        percent: scorePct(a),
        date: toDateStr(a.completedAt || a.createdAt || a.startedAt)
      }));

    res.json(completed);
  } catch (err) {
    console.error('Analytics recent-activity error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
