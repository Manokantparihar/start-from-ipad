const express = require('express');
const db = require('../utils/db');
const {
  buildPublicGamification,
  getCurrentWeekRange,
  getUserGroupIds,
  getUserMissionStateForDate,
  toUtcDateKey
} = require('../utils/gamification');

const router = express.Router();

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
    const users = await db.getUsers();
    const user = users.find((entry) => entry.id === req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const progress = buildPublicGamification(user);
    const todayKey = toUtcDateKey(new Date());

    return res.json({
      progress: {
        ...progress,
        week: getCurrentWeekRange(),
        dateKey: todayKey
      }
    });
  } catch (error) {
    console.error('[GET /api/me/progress]', error);
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
            const xpA = Number(a.totalXp) || 0;
            const xpB = Number(b.totalXp) || 0;
            if (xpB !== xpA) return xpB - xpA;
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
