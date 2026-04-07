const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middlewares/auth');
const db = require('../utils/db');

const router = express.Router();

// All attempts routes require authentication
router.use(requireAuth);

// Helper: read master questions (needed for grading)
async function getAllQuestions() {
  try {
    const filePath = path.join(__dirname, '../../data/questions.json');
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return Array.isArray(parsed) ? parsed : (parsed.questions || []);
  } catch {
    return [];
  }
}

// POST /api/attempts — start a new attempt
router.post('/', async (req, res) => {
  try {
    const userId = req.userId; // always from middleware, never client
    const { quizId } = req.body;

    if (!quizId) {
      return res.status(400).json({ error: 'quizId is required' });
    }

    // Verify the quiz exists
    const quizzes = await db.getQuizzes();
    const quiz = quizzes.find((q) => q.id === quizId);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    const attempts = await db.getAttempts();

    // Enforce single active in-progress attempt per user per quiz
    const existingActive = attempts.find(
      (a) => a.userId === userId && a.quizId === quizId && a.status === 'in-progress'
    );
    if (existingActive) {
      return res.status(409).json({
        error: 'You already have an in-progress attempt for this quiz',
        attemptId: existingActive.id
      });
    }

    const now = new Date();
    const expiresAt = quiz.timeLimit
      ? new Date(now.getTime() + quiz.timeLimit * 1000).toISOString()
      : null;

    const newAttempt = {
      id: uuidv4(),
      userId,
      quizId,
      status: 'in-progress',
      answers: {},
      score: null,
      total: quiz.questions.length,
      createdAt: now.toISOString(),
      expiresAt,
      submittedAt: null
    };

    attempts.push(newAttempt);
    await db.saveAttempts(attempts);

    res.status(201).json({ message: 'Attempt started', attempt: newAttempt });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/attempts/:id/save — save answers for an in-progress attempt
router.put('/:id/save', async (req, res) => {
  try {
    const userId = req.userId;
    const { answers } = req.body; // { questionId: selectedOptionIndex, ... }

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'answers object is required' });
    }

    const attempts = await db.getAttempts();
    const idx = attempts.findIndex((a) => a.id === req.params.id);

    if (idx === -1) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    const attempt = attempts[idx];

    if (attempt.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (attempt.status !== 'in-progress') {
      return res.status(400).json({ error: 'Attempt is not in progress' });
    }

    // Check expiry
    if (attempt.expiresAt && new Date() > new Date(attempt.expiresAt)) {
      return res.status(400).json({ error: 'Attempt has expired' });
    }

    // Merge saved answers (allow partial saves)
    attempts[idx].answers = { ...attempt.answers, ...answers };

    await db.saveAttempts(attempts);

    res.json({ message: 'Answers saved', answers: attempts[idx].answers });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/attempts/:id/submit — submit and grade an attempt
router.post('/:id/submit', async (req, res) => {
  try {
    const userId = req.userId;
    const { answers } = req.body; // optional final answers to merge before grading

    const attempts = await db.getAttempts();
    const idx = attempts.findIndex((a) => a.id === req.params.id);

    if (idx === -1) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    const attempt = attempts[idx];

    if (attempt.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (attempt.status !== 'in-progress') {
      return res.status(400).json({ error: 'Attempt already submitted' });
    }

    // Merge any final answers supplied with submission
    const finalAnswers = answers && typeof answers === 'object'
      ? { ...attempt.answers, ...answers }
      : attempt.answers;

    // Grade: look up correct answers from questions.json
    const quizzes = await db.getQuizzes();
    const quiz = quizzes.find((q) => q.id === attempt.quizId);

    if (!quiz) {
      return res.status(500).json({ error: 'Quiz data not found for this attempt' });
    }

    const allQuestions = await getAllQuestions();

    let score = 0;
    const results = {};
    quiz.questions.forEach((qId) => {
      const question = allQuestions.find((q) => q.id === qId);
      if (!question) return;
      const userAnswer = finalAnswers[qId];
      const correct = question.correctAnswer;
      const isCorrect = userAnswer !== undefined && Number(userAnswer) === correct;
      if (isCorrect) score += 1;
      results[qId] = {
        userAnswer: userAnswer !== undefined ? Number(userAnswer) : null,
        correctAnswer: correct,
        isCorrect
      };
    });

    // Update attempt record
    attempts[idx] = {
      ...attempt,
      answers: finalAnswers,
      status: 'submitted',
      score,
      submittedAt: new Date().toISOString()
    };

    await db.saveAttempts(attempts);

    res.json({
      message: 'Attempt submitted',
      score,
      total: attempt.total,
      results
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/attempts — list attempt history for the logged-in user, most recent first
router.get('/', async (req, res) => {
  try {
    const userId = req.userId;

    const attempts = await db.getAttempts();
    const quizzes = await db.getQuizzes();

    const userAttempts = attempts
      .filter((a) => a.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((a) => {
        const quiz = quizzes.find((q) => q.id === a.quizId);
        return {
          id: a.id,
          quizId: a.quizId,
          quizTitle: quiz ? quiz.title : 'Unknown Quiz',
          status: a.status,
          score: a.score,
          total: a.total,
          createdAt: a.createdAt,
          expiresAt: a.expiresAt,
          submittedAt: a.submittedAt
        };
      });

    res.json({ attempts: userAttempts });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
