const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../utils/db');
const {
  buildLeaderboardResponse,
  normalizeTopicKey
} = require('../utils/leaderboard');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_fallback_key';

function getOptionalViewerUserId(req) {
  const token = req.cookies?.token;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return payload.userId || payload.id || null;
  } catch {
    return null;
  }
}

async function buildBaseData() {
  const [users, attempts, quizzes] = await Promise.all([
    db.getUsers(),
    db.getAttempts(),
    db.getQuizzes({ includeDeleted: true, includeUnpublished: true })
  ]);

  return { users, attempts, quizzes };
}

router.get('/overall', async (req, res) => {
  try {
    const { users, attempts, quizzes } = await buildBaseData();
    const viewerUserId = getOptionalViewerUserId(req);
    const limit = req.query.limit || 10;

    const payload = buildLeaderboardResponse({
      mode: 'overall',
      users,
      attempts,
      quizzes,
      limit,
      viewerUserId
    });

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({
      leaderboard: payload.entries,
      viewer: payload.viewer,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[GET /api/leaderboard/overall]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/streak', async (req, res) => {
  try {
    const { users, attempts, quizzes } = await buildBaseData();
    const viewerUserId = getOptionalViewerUserId(req);
    const limit = req.query.limit || 10;

    const payload = buildLeaderboardResponse({
      mode: 'streak',
      users,
      attempts,
      quizzes,
      limit,
      viewerUserId
    });

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({
      leaderboard: payload.entries,
      viewer: payload.viewer,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[GET /api/leaderboard/streak]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/topic', async (req, res) => {
  try {
    const { users, attempts, quizzes } = await buildBaseData();
    const viewerUserId = getOptionalViewerUserId(req);
    const limit = req.query.limit || 10;
    const topic = normalizeTopicKey(req.query.topic || '');

    if (!topic) {
      const payload = buildLeaderboardResponse({
        mode: 'topic',
        users,
        attempts,
        quizzes,
        limit,
        viewerUserId,
        topicKey: ''
      });

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res.json({
        leaderboard: [],
        viewer: null,
        topics: payload.topics,
        selectedTopic: null,
        generatedAt: new Date().toISOString()
      });
    }

    const payload = buildLeaderboardResponse({
      mode: 'topic',
      users,
      attempts,
      quizzes,
      limit,
      viewerUserId,
      topicKey: topic
    });

    const selectedTopic = payload.topics.find((entry) => entry.key === topic) || null;

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({
      leaderboard: payload.entries,
      viewer: payload.viewer,
      topics: payload.topics,
      selectedTopic,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[GET /api/leaderboard/topic]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;