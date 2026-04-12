const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const auth = require('../middlewares/auth');
const {
  syncUsersToGamification
} = require('../utils/gamification');
const { buildAdaptiveRecommendation } = require('../utils/adaptiveLearning');

const router = express.Router();
const MIN_COMPETITIVE_QUIZ_PARTICIPANTS = 3;

// All attempt routes require authentication
router.use(auth);

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getAttemptDurationSeconds(attempt) {
  const startedAt = toNumber(attempt.startedAt, 0);
  const completedAt = toNumber(attempt.completedAt || attempt.updatedAt || attempt.createdAt, 0);
  if (startedAt > 0 && completedAt > startedAt) {
    return Math.max(0, Math.round((completedAt - startedAt) / 1000));
  }
  return Math.max(0, toNumber(attempt.timeSpent, 0));
}

function getQuestionTopic(question, quiz) {
  return String(question.topic || quiz.topic || 'General').trim() || 'General';
}

function buildAttemptSummary(attempt, quiz) {
  const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
  const answers = Array.isArray(attempt.answers) ? attempt.answers : [];
  const answerMap = new Map(answers.map((answer) => [answer.questionId, answer.selected]));
  const reviewItems = [];
  const topicBuckets = new Map();

  let correctAnswers = 0;
  let incorrectAnswers = 0;
  let unattemptedQuestions = 0;

  const registerTopic = (topic, isCorrect, isAttempted) => {
    const key = String(topic || 'General').trim() || 'General';
    if (!topicBuckets.has(key)) {
      topicBuckets.set(key, {
        topic: key,
        questionCount: 0,
        correct: 0,
        incorrect: 0,
        unattempted: 0
      });
    }

    const bucket = topicBuckets.get(key);
    bucket.questionCount += 1;

    if (!isAttempted) {
      bucket.unattempted += 1;
      return;
    }

    if (isCorrect) bucket.correct += 1;
    else bucket.incorrect += 1;
  };

  for (const question of questions) {
    const selected = answerMap.has(question.id) ? answerMap.get(question.id) : null;
    const correctAnswer = question.correctAnswer;
    const isAttempted = selected !== null && selected !== undefined && selected !== '';
    const isCorrect = isAttempted && selected === correctAnswer;
    const topic = getQuestionTopic(question, quiz);

    if (isCorrect) correctAnswers += 1;
    else if (isAttempted) incorrectAnswers += 1;
    else unattemptedQuestions += 1;

    registerTopic(topic, isCorrect, isAttempted);

    reviewItems.push({
      questionId: question.id,
      question: String(question.question || question.text || '').trim(),
      options: Array.isArray(question.options) ? question.options : [],
      selected,
      correctAnswer,
      selectedText: selected === null || selected === undefined || selected === '' ? '' : String(selected),
      correctText: correctAnswer === null || correctAnswer === undefined ? '' : String(correctAnswer),
      isCorrect,
      isAttempted,
      topic,
      subtopic: question.subtopic || '',
      explanation: question.explanation || ''
    });
  }

  const totalQuestions = questions.length;
  const score = typeof attempt.score === 'number' ? attempt.score : correctAnswers;
  const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
  const attempted = correctAnswers + incorrectAnswers;
  const accuracy = attempted > 0 ? Math.round((correctAnswers / attempted) * 100) : 0;
  const timeTakenSeconds = getAttemptDurationSeconds(attempt);
  const averageTimePerQuestionSeconds = totalQuestions > 0 ? Math.round(timeTakenSeconds / totalQuestions) : 0;

  const topicPerformance = Array.from(topicBuckets.values())
    .map((entry) => ({
      ...entry,
      accuracy: entry.questionCount > 0 ? Math.round((entry.correct / entry.questionCount) * 100) : 0
    }))
    .sort((a, b) => {
      if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
      if (b.correct !== a.correct) return b.correct - a.correct;
      return a.topic.localeCompare(b.topic);
    });

  return {
    attemptId: attempt.id,
    quizId: attempt.quizId,
    quizTitle: attempt.quizTitle,
    status: attempt.status,
    score,
    percentage,
    accuracy,
    totalQuestions,
    correctAnswers,
    incorrectAnswers,
    unattemptedQuestions,
    timeTakenSeconds,
    averageTimePerQuestionSeconds,
    topicPerformance,
    strongestTopic: topicPerformance[0] || null,
    weakestTopic: topicPerformance.length > 0 ? topicPerformance[topicPerformance.length - 1] : null,
    reviewItems,
    completedAt: attempt.completedAt || attempt.createdAt
  };
}

