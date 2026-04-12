const express = require('express');
const db = require('../utils/db');
const { syncUsersToGamification } = require('../utils/gamification');

const router = express.Router();

async function resyncGamificationAfterAttemptChanges(attemptsOverride = null) {
  const [users, quizzes, events, groups, config] = await Promise.all([
    db.getUsers(),
    db.getQuizzes({ includeDeleted: true, includeUnpublished: true }),
    db.getEvents(),
    db.getGroups(),
    db.getGamificationConfig()
  ]);

  const attempts = attemptsOverride || await db.getAttempts();
  const syncedUsers = await syncUsersToGamification({
    users,
    attempts,
    quizzes,
    events,
    groups,
    config
  });

  if (Array.isArray(syncedUsers) && syncedUsers.length > 0) {
    await db.saveUsers(syncedUsers);
  }
}

async function clearStaleRevisionDataForAttempt(userId, quizId, attempts) {
  const remainingCompletedForQuiz = attempts.some((attempt) => (
    attempt.userId === userId &&
    String(attempt.quizId || '') === String(quizId) &&
    ['completed', 'expired'].includes(attempt.status)
  ));

  if (remainingCompletedForQuiz) return;

  await db.deleteWrongQuestionsByUserAndQuiz(userId, quizId);

}

// DELETE /api/admin/attempts/:attemptId - delete one attempt
router.delete('/:attemptId', async (req, res) => {
  try {
    const attemptId = String(req.params.attemptId || '').trim();
    if (!attemptId) return res.status(400).json({ error: 'attemptId is required' });

    const { deletedCount, attempts, deletedAttempt } = await db.deleteAttemptById(attemptId);
    if (deletedCount === 0 || !deletedAttempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    await clearStaleRevisionDataForAttempt(deletedAttempt.userId, deletedAttempt.quizId, attempts);
    await resyncGamificationAfterAttemptChanges(attempts);

    return res.json({
      message: 'Attempt deleted.',
      deletedCount,
      attempt: {
        id: deletedAttempt.id,
        userId: deletedAttempt.userId,
        quizId: deletedAttempt.quizId,
        quizTitle: deletedAttempt.quizTitle,
        status: deletedAttempt.status
      }
    });
  } catch (error) {
    console.error('[DELETE /api/admin/attempts/:attemptId]', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
