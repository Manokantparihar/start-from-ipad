const db = require('./db');
const { buildAdaptiveRecommendation } = require('./adaptiveLearning');
const { getUnifiedRevisionState } = require('./revisionSystem');

async function getAdaptiveRecommendationForUser({
  userId,
  currentSummary = null,
  includeDeletedQuizzes = true,
  includeUnpublishedQuizzes = true,
  now = Date.now()
} = {}) {
  const [users, attempts, quizzes, revisionState] = await Promise.all([
    db.getUsers(),
    db.getAttempts(),
    db.getQuizzes({ includeDeleted: includeDeletedQuizzes, includeUnpublished: includeUnpublishedQuizzes }),
    getUnifiedRevisionState(userId)
  ]);

  const user = users.find((entry) => entry.id === userId) || null;

  const adaptive = buildAdaptiveRecommendation({
    userId,
    user,
    attempts,
    quizzes,
    wrongQuestions: revisionState.wrongQuestions,
    bookmarks: revisionState.bookmarks,
    currentSummary,
    now
  });

  return {
    adaptive,
    user,
    attempts,
    quizzes,
    revisionState
  };
}

module.exports = {
  getAdaptiveRecommendationForUser
};
