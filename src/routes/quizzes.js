const express = require('express');
const db = require('../utils/db');

const router = express.Router();

// GET /api/quizzes - list all quizzes (id and title only)
router.get('/', async (req, res) => {
  try {
    const quizzes = await db.getQuizzes();
    res.json(quizzes.map(({ id, title }) => ({ id, title })));
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/quizzes/:id - get a single quiz without correct answers
router.get('/:id', async (req, res) => {
  try {
    const quizzes = await db.getQuizzes();
    const quiz = quizzes.find(q => q.id === req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const questions = (quiz.questions || []).map(({ id, text, options }) => ({ id, text, options }));
    res.json({ id: quiz.id, title: quiz.title, questions });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
