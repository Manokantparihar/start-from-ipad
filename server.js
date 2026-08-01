require('dotenv').config();

const app = require('./app');
const { syncUsersToGamification } = require('./src/utils/gamification');
const db = require('./src/utils/db');

let bootstrapped = false;

async function bootstrapGamification() {
  if (bootstrapped) return;

  const [users, attempts, quizzes, events, groups, gamificationConfig] =
    await Promise.all([
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
  bootstrapped = true;
}

app.use(async (req, res, next) => {
  try {
    await bootstrapGamification();
  } catch (err) {
    console.error(err);
  }
  next();
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 5500;

  app.listen(PORT, () => {
    console.log(`🚀 Server running on ${PORT}`);
  });
}