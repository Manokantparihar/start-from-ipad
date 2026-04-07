const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const db = require('../utils/db');

const router = express.Router();

// Helper: read the master questions file (questions.json is keyed differently)
async function getAllQuestions() {
  try {
    const filePath = path.join(__dirname, '../../data/questions.json');
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    // questions.json stores data as { questions: [...] }
    return Array.isArray(parsed) ? parsed : (parsed.questions || []);
  } catch {
    return [];
  }
}

// GET /api/quizzes — list all quizzes (id and title only)
router.get('/', async (req, res) => {
  try {
    const quizzes = await db.getQuizzes();
    const list = quizzes.map(({ id, title, description, timeLimit, createdAt }) => ({
      id,
      title,
      description,
      timeLimit,
      createdAt
    }));
    res.json({ quizzes: list });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/quizzes/:id — quiz info + questions WITHOUT correct answers
router.get('/:id', async (req, res) => {
  try {
    const quizzes = await db.getQuizzes();
    const quiz = quizzes.find((q) => q.id === req.params.id);

    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    const allQuestions = await getAllQuestions();

    // Strip correctAnswer and explanation from each question
    const questions = quiz.questions
      .map((qId) => {
        const q = allQuestions.find((item) => item.id === qId);
        if (!q) return null;
        // Return only safe fields
        const { correctAnswer, explanation, ...safeQuestion } = q;
        return safeQuestion;
      })
      .filter(Boolean);

    res.json({
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      timeLimit: quiz.timeLimit,
      createdAt: quiz.createdAt,
      questions
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