function compareSummariesDesc(a, b) {
  if (a.score !== b.score) return b.score - a.score;
  if (a.percentage !== b.percentage) return b.percentage - a.percentage;
  if (a.accuracy !== b.accuracy) return b.accuracy - a.accuracy;
  if (a.timeTakenSeconds !== b.timeTakenSeconds) return a.timeTakenSeconds - b.timeTakenSeconds;
  return toNumber(a.completedAt, 0) - toNumber(b.completedAt, 0);
}

function getRankingForSummary(summary, others) {
  const rows = [...others, { userId: '__current__', summary }]
    .sort((left, right) => compareSummariesDesc(left.summary, right.summary));

  if (rows.length < MIN_COMPETITIVE_QUIZ_PARTICIPANTS) {
    return null;
  }

  const rank = rows.findIndex((entry) => entry.userId === '__current__') + 1;
  const totalParticipants = rows.length;
  const top = rows[0]?.summary || summary;
  const averageScore = totalParticipants > 0
    ? Math.round(rows.reduce((sum, entry) => sum + toNumber(entry.summary.score, 0), 0) / totalParticipants)
    : 0;
  const averagePercentage = totalParticipants > 0
    ? Math.round(rows.reduce((sum, entry) => sum + toNumber(entry.summary.percentage, 0), 0) / totalParticipants)
    : 0;

  return {
    quizRank: rank,
    percentile: totalParticipants > 0
      ? Math.max(1, Math.round(((totalParticipants - rank + 1) / totalParticipants) * 100))
      : 0,
    totalParticipants,
    topScore: {
      score: top.score,
      percentage: top.percentage
    },
    averageScore: {
      score: averageScore,
      percentage: averagePercentage
    }
  };
}

function sanitizeQuestionEntry(entry = {}) {
  const options = Array.isArray(entry.options) ? entry.options.map((opt) => String(opt)) : [];
  return {
    questionId: String(entry.questionId || '').trim(),
    question: String(entry.question || '').trim(),
    options,
    correctAnswer: entry.correctAnswer === undefined || entry.correctAnswer === null ? '' : String(entry.correctAnswer),
    topic: String(entry.topic || 'General').trim() || 'General',
    subtopic: String(entry.subtopic || '').trim(),
    quizId: String(entry.quizId || '').trim(),
    quizTitle: String(entry.quizTitle || '').trim(),
    savedAt: entry.savedAt || new Date().toISOString(),
    lastSeenAt: entry.lastSeenAt || new Date().toISOString(),
    timesWrong: Math.max(0, toNumber(entry.timesWrong, 0)),
    timesUnattempted: Math.max(0, toNumber(entry.timesUnattempted, 0))
  };
}

function ensureRevisionState(user = {}) {
  const revision = user.revision && typeof user.revision === 'object' ? user.revision : {};
  return {
    wrongQuestions: Array.isArray(revision.wrongQuestions) ? revision.wrongQuestions.map(sanitizeQuestionEntry) : [],
    bookmarks: Array.isArray(revision.bookmarks) ? revision.bookmarks.map(sanitizeQuestionEntry) : []
  };
}

function buildTopicGroups(items = []) {
  const groups = new Map();
  items.forEach((item) => {
    const topic = String(item.topic || 'General').trim() || 'General';
    if (!groups.has(topic)) {
      groups.set(topic, { topic, count: 0, questions: [] });
    }
    const bucket = groups.get(topic);
    bucket.count += 1;
    bucket.questions.push(item);
  });
  return Array.from(groups.values()).sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}

