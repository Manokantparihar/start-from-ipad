/**
 * Admin Quiz CRUD API
 * All routes protected by auth + isAdmin middleware.
 * Mounted at /api/admin/quizzes in server.js
 *
 * How to make a user admin (dev): open data/users.json, find the user, set "role": "admin"
 */
const express = require('express');
const db = require('../utils/db');

const router = express.Router();

// ─── VALIDATION ──────────────────────────────────────────────────────────────

const VALID_MODES = ['daily', 'topic', 'mock'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

function validateQuiz(body, isUpdate = false) {
  const errors = [];

  if (!isUpdate || body.title !== undefined) {
    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      errors.push({ field: 'title', message: 'Title is required.' });
    }
  }

  if (!isUpdate || body.mode !== undefined) {
    if (!body.mode || !VALID_MODES.includes(body.mode)) {
      errors.push({ field: 'mode', message: `Mode must be one of: ${VALID_MODES.join(', ')}.` });
    }
  }

  if (body.difficulty !== undefined && !VALID_DIFFICULTIES.includes(body.difficulty)) {
    errors.push({ field: 'difficulty', message: `Difficulty must be one of: ${VALID_DIFFICULTIES.join(', ')}.` });
  }

  if (body.timeLimit !== undefined) {
    const tl = Number(body.timeLimit);
    if (!Number.isFinite(tl) || tl <= 0) {
      errors.push({ field: 'timeLimit', message: 'timeLimit must be a positive number (minutes).' });
    }
  }

  if (body.questions !== undefined) {
    if (!Array.isArray(body.questions)) {
      errors.push({ field: 'questions', message: 'questions must be an array.' });
    } else {
      const seenIds = new Set();
      body.questions.forEach((q, i) => {
        const prefix = `questions[${i}]`;

        const qText = (q.question || q.text || '').trim();
        if (!qText) {
          errors.push({ field: `${prefix}.question`, message: 'Question text cannot be empty.' });
        }

        if (!Array.isArray(q.options) || q.options.length < 2) {
          errors.push({ field: `${prefix}.options`, message: 'Each question must have at least 2 options.' });
        } else {
          q.options.forEach((opt, oi) => {
            if (!opt || !String(opt).trim()) {
              errors.push({ field: `${prefix}.options[${oi}]`, message: 'Option text cannot be empty.' });
            }
          });

          // correctAnswer must be one of the option values
          if (q.correctAnswer === undefined || q.correctAnswer === null || q.correctAnswer === '') {
            errors.push({ field: `${prefix}.correctAnswer`, message: 'correctAnswer is required.' });
          } else if (!q.options.includes(q.correctAnswer)) {
            errors.push({
              field: `${prefix}.correctAnswer`,
              message: 'correctAnswer must match one of the option values.'
            });
          }
        }

        if (q.id) {
          if (seenIds.has(q.id)) {
            errors.push({ field: `${prefix}.id`, message: `Duplicate question id "${q.id}".` });
          }
          seenIds.add(q.id);
        }

        if (q.marks !== undefined && (typeof q.marks !== 'number' || q.marks < 0)) {
          errors.push({ field: `${prefix}.marks`, message: 'marks must be a non-negative number.' });
        }
        if (q.negativeMarks !== undefined && (typeof q.negativeMarks !== 'number' || q.negativeMarks < 0)) {
          errors.push({ field: `${prefix}.negativeMarks`, message: 'negativeMarks must be a non-negative number.' });
        }
      });
    }
  }

  return errors;
}

// Sanitize string inputs to avoid XSS/injection
function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sanitizeQuizBody(body) {
  const s = { ...body };
  if (s.title) s.title = sanitize(s.title.trim());
  if (s.description) s.description = sanitize(s.description.trim());
  if (s.topic) s.topic = sanitize(s.topic.trim());
  if (s.adminNotes) s.adminNotes = sanitize(s.adminNotes.trim());
  if (Array.isArray(s.questions)) {
    s.questions = s.questions.map(q => {
      const sanitizedOptions = Array.isArray(q.options)
        ? q.options.map(o => sanitize(String(o).trim()))
        : [];
      // correctAnswer must be a string matching one of the option values exactly
      // Sanitize it the same way options are sanitized so the match still works
      const sanitizedCorrect = q.correctAnswer !== undefined
        ? sanitize(String(q.correctAnswer).trim())
        : '';
      return {
        ...q,
        question: sanitize((q.question || q.text || '').trim()),
        options: sanitizedOptions,
        correctAnswer: sanitizedCorrect,
        explanation: q.explanation ? sanitize(q.explanation.trim()) : '',
        topic: q.topic ? sanitize(q.topic.trim()) : ''
      };
    });
  }
  return s;
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/quizzes
 * List all quizzes (including drafts and soft-deleted).
 * Supports query: ?search=, ?mode=, ?topic=, ?status=published|draft|deleted
 */
router.get('/', async (req, res) => {
  try {
    const { search, mode, topic, status } = req.query;

    const includeDeleted = status === 'deleted' || !status;
    const includeUnpublished = status !== 'published';

    let quizzes = await db.getQuizzes({ includeDeleted: true, includeUnpublished: true });

    // Status filter
    if (status === 'published') quizzes = quizzes.filter(q => q.isPublished && !q.isDeleted);
    else if (status === 'draft') quizzes = quizzes.filter(q => !q.isPublished && !q.isDeleted);
    else if (status === 'deleted') quizzes = quizzes.filter(q => q.isDeleted);
    // else return all

    if (search) {
      const term = search.toLowerCase();
      quizzes = quizzes.filter(q =>
        q.title.toLowerCase().includes(term) ||
        (q.description || '').toLowerCase().includes(term)
      );
    }
    if (mode) quizzes = quizzes.filter(q => q.mode === mode);
    if (topic) quizzes = quizzes.filter(q => q.topic === topic);

    // Return summary list (full data minus questions details for list view)
    res.json(quizzes.map(q => ({
      id: q.id,
      title: q.title,
      slug: q.slug,
      mode: q.mode,
      topic: q.topic,
      difficulty: q.difficulty,
      timeLimit: q.timeLimit,
      isPublished: q.isPublished,
      isDeleted: q.isDeleted,
      questionCount: (q.questions || []).length,
      createdBy: q.createdBy,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt
    })));
  } catch (err) {
    console.error('Admin list quizzes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/admin/quizzes/:id
 * Full quiz detail including correct answers (admin only).
 */
router.get('/:id', async (req, res) => {
  try {
    const quiz = await db.findQuizById(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    res.json(quiz);
  } catch (err) {
    console.error('Admin get quiz error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/admin/quizzes
 * Create a new quiz (starts as draft unless isPublished: true).
 */
router.post('/', async (req, res) => {
  try {
    const body = sanitizeQuizBody(req.body);
    const errors = validateQuiz(body, false);
    if (errors.length) return res.status(400).json({ errors });

    const quiz = await db.createQuiz({
      ...body,
      createdBy: req.user.id
    });
    res.status(201).json(quiz);
  } catch (err) {
    console.error('Admin create quiz error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /api/admin/quizzes/:id
 * Full update of a quiz.
 */
router.put('/:id', async (req, res) => {
  try {
    const existing = await db.findQuizById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Quiz not found' });

    const body = sanitizeQuizBody(req.body);
    const errors = validateQuiz(body, true);
    if (errors.length) return res.status(400).json({ errors });

    const updated = await db.updateQuiz(req.params.id, body);
    res.json(updated);
  } catch (err) {
    console.error('Admin update quiz error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PATCH /api/admin/quizzes/:id/publish
 * Toggle publish/unpublish. Body: { isPublished: true|false }
 */
router.patch('/:id/publish', async (req, res) => {
  try {
    const quiz = await db.findQuizById(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    if (quiz.isDeleted) return res.status(400).json({ error: 'Cannot publish a deleted quiz.' });

    const isPublished = req.body.isPublished === true || req.body.isPublished === 'true';
    const updated = await db.updateQuiz(req.params.id, { isPublished });
    res.json({ id: updated.id, isPublished: updated.isPublished });
  } catch (err) {
    console.error('Admin publish quiz error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/admin/quizzes/:id/duplicate
 * Duplicate a quiz as a new draft.
 */
router.post('/:id/duplicate', async (req, res) => {
  try {
    const quiz = await db.findQuizById(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const copy = await db.duplicateQuiz(req.params.id, req.user.id);
    res.status(201).json(copy);
  } catch (err) {
    console.error('Admin duplicate quiz error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /api/admin/quizzes/:id
 * Soft-delete a quiz (sets isDeleted: true). Pass ?hard=1 for permanent delete.
 */
router.delete('/:id', async (req, res) => {
  try {
    const quiz = await db.findQuizById(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const hardDelete = req.query.hard === '1';
    await db.deleteQuiz(req.params.id, !hardDelete);
    res.json({ deleted: true, hard: hardDelete });
  } catch (err) {
    console.error('Admin delete quiz error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PATCH /api/admin/quizzes/:id/reorder
 * Reorder questions. Body: { questions: [...ordered question objects or ids] }
 */
router.patch('/:id/reorder', async (req, res) => {
  try {
    const quiz = await db.findQuizById(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const { questions } = req.body;
    if (!Array.isArray(questions)) {
      return res.status(400).json({ error: 'questions must be an array of question objects.' });
    }

    // If passed just IDs, reorder by id
    let reordered;
    if (questions.length && typeof questions[0] === 'string') {
      const qMap = new Map((quiz.questions || []).map(q => [q.id, q]));
      reordered = questions.map(id => qMap.get(id)).filter(Boolean);
    } else {
      reordered = questions;
    }

    const updated = await db.updateQuiz(req.params.id, { questions: reordered });
    res.json({ id: updated.id, questions: updated.questions });
  } catch (err) {
    console.error('Admin reorder quiz error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
