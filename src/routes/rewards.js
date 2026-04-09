const express = require('express');
const db = require('../utils/db');
const { normalizeRewardRedemptions } = require('../utils/gamification');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const users = await db.getUsers();
    const user = users.find((entry) => entry.id === req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json({
      xpBalance: Math.max(0, Number(user.xpBalance) || Number(user.totalXp) || 0),
      activeBoost: null,
      rewards: [],
      rewardShopEnabled: false,
      redemptionHistory: normalizeRewardRedemptions(user.rewardRedemptions).slice(-20).reverse()
    });
  } catch (error) {
    console.error('[GET /api/rewards]', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/redeem', async (req, res) => {
  return res.status(410).json({
    error: 'Reward shop has been retired. Badges are now achievement-based only.'
  });
});

module.exports = router;
