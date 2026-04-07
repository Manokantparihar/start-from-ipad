const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const auth = require('../middlewares/auth');

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

// PUT /api/attempts/:id/save - auto-save answers
router.put('/:id/save', async (req, res) => {
  try {
    let attempts = await db.getAttempts();
    const idx = attempts.findIndex(a => a.id === req.params.id && a.userId === req.userId);
    if (idx === -1) return res.status(404).json({ error: 'Attempt not found' });

    const attempt = attempts[idx];
    if (attempt.status !== 'in-progress') {
      return res.status(400).json({ error: 'Attempt is not in progress' });
    }

    attempt.answers = req.body.answers || [];
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
    let attempts = await db.getAttempts();
    const idx = attempts.findIndex(a => a.id === req.params.id && a.userId === req.userId);
    if (idx === -1) return res.status(404).json({ error: 'Attempt not found' });

    const attempt = attempts[idx];
    attempt.answers = req.body.answers || attempt.answers;
    attempt.completedAt = Date.now();
    attempt.status = Date.now() > attempt.expiresAt ? 'expired' : 'completed';

    // Grade the attempt
    const quizzes = await db.getQuizzes();
    const quiz = quizzes.find(q => q.id === attempt.quizId);
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

    res.json({ completed: true, score, total });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/attempts - get current user's attempt history
router.get('/', async (req, res) => {
  try {
    const attempts = await db.getAttempts();
    const userAttempts = attempts
      .filter(a => a.userId === req.userId)
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json(userAttempts);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