function buildRevisionPayload(revisionState) {
  const wrongQuestions = revisionState.wrongQuestions;
  const bookmarks = revisionState.bookmarks;
  const groupedByTopic = buildTopicGroups(wrongQuestions);
  const lastWrongQuestions = [...wrongQuestions]
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
    .slice(0, 20);
  const weakTopic = groupedByTopic[0]?.topic || null;
  const weakTopicQuestions = weakTopic
    ? wrongQuestions.filter((item) => item.topic === weakTopic).slice(0, 20)
    : [];
  const retryWrongQuestions = [...wrongQuestions]
    .sort((a, b) => b.timesWrong - a.timesWrong || new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
    .slice(0, 20);
  const retryUnattemptedQuestions = [...wrongQuestions]
    .filter((item) => (item.timesUnattempted || 0) > 0)
    .sort((a, b) => b.timesUnattempted - a.timesUnattempted || new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
    .slice(0, 20);

  return {
    totals: {
      wrongQuestions: wrongQuestions.length,
      bookmarkedQuestions: bookmarks.length,
      topicsInRevision: groupedByTopic.length
    },
    groupedByTopic,
    bookmarks,
    revisionSets: {
      lastWrongQuestions,
      weakTopic,
      weakTopicQuestions,
      retryWrongQuestions,
      retryUnattemptedQuestions
    }
  };
}

function upsertRevisionQuestion(wrongQuestions, nextEntry) {
  const idx = wrongQuestions.findIndex((item) => item.questionId === nextEntry.questionId);
  if (idx === -1) {
    wrongQuestions.push(nextEntry);
    return;
  }

  const current = wrongQuestions[idx];
  wrongQuestions[idx] = {
    ...current,
    ...nextEntry,
    timesWrong: Math.max(0, toNumber(current.timesWrong, 0) + toNumber(nextEntry.timesWrong, 0)),
    timesUnattempted: Math.max(0, toNumber(current.timesUnattempted, 0) + toNumber(nextEntry.timesUnattempted, 0))
  };
}

// GET /api/attempts/revision - revision dashboard payload
router.get('/revision', async (req, res) => {
  try {
    const users = await db.getUsers();
    const user = users.find((entry) => entry.id === req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const revisionState = ensureRevisionState(user);
    return res.json(buildRevisionPayload(revisionState));
  } catch (err) {
    console.error('[GET /api/attempts/revision]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/attempts/revision/bookmarks - add bookmark
router.post('/revision/bookmarks', async (req, res) => {
  try {
    const payload = sanitizeQuestionEntry(req.body || {});
    if (!payload.questionId || !payload.question) {
      return res.status(400).json({ error: 'questionId and question are required' });
    }

    const users = await db.getUsers();
    const idx = users.findIndex((entry) => entry.id === req.userId);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    const revisionState = ensureRevisionState(users[idx]);
    const exists = revisionState.bookmarks.some((item) => item.questionId === payload.questionId);
    if (!exists) {
      revisionState.bookmarks.push({
        ...payload,
        savedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      });
    }

    users[idx].revision = revisionState;
    await db.saveUsers(users);

    return res.status(exists ? 200 : 201).json({ saved: true });
  } catch (err) {
    console.error('[POST /api/attempts/revision/bookmarks]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/attempts/revision/bookmarks/:questionId - remove bookmark
router.delete('/revision/bookmarks/:questionId', async (req, res) => {
  try {
    const questionId = String(req.params.questionId || '').trim();
    if (!questionId) return res.status(400).json({ error: 'questionId is required' });

    const users = await db.getUsers();
    const idx = users.findIndex((entry) => entry.id === req.userId);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    const revisionState = ensureRevisionState(users[idx]);
    const before = revisionState.bookmarks.length;
    revisionState.bookmarks = revisionState.bookmarks.filter((item) => item.questionId !== questionId);

    users[idx].revision = revisionState;
    await db.saveUsers(users);

    return res.json({ removed: before !== revisionState.bookmarks.length });
  } catch (err) {
    console.error('[DELETE /api/attempts/revision/bookmarks/:questionId]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/attempts/revision/reconcile - reconcile wrong bank after revision retry
router.post('/revision/reconcile', async (req, res) => {
  try {
    const reviewItems = Array.isArray(req.body?.reviewItems) ? req.body.reviewItems : null;
    if (!reviewItems) {
      return res.status(400).json({ error: 'reviewItems must be an array' });
    }

    const context = req.body?.context || {};
    const contextQuizId = String(context.quizId || '').trim();

    const users = await db.getUsers();
    const idx = users.findIndex((entry) => entry.id === req.userId);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    const revisionState = ensureRevisionState(users[idx]);
    const solvedQuestionIds = new Set();
    const stillWrongEntries = [];
    const stillWrongTrack = [];

    reviewItems.forEach((item) => {
      const questionId = String(item?.questionId || '').trim();
      if (!questionId) return;

      const selected = item?.selected;
      const isAttempted = selected !== null && selected !== undefined && selected !== '';
      const isCorrect = Boolean(item?.isCorrect) || (isAttempted && selected === item?.correctAnswer);

      if (isCorrect) {
        solvedQuestionIds.add(questionId);
        return;
      }

      const sanitized = sanitizeQuestionEntry({
        questionId,
        question: item?.question || '',
        options: Array.isArray(item?.options) ? item.options : [],
        correctAnswer: item?.correctAnswer,
        topic: item?.topic || 'General',
        subtopic: item?.subtopic || '',
        quizId: String(item?.quizId || contextQuizId || '').trim(),
        quizTitle: String(item?.quizTitle || '').trim(),
        lastSeenAt: new Date().toISOString(),
        timesWrong: isAttempted ? 1 : 0,
        timesUnattempted: isAttempted ? 0 : 1
      });

      stillWrongEntries.push(sanitized);
      stillWrongTrack.push({
        questionId,
        quizId: sanitized.quizId,
        topic: sanitized.topic,
        selectedAnswer: isAttempted ? String(selected) : '',
        correctAnswer: sanitized.correctAnswer
      });
    });

    if (solvedQuestionIds.size > 0) {
      revisionState.wrongQuestions = revisionState.wrongQuestions.filter(
        (entry) => !solvedQuestionIds.has(String(entry.questionId || '').trim())
      );
    }

    stillWrongEntries.forEach((entry) => upsertRevisionQuestion(revisionState.wrongQuestions, entry));

    users[idx].revision = revisionState;
    await db.saveUsers(users);

    try {
      const currentWrongRows = await db.getWrongQuestions(req.userId);
      if (solvedQuestionIds.size > 0) {
        const rowsToRemove = currentWrongRows.filter((row) => solvedQuestionIds.has(String(row.questionId || '').trim()));
        for (const row of rowsToRemove) {
          await db.removeWrongQuestion(row.id);
        }
      }

      for (const trackEntry of stillWrongTrack) {
        await db.addWrongQuestion(req.userId, trackEntry);
      }
    } catch (syncErr) {
      console.error('[POST /api/attempts/revision/reconcile] wrong-questions sync failed:', syncErr);
    }

    return res.json({
      updated: true,
      resolvedCount: solvedQuestionIds.size,
      stillWrongCount: stillWrongEntries.length,
      remainingWrongQuestions: revisionState.wrongQuestions.length
    });
  } catch (err) {
    console.error('[POST /api/attempts/revision/reconcile]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/attempts - start a new attempt
router.post('/', async (req, res) => {
  try {
    const { quizId } = req.body;
    if (!quizId) return res.status(400).json({ error: 'quizId is required' });

    const quizzes = await db.getQuizzes();
    const quiz = quizzes.find(q => q.id === quizId);
    if (!quiz) return res.status(400).json({ error: 'Quiz not found' });

    let attempts = await db.getAttempts();

    // Remove previous in-progress attempts for this user+quiz
    attempts = attempts.filter(
      a => !(a.userId === req.userId && a.quizId === quizId && a.status === 'in-progress')
    );

    const now = Date.now();
    const quizTimeLimitMinutes = Number(quiz.timeLimit);
    const effectiveTimeLimitMinutes =
      Number.isFinite(quizTimeLimitMinutes) && quizTimeLimitMinutes > 0
        ? quizTimeLimitMinutes
        : 20;
    const attempt = {
      id: uuidv4(),
      userId: req.userId,
      quizId,
      quizTitle: quiz.title,
      status: 'in-progress',
      startedAt: now,
      expiresAt: now + effectiveTimeLimitMinutes * 60 * 1000,
      timeLimitMinutes: effectiveTimeLimitMinutes,
      answers: [],
      createdAt: now
    };
    attempts.push(attempt);
    await db.saveAttempts(attempts);

    res.json({ attemptId: attempt.id, expiresAt: attempt.expiresAt });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/attempts/:id/insights - rich result analytics for one attempt
router.get('/:id/insights', async (req, res) => {
  try {
    const [attempts, users, allQuizzes, wrongQuestions, bookmarks] = await Promise.all([
      db.getAttempts(),
      db.getUsers(),
      db.getQuizzes({ includeDeleted: true, includeUnpublished: true }),
      db.getWrongQuestions(req.userId),
      db.getBookmarks(req.userId)
    ]);
    const attempt = attempts.find((entry) => entry.id === req.params.id && entry.userId === req.userId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

    const quiz = allQuizzes.find((entry) => entry.id === attempt.quizId);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const currentSummary = buildAttemptSummary(attempt, quiz);
    const user = users.find((entry) => entry.id === req.userId) || null;

    const sameQuizAttempts = attempts.filter((entry) => (
      entry.quizId === attempt.quizId &&
      ['completed', 'expired'].includes(entry.status) &&
      toNumber(entry.total, 0) > 0
    ));

    const bestByUser = new Map();
    sameQuizAttempts.forEach((entry) => {
      if (entry.userId === attempt.userId) return;
      const summary = buildAttemptSummary(entry, quiz);
      const existing = bestByUser.get(entry.userId);
      if (!existing || compareSummariesDesc(summary, existing.summary) < 0) {
        bestByUser.set(entry.userId, { userId: entry.userId, summary });
      }
    });

    const ranking = getRankingForSummary(currentSummary, Array.from(bestByUser.values()));

    const previousAttempt = sameQuizAttempts
      .filter((entry) => entry.userId === attempt.userId && entry.id !== attempt.id)
      .sort((a, b) => toNumber(b.completedAt || b.createdAt, 0) - toNumber(a.completedAt || a.createdAt, 0))[0] || null;

    const previousSummary = previousAttempt ? buildAttemptSummary(previousAttempt, quiz) : null;
    const previousRanking = previousSummary ? getRankingForSummary(previousSummary, Array.from(bestByUser.values())) : null;

    const comparison = previousSummary ? {
      previousAttemptId: previousSummary.attemptId,
      scoreChange: currentSummary.score - previousSummary.score,
      rankChange: previousRanking?.quizRank && ranking?.quizRank
        ? previousRanking.quizRank - ranking.quizRank
        : null,
      accuracyChange: currentSummary.accuracy - previousSummary.accuracy,
      previousScore: previousSummary.score,
      previousPercentage: previousSummary.percentage,
      previousAccuracy: previousSummary.accuracy,
      previousRank: previousRanking?.quizRank || null
    } : null;

    const adaptive = buildAdaptiveRecommendation({
      userId: req.userId,
      user,
      attempts,
      quizzes: allQuizzes,
      wrongQuestions,
      bookmarks,
      currentSummary
    });

    return res.json({
      ...currentSummary,
      ranking,
      comparison,
      adaptive,
      recommendedNextQuiz: adaptive.recommendation,
      topicPriorities: adaptive.priorityTopics
    });
  } catch (err) {
    console.error('[GET /api/attempts/:id/insights]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/attempts/:id/review - get a single completed attempt with per-question breakdown (owner only)
router.get('/:id/review', async (req, res) => {
  try {
    const attempts = await db.getAttempts();
    const attempt = attempts.find(a => a.id === req.params.id && a.userId === req.userId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

    // Look up quiz (including deleted/unpublished) so old attempts still work
    const allQuizzes = await db.getQuizzes({ includeDeleted: true, includeUnpublished: true });
    const quiz = allQuizzes.find(q => q.id === attempt.quizId);

    let breakdown = [];
    if (quiz && Array.isArray(quiz.questions)) {
      breakdown = quiz.questions.map(q => {
        const userAns = (attempt.answers || []).find(a => a.questionId === q.id);
        const selected = userAns ? userAns.selected : null;
        return {
          questionId: q.id,
          question: q.question || q.text || '',
          options: q.options || [],
          correctAnswer: q.correctAnswer,
          selected,
          isCorrect: selected !== null && selected === q.correctAnswer,
          explanation: q.explanation || ''
        };
      });
    }

    const maxScore = typeof attempt.total === 'number' ? attempt.total : 0;
    const score = typeof attempt.score === 'number' ? attempt.score : 0;
    const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

    res.json({
      id: attempt.id,
      quizId: attempt.quizId,
      quizTitle: attempt.quizTitle,
      status: attempt.status,
      date: attempt.completedAt || attempt.createdAt,
      score,
      maxScore,
      percent,
      type: quiz ? (quiz.mode || 'topic') : 'topic',
      breakdown
    });
  } catch (err) {
    console.error('[GET /api/attempts/:id/review]', err);
    res.status(500).json({ error: 'Server error' });
  }
});
router.get('/:id', async (req, res) => {
  try {
    const attempts = await db.getAttempts();
    const attempt = attempts.find(a => a.id === req.params.id && a.userId === req.userId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    res.json(attempt);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/attempts/:id/save - auto-save answers
router.put('/:id/save', async (req, res) => {
  try {
    const { answers } = req.body;
    if (!Array.isArray(answers)) {
      return res.status(400).json({ error: 'answers must be an array' });
    }

    let attempts = await db.getAttempts();
    const idx = attempts.findIndex(a => a.id === req.params.id && a.userId === req.userId);
    if (idx === -1) return res.status(404).json({ error: 'Attempt not found' });

    const attempt = attempts[idx];
    if (attempt.status !== 'in-progress') {
      return res.status(400).json({ error: 'Attempt is not in progress' });
    }

    attempt.answers = answers;
    attempt.updatedAt = Date.now();
    attempts[idx] = attempt;
    await db.saveAttempts(attempts);

    res.json({ saved: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/attempts/:id/submit - submit and grade the attempt
router.post('/:id/submit', async (req, res) => {
  try {
    const submittedAnswers = req.body.answers;
    if (!Array.isArray(submittedAnswers)) {
      return res.status(400).json({ error: 'answers must be an array' });
    }

    let attempts = await db.getAttempts();
    const idx = attempts.findIndex(a => a.id === req.params.id && a.userId === req.userId);
    if (idx === -1) return res.status(404).json({ error: 'Attempt not found' });

    const attempt = attempts[idx];
    if (attempt.status !== 'in-progress') {
      return res.status(400).json({ error: 'Attempt already submitted' });
    }
    attempt.answers = submittedAnswers;
    attempt.completedAt = Date.now();
    attempt.status = Date.now() > attempt.expiresAt ? 'expired' : 'completed';

    // Grade the attempt – look up quiz including deleted/unpublished
    // so existing in-progress attempts can still be submitted
    const allQuizzes = await db.getQuizzes({ includeDeleted: true, includeUnpublished: true });
    const quiz = allQuizzes.find(q => q.id === attempt.quizId);
    let score = 0;
    let total = 0;
    const revisionUpdates = [];
    const wrongQuestionsToTrack = []; // For tracking in wrong-questions.json
    
    if (quiz && quiz.questions) {
      total = quiz.questions.length;
      for (const q of quiz.questions) {
        const userAns = attempt.answers.find(a => a.questionId === q.id);
        const selected = userAns ? userAns.selected : null;
        const isAttempted = selected !== null && selected !== undefined && selected !== '';
        const isCorrect = isAttempted && selected === q.correctAnswer;

        if (isCorrect) {
          score++;
          continue;
        }

        const topic = getQuestionTopic(q, quiz);
        revisionUpdates.push(sanitizeQuestionEntry({
          questionId: q.id,
          question: q.question || q.text || '',
          options: Array.isArray(q.options) ? q.options : [],
          correctAnswer: q.correctAnswer,
          topic,
          subtopic: q.subtopic || '',
          quizId: attempt.quizId,
          quizTitle: attempt.quizTitle,
          lastSeenAt: new Date().toISOString(),
          timesWrong: isAttempted ? 1 : 0,
          timesUnattempted: isAttempted ? 0 : 1
        }));

        // Track for wrong-questions.json
        wrongQuestionsToTrack.push({
          questionId: q.id,
          quizId: attempt.quizId,
          topic,
          selectedAnswer: selected || '',
          correctAnswer: q.correctAnswer || ''
        });
      }
    }
    attempt.score = score;
    attempt.total = total;

    attempts[idx] = attempt;
    await db.saveAttempts(attempts);

    // Track wrong questions in wrong-questions.json for revision system
    try {
      for (const wrongQuestion of wrongQuestionsToTrack) {
        await db.addWrongQuestion(req.userId, wrongQuestion);
      }
    } catch (revisionErr) {
      console.error('[POST /api/attempts/:id/submit] tracking wrong questions failed:', revisionErr);
      // Don't fail the submission if revision tracking fails
    }

    try {
      const [users, events, groups, config] = await Promise.all([
        db.getUsers(),
        db.getEvents(),
        db.getGroups(),
        db.getGamificationConfig()
      ]);
      if (users.length > 0) {
        const userIdx = users.findIndex((entry) => entry.id === req.userId);
        if (userIdx !== -1 && revisionUpdates.length > 0) {
          const revisionState = ensureRevisionState(users[userIdx]);
          revisionUpdates.forEach((entry) => upsertRevisionQuestion(revisionState.wrongQuestions, entry));
          users[userIdx].revision = revisionState;
        }

        const syncedUsers = await syncUsersToGamification({
          users,
          attempts,
          quizzes: allQuizzes,
          events,
          groups,
          config
        });
        if (syncedUsers.length > 0) {
          await db.saveUsers(syncedUsers);
        } else {
        await db.saveUsers(users);
        }
      }
    } catch (gamificationErr) {
      console.error('[POST /api/attempts/:id/submit] gamification sync failed:', gamificationErr);
    }

    res.json({ completed: true, score, total });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/attempts - get current user's attempt history (enriched with percent, maxScore, type)
// Optional query params: ?type=mock|topic|daily  ?status=completed|in-progress|expired
// Optional pagination: ?page=1&limit=20 (when provided, returns { attempts, total, page, limit, totalPages })
router.get('/', async (req, res) => {
  try {
    const allAttempts = await db.getAttempts();
    // Load quizzes (including deleted) so we can look up mode/type for any attempt
    const allQuizzes = await db.getQuizzes({ includeDeleted: true, includeUnpublished: true });
    const quizMap = {};
    for (const q of allQuizzes) quizMap[q.id] = q;

    let userAttempts = allAttempts
      .filter(a => a.userId === req.userId)
      .sort((a, b) => b.createdAt - a.createdAt);

    // Enrich each attempt with computed fields
    userAttempts = userAttempts.map(a => {
      const quiz = quizMap[a.quizId] || {};
      const maxScore = typeof a.total === 'number' ? a.total : 0;
      const score = typeof a.score === 'number' ? a.score : 0;
      const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
      return {
        ...a,
        maxScore,
        percent,
        type: quiz.mode || 'topic',
        topic: quiz.topic || '',
        date: a.completedAt || a.createdAt
      };
    });

    // Apply filters
    const { type, status } = req.query;
    if (type) userAttempts = userAttempts.filter(a => a.type === type);
    if (status) userAttempts = userAttempts.filter(a => a.status === status);

    // Pagination (only when ?page is explicitly provided)
    const pageParam = req.query.page;
    if (pageParam !== undefined) {
      const page = Math.max(1, parseInt(pageParam, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
      const total = userAttempts.length;
      const totalPages = Math.ceil(total / limit) || 1;
      const start = (page - 1) * limit;
      const paginated = userAttempts.slice(start, start + limit);
      return res.json({ attempts: paginated, total, page, limit, totalPages });
    }

    res.json(userAttempts);
  } catch (err) {
    console.error('[GET /api/attempts]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
