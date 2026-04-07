const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getAttempts, saveAttempts, getQuizzes } = require('../utils/db');

const router = express.Router();

// GET /api/attempts — list all attempts for the logged-in user, most recent first
router.get('/', async (req, res) => {
  try {
    const attempts = await getAttempts();
    const userAttempts = attempts
      .filter((a) => a.userId === req.userId)
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

    res.json(userAttempts);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/attempts — start a new attempt
router.post('/', async (req, res) => {
  try {
    const { quizId } = req.body;

    if (!quizId) {
      return res.status(400).json({ error: 'quizId is required' });
    }

    // Verify the quiz exists
    const quizzes = await getQuizzes();
    const quiz = quizzes.find((q) => q.id === quizId);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    const attempts = await getAttempts();

    // Remove any lingering in-progress attempts for this user + quiz
    const cleaned = attempts.filter(
      (a) =>
        !(
          a.userId === req.userId &&
          a.quizId === quizId &&
          a.status === 'in-progress'
        )
    );

    // Generate expiry based on the quiz's timeLimit (in minutes), server-side
    const timeLimitMinutes = quiz.timeLimit || 20;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + timeLimitMinutes * 60 * 1000).toISOString();

    const newAttempt = {
      id: uuidv4(),
      userId: req.userId,
      quizId,
      status: 'in-progress',
      answers: {},
      score: null,
      startedAt: now.toISOString(),
      expiresAt,
      submittedAt: null
    };

    cleaned.push(newAttempt);
    await saveAttempts(cleaned);

    res.status(201).json(newAttempt);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/attempts/:id/save — save attempt progress
router.put('/:id/save', async (req, res) => {
  try {
    const attempts = await getAttempts();
    const index = attempts.findIndex((a) => a.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    const attempt = attempts[index];

    // Only the owner can save
    if (attempt.userId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Only in-progress attempts can be saved
    if (attempt.status !== 'in-progress') {
      return res.status(400).json({ error: 'Attempt is no longer in progress' });
    }

    // Merge the provided answers (client sends partial or full answers object)
    const { answers } = req.body;
    if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
      attempt.answers = { ...attempt.answers, ...answers };
    }

    attempts[index] = attempt;
    await saveAttempts(attempts);

    res.json({ message: 'Progress saved', attempt });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/attempts/:id/submit — submit and grade attempt
router.post('/:id/submit', async (req, res) => {
  try {
    const attempts = await getAttempts();
    const index = attempts.findIndex((a) => a.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    const attempt = attempts[index];

    // Only the owner can submit
    if (attempt.userId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Only in-progress attempts can be submitted
    if (attempt.status !== 'in-progress') {
      return res.status(400).json({ error: 'Attempt is no longer in progress' });
    }

    // Accept any final answers from the request body before grading
    const { answers } = req.body;
    if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
      attempt.answers = { ...attempt.answers, ...answers };
    }

    // Determine if expired
    const now = new Date();
    const isExpired = now > new Date(attempt.expiresAt);

    // Fetch quiz for grading
    const quizzes = await getQuizzes();
    const quiz = quizzes.find((q) => q.id === attempt.quizId);

    let score = 0;
    let total = 0;

    if (quiz) {
      total = quiz.questions.length;
      for (const question of quiz.questions) {
        const given = attempt.answers[question.id];
        if (given !== undefined && given !== null && given === question.correctAnswer) {
          score++;
        }
      }
    }

    attempt.status = isExpired ? 'expired' : 'completed';
    attempt.score = { correct: score, total };
    attempt.submittedAt = now.toISOString();

    attempts[index] = attempt;
    await saveAttempts(attempts);

    res.json({
      message: isExpired ? 'Attempt submitted (expired)' : 'Attempt submitted successfully',
      attempt
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
