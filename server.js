require('dotenv').config();

const app = require('./app');
const { syncUsersToGamification } = require('./src/utils/gamification');
const db = require('./src/utils/db');
const appConfig = require('./src/config');

const PORT = appConfig.port;

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