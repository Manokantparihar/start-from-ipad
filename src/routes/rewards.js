const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const {
  normalizeBadgeList,
  normalizeRewardRedemptions,
  syncUsersToGamification
} = require('../utils/gamification');

const router = express.Router();

function normalizeRewardCatalog(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((reward) => reward && reward.id)
    .map((reward) => ({
      id: String(reward.id),
      title: String(reward.title || reward.id),
      description: String(reward.description || ''),
      costXp: Math.max(0, Number(reward.costXp) || 0),
      rarity: String(reward.rarity || 'common'),
      type: String(reward.type || 'utility'),
      effect: reward.effect || {},
      repeatable: reward.repeatable !== false,
      enabled: reward.enabled !== false
    }))
    .filter((reward) => reward.enabled);
}

async function loadSyncContext() {
  const [users, attempts, quizzes, events, groups, config] = await Promise.all([
    db.getUsers(),
    db.getAttempts(),
    db.getQuizzes({ includeDeleted: true, includeUnpublished: true }),
    db.getEvents(),
    db.getGroups(),
    db.getGamificationConfig()
  ]);

  return { users, attempts, quizzes, events, groups, config };
}

router.get('/', async (req, res) => {
  try {
    const [users, rewardsRaw] = await Promise.all([db.getUsers(), db.getRewards()]);
    const user = users.find((entry) => entry.id === req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const rewards = normalizeRewardCatalog(rewardsRaw);

    return res.json({
      xpBalance: Math.max(0, Number(user.xpBalance) || 0),
      activeBoost: user.activeBoost || null,
      rewards,
      redemptionHistory: normalizeRewardRedemptions(user.rewardRedemptions).slice(-20).reverse()
    });
  } catch (error) {
    console.error('[GET /api/rewards]', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/redeem', async (req, res) => {
  try {
    const rewardId = String(req.body?.rewardId || '').trim();
    if (!rewardId) return res.status(400).json({ error: 'rewardId is required' });

    const [rewardsRaw, syncContext] = await Promise.all([db.getRewards(), loadSyncContext()]);
    const rewards = normalizeRewardCatalog(rewardsRaw);
    const reward = rewards.find((entry) => entry.id === rewardId);

    if (!reward) {
      return res.status(404).json({ error: 'Reward not found' });
    }

    const users = syncContext.users;
    const userIndex = users.findIndex((entry) => entry.id === req.userId);
    if (userIndex === -1) return res.status(404).json({ error: 'User not found' });

    const user = users[userIndex];
    const xpBalance = Math.max(0, Number(user.xpBalance) || 0);

    if (xpBalance < reward.costXp) {
      return res.status(400).json({
        error: 'Insufficient XP balance',
        xpBalance,
        requiredXp: reward.costXp
      });
    }

    if (!reward.repeatable) {
      const hasRedeemed = normalizeRewardRedemptions(user.rewardRedemptions)
        .some((entry) => entry.rewardId === reward.id);
      if (hasRedeemed) {
        return res.status(400).json({ error: 'Reward already redeemed' });
      }
    }

    const redemption = {
      id: uuidv4(),
      rewardId: reward.id,
      title: reward.title,
      costXp: reward.costXp,
      redeemedAt: new Date().toISOString(),
      effect: reward.effect || {},
      metadata: {
        type: reward.type,
        rarity: reward.rarity
      }
    };

    const redemptions = normalizeRewardRedemptions(user.rewardRedemptions);
    redemptions.push(redemption);

    user.rewardRedemptions = redemptions;

    const effect = reward.effect || {};
    if (effect.type === 'refill-streak-freeze') {
      const freeze = user.streakFreeze || {};
      user.streakFreeze = {
        maxCount: 1,
        availableCount: 1,
        usedCount: 0,
        lastConsumedOn: freeze.lastConsumedOn || null
      };
    }

    if (effect.type === 'theme-unlock' && effect.themeKey) {
      const themes = new Set(Array.isArray(user.unlockedThemes) ? user.unlockedThemes : []);
      themes.add(String(effect.themeKey));
      user.unlockedThemes = Array.from(themes);
    }

    if (effect.type === 'badge-unlock' && effect.badgeId) {
      const existingBadges = normalizeBadgeList(user.badges);
      if (!existingBadges.some((badge) => badge.id === effect.badgeId)) {
        existingBadges.push({
          id: effect.badgeId,
          title: effect.badgeTitle || reward.title,
          description: effect.badgeDescription || reward.description,
          category: effect.badgeCategory || 'shop',
          rarity: effect.badgeRarity || reward.rarity || 'rare',
          unlockedAt: new Date().toISOString()
        });
      }
      user.badges = existingBadges;
    }

    users[userIndex] = user;

    const syncedUsers = await syncUsersToGamification({
      users,
      attempts: syncContext.attempts,
      quizzes: syncContext.quizzes,
      events: syncContext.events,
      groups: syncContext.groups,
      config: syncContext.config
    });

    await db.saveUsers(syncedUsers);

    const updatedUser = syncedUsers.find((entry) => entry.id === req.userId) || user;

    return res.json({
      message: 'Reward redeemed successfully',
      redemption,
      xpBalance: Math.max(0, Number(updatedUser.xpBalance) || 0),
      activeBoost: updatedUser.activeBoost || null,
      streakFreeze: updatedUser.streakFreeze || null,
      latestBadge: updatedUser.latestBadge || null
    });
  } catch (error) {
    console.error('[POST /api/rewards/redeem]', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
