const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../utils/db');
const {
  buildLeaderboardResponse,
  normalizeTopicKey
} = require('../utils/leaderboard');
const { getMasteryRank, getUserGroupIds } = require('../utils/gamification');

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

router.get('/weekly', async (req, res) => {
  try {
    const { users, attempts, quizzes } = await buildBaseData();
    const viewerUserId = getOptionalViewerUserId(req);
    const limit = req.query.limit || 10;

    const payload = buildLeaderboardResponse({
      mode: 'weekly',
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
      week: payload.week,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[GET /api/leaderboard/weekly]', err);
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

router.get('/group/:groupId', async (req, res) => {
  try {
    const { users } = await buildBaseData();
    const groups = await db.getGroups();
    const viewerUserId = getOptionalViewerUserId(req);
    const groupId = String(req.params.groupId || '').trim();

    const group = (groups || []).find((entry) => String(entry.id) === groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const members = users
      .filter((user) => {
        const ids = new Set(getUserGroupIds(user, groups));
        return ids.has(groupId);
      })
      .map((user) => ({
        userId: user.id,
        name: user.name || 'Unknown',
        profileImage: user.profileImage || null,
        accuracyPercent: Number(user.accuracyPercent) || 0,
        masteryLevel: user.masteryLevel || user.currentTier || 'Beginner',
        rankScore: Number(user.rankScore) || 0,
        totalXp: Number(user.totalXp) || 0,
        weeklyXp: Number(user.weeklyXp) || 0,
        currentStreak: Number(user.currentStreak) || 0,
        tier: user.masteryLevel || user.currentTier || 'Beginner'
      }))
      .sort((a, b) => {
        const masteryDiff = getMasteryRank(b.masteryLevel) - getMasteryRank(a.masteryLevel);
        if (masteryDiff !== 0) return masteryDiff;
        if (b.accuracyPercent !== a.accuracyPercent) return b.accuracyPercent - a.accuracyPercent;
        if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
        if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
        return a.name.localeCompare(b.name);
      })
      .map((entry, index) => ({
        rank: index + 1,
        ...entry,
        isCurrentUser: Boolean(viewerUserId && viewerUserId === entry.userId)
      }));

    const viewer = viewerUserId
      ? members.find((entry) => entry.userId === viewerUserId) || null
      : null;

    return res.json({
      group: {
        id: group.id,
        name: group.name || group.id,
        description: group.description || '',
        memberCount: members.length
      },
      leaderboard: members,
      viewer,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[GET /api/leaderboard/group/:groupId]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;