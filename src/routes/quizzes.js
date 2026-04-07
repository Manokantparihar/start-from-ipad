const express = require('express');
const db = require('../utils/db');

const router = express.Router();

// GET /api/quizzes - list published, non-deleted quizzes (no correct answers)
router.get('/', async (req, res) => {
  try {
    const quizzes = await db.getQuizzes({ includeDeleted: false, includeUnpublished: false });
    res.json(quizzes.map(({ id, title, questions }) => ({
      id,
      title,
      questionCount: (questions || []).length
    })));
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/quizzes/:id - get a published quiz without correct answers
router.get('/:id', async (req, res) => {
  try {
    const quiz = await db.findQuizById(req.params.id);
    if (!quiz || quiz.isDeleted || !quiz.isPublished) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    // Strip correct answers from questions before sending to public
    const questions = (quiz.questions || []).map(q => ({
      id: q.id,
      text: q.question || q.text || '',
      options: q.options
    }));
    res.json({ id: quiz.id, title: quiz.title, questions });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
