const express = require('express');
const db = require('../utils/db');
const {
  buildPublicGamification,
  getCurrentWeekRange,
  getMasteryRank,
  getUserGroupIds,
  getUserMissionStateForDate,
  toUtcDateKey
} = require('../utils/gamification');
const { buildAdaptiveRecommendation } = require('../utils/adaptiveLearning');

const router = express.Router();

function filterWrongQuestionsByActiveAttempts(wrongQuestions = [], attempts = [], userId) {
  const activeQuizIds = new Set(
    attempts
      .filter((attempt) => attempt.userId === userId && ['completed', 'expired'].includes(attempt.status))
      .map((attempt) => String(attempt.quizId || '').trim())
      .filter(Boolean)
  );

  if (activeQuizIds.size === 0) return [];
  return wrongQuestions.filter((entry) => activeQuizIds.has(String(entry.quizId || '').trim()));
}

router.get('/missions', async (req, res) => {
  try {
    const [attempts, quizzes] = await Promise.all([
      db.getAttempts(),
      db.getQuizzes({ includeDeleted: true, includeUnpublished: true })
    ]);

    const userAttempts = attempts.filter((attempt) => attempt.userId === req.userId);
    const dateKey = toUtcDateKey(new Date());
    const missionState = getUserMissionStateForDate({
      attempts: userAttempts,
      quizzes,
      dateKey
    });

    return res.json({
      dateKey,
      missions: missionState.missions,
      completedMissionIds: missionState.completedMissionIds,
      rewardXpEarned: missionState.rewardXpEarned
    });
  } catch (error) {
    console.error('[GET /api/me/missions]', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/progress', async (req, res) => {
  try {
    const [users, attempts, quizzes, wrongQuestions, bookmarks] = await Promise.all([
      db.getUsers(),
      db.getAttempts(),
      db.getQuizzes({ includeDeleted: true, includeUnpublished: true }),
      db.getWrongQuestions(req.userId),
      db.getBookmarks(req.userId)
    ]);
    const user = users.find((entry) => entry.id === req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const activeWrongQuestions = filterWrongQuestionsByActiveAttempts(wrongQuestions, attempts, req.userId);

    const progress = buildPublicGamification(user);
    const todayKey = toUtcDateKey(new Date());
    const adaptive = buildAdaptiveRecommendation({
      userId: req.userId,
      user,
      attempts,
      quizzes,
      wrongQuestions: activeWrongQuestions,
      bookmarks
    });

    return res.json({
      progress: {
        ...progress,
        week: getCurrentWeekRange(),
        dateKey: todayKey,
        recommendation: adaptive.recommendation,
        priorityTopics: adaptive.priorityTopics,
        adaptiveSummary: adaptive.summary
      },
      recommendation: adaptive.recommendation,
      priorityTopics: adaptive.priorityTopics,
      adaptiveSummary: adaptive.summary
    });
  } catch (error) {
    console.error('[GET /api/me/progress]', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/recommendation', async (req, res) => {
  try {
    const [users, attempts, quizzes, wrongQuestions, bookmarks] = await Promise.all([
      db.getUsers(),
      db.getAttempts(),
      db.getQuizzes({ includeDeleted: true, includeUnpublished: true }),
      db.getWrongQuestions(req.userId),
      db.getBookmarks(req.userId)
    ]);
    const user = users.find((entry) => entry.id === req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const activeWrongQuestions = filterWrongQuestionsByActiveAttempts(wrongQuestions, attempts, req.userId);

    const adaptive = buildAdaptiveRecommendation({
      userId: req.userId,
      user,
      attempts,
      quizzes,
      wrongQuestions: activeWrongQuestions,
      bookmarks
    });

    return res.json(adaptive);
  } catch (error) {
    console.error('[GET /api/me/recommendation]', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/groups', async (req, res) => {
  try {
    const [users, groups] = await Promise.all([db.getUsers(), db.getGroups()]);
    const user = users.find((entry) => entry.id === req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const userGroupIds = new Set(getUserGroupIds(user, groups));
    const userGroups = (groups || [])
      .filter((group) => userGroupIds.has(group.id))
      .map((group) => {
        const members = users
          .filter((member) => Array.isArray(group.members) && group.members.includes(member.id))
          .sort((a, b) => {
            const masteryA = a.masteryLevel || a.currentTier || 'Beginner';
            const masteryB = b.masteryLevel || b.currentTier || 'Beginner';
            const masteryDiff = getMasteryRank(masteryB) - getMasteryRank(masteryA);
            if (masteryDiff !== 0) return masteryDiff;
            const accuracyA = Number(a.accuracyPercent) || 0;
            const accuracyB = Number(b.accuracyPercent) || 0;
            if (accuracyB !== accuracyA) return accuracyB - accuracyA;
            const streakA = Number(a.currentStreak) || 0;
            const streakB = Number(b.currentStreak) || 0;
            if (streakB !== streakA) return streakB - streakA;
            return String(a.name || '').localeCompare(String(b.name || ''));
          });

        const rank = members.findIndex((member) => member.id === user.id) + 1;

        return {
          id: group.id,
          name: group.name || group.id,
          description: group.description || '',
          memberCount: members.length,
          yourRank: rank > 0 ? rank : null,
          topMembers: members.slice(0, 3).map((member, index) => ({
            rank: index + 1,
            name: member.name || 'Unknown',
            accuracyPercent: Number(member.accuracyPercent) || 0,
            masteryLevel: member.masteryLevel || member.currentTier || 'Beginner',
            totalXp: Number(member.totalXp) || 0,
            profileImage: member.profileImage || null,
            isCurrentUser: member.id === user.id
          }))
        };
      });

    return res.json({ groups: userGroups });
  } catch (error) {
    console.error('[GET /api/me/groups]', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
