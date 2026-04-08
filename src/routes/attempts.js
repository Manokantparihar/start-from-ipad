const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const auth = require('../middlewares/auth');
const {
  syncUsersToGamification
} = require('../utils/gamification');

const router = express.Router();

// All attempt routes require authentication
router.use(auth);

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
    const attempt = {
      id: uuidv4(),
      userId: req.userId,
      quizId,
      quizTitle: quiz.title,
      status: 'in-progress',
      startedAt: now,
      expiresAt: now + 20 * 60 * 1000, // 20 minutes
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
    if (quiz && quiz.questions) {
      total = quiz.questions.length;
      for (const q of quiz.questions) {
        const userAns = attempt.answers.find(a => a.questionId === q.id);
        if (userAns && userAns.selected === q.correctAnswer) score++;
      }
    }
    attempt.score = score;
    attempt.total = total;

    attempts[idx] = attempt;
    await db.saveAttempts(attempts);

    try {
      const [users, events, groups, config] = await Promise.all([
        db.getUsers(),
        db.getEvents(),
        db.getGroups(),
        db.getGamificationConfig()
      ]);
      if (users.length > 0) {
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
