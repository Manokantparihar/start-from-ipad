const express = require('express');
const { getQuizzes } = require('../utils/db');

const router = express.Router();

// GET /api/quizzes — list all quizzes (id & title only)
router.get('/', async (req, res) => {
  try {
    const quizzes = await getQuizzes();
    const list = quizzes.map(({ id, title }) => ({ id, title }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/quizzes/:id — return quiz info + questions, never return correctAnswer
router.get('/:id', async (req, res) => {
  try {
    const quizzes = await getQuizzes();
    const quiz = quizzes.find((q) => q.id === req.params.id);

    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    // Strip correctAnswer and explanation from every question
    const safeQuestions = quiz.questions.map(
      ({ correctAnswer, explanation, ...rest }) => rest
    );

    res.json({
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      timeLimit: quiz.timeLimit,
      questions: safeQuestions
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
