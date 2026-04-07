const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const requireAuth = require('../middlewares/auth');

const router = express.Router();

// All routes in this file require a valid login cookie.
router.use(requireAuth);

/**
 * GET /api/attempts
 * Returns every attempt that belongs to the logged-in user.
 */
router.get('/', async (req, res) => {
  try {
    const attempts = await db.getAttempts();
    const userAttempts = attempts.filter((a) => a.userId === req.userId);
    res.json({ attempts: userAttempts });
  } catch (error) {
    console.error('GET /api/attempts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/attempts/start
 * Starts a new quiz attempt for the logged-in user.
 * Body: { quizId }
 */
router.post('/start', async (req, res) => {
  try {
    const { quizId } = req.body;

    if (!quizId) {
      return res.status(400).json({ error: 'quizId is required' });
    }

    const attempts = await db.getAttempts();

    const newAttempt = {
      id: uuidv4(),
      userId: req.userId,
      quizId,
      status: 'in-progress',
      answers: {},
      score: 0,
      startedAt: new Date().toISOString(),
      completedAt: null
    };

    attempts.push(newAttempt);
    await db.saveAttempts(attempts);

    res.status(201).json({ attempt: newAttempt });
  } catch (error) {
    console.error('POST /api/attempts/start error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/attempts/:id
 * Returns a single attempt — only if it belongs to the logged-in user.
 */
router.get('/:id', async (req, res) => {
  try {
    const attempts = await db.getAttempts();
    const attempt = attempts.find(
      (a) => a.id === req.params.id && a.userId === req.userId
    );

    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    res.json({ attempt });
  } catch (error) {
    console.error('GET /api/attempts/:id error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /api/attempts/:id/submit
 * Submits (completes) an attempt for the logged-in user.
 * Body: { answers }  — object mapping questionId -> selectedOption
 */
router.put('/:id/submit', async (req, res) => {
  try {
    const { answers } = req.body;

    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.status(400).json({ error: 'answers must be an object mapping questionId to selectedOption' });
    }

    const attempts = await db.getAttempts();

    const index = attempts.findIndex(
      (a) => a.id === req.params.id && a.userId === req.userId
    );

    if (index === -1) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    if (attempts[index].status === 'completed') {
      return res.status(400).json({ error: 'Attempt already submitted' });
    }

    attempts[index].answers = answers;
    attempts[index].status = 'completed';
    attempts[index].completedAt = new Date().toISOString();

    await db.saveAttempts(attempts);

    res.json({ attempt: attempts[index] });
  } catch (error) {
    console.error('PUT /api/attempts/:id/submit error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
