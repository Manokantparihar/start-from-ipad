/**
 * Admin Bulk Import / Export API
 * All routes protected by auth + isAdmin middleware (applied in server.js).
 * Mounted at /api/admin
 *
 * Endpoints:
 *   POST /import/quizzes            – Import quizzes from CSV (multipart/form-data, field "file")
 *   POST /import/quizzes?preview=1  – Preview parsed rows without saving
 *   GET  /export/quizzes            – Export all quizzes as CSV download
 *   GET  /export/attempts           – Export all attempts as CSV download
 */
const express = require('express');
const multer = require('multer');
const db = require('../utils/db');

const router = express.Router();

// ─── MULTER (memory storage – files never touch disk) ─────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    // Accept CSV files only (by mimetype or extension)
    const allowed = [
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'text/plain'
    ];
    const okMime = allowed.includes(file.mimetype);
    const okExt = /\.csv$/i.test(file.originalname);
    if (okMime || okExt) return cb(null, true);
    cb(new Error('Only CSV files are accepted.'));
  }
});

// ─── CSV UTILITIES ────────────────────────────────────────────────────────────

/**
 * Parse a CSV string into an array of objects using the header row as keys.
 * Handles quoted fields containing commas and embedded quotes ("").
 * The caller (multer) already enforces a 5 MB file-size limit so content
 * length is bounded; the guard below is an additional safety check.
 */
function parseCSV(text) {
  // Guard against unexpectedly large input (multer limit is 5 MB)
  if (typeof text !== 'string' || text.length > 6 * 1024 * 1024) {
    throw new Error('CSV content too large.');
  }
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  if (nonEmpty.length < 2) return [];

  const headers = splitCSVRow(nonEmpty[0]).map(h => h.trim());
  const rows = [];

  for (let i = 1; i < nonEmpty.length; i++) {
    const values = splitCSVRow(nonEmpty[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

/**
 * Split a single CSV row into fields, respecting quoted fields.
 * Limited to rows of at most 1 MB to guard against unbounded iteration.
 */
function splitCSVRow(line) {
  // Guard against unusually long individual rows
  const safeLen = Math.min(line.length, 1024 * 1024);
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < safeLen; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Escape a value for CSV output. Wraps in quotes if the value contains
 * commas, quotes, or newlines.
 */
function escapeCSV(val) {
  const s = val == null ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Serialize an array of objects to a CSV string.
 */
function toCSV(rows, headers) {
  const head = headers.map(escapeCSV).join(',');
  const body = rows.map(row =>
    headers.map(h => escapeCSV(row[h])).join(',')
  );
  return [head, ...body].join('\n');
}

// ─── QUIZ CSV FORMAT ──────────────────────────────────────────────────────────
// One row = one question. Rows sharing the same quizTitle belong to the same quiz.
//
// Required columns:  quizTitle, mode, question, option1, option2, correctAnswer
// Optional columns:  topic, difficulty, timeLimit, isPublished, option3, option4,
//                    explanation, marks, negativeMarks, adminNotes

const QUIZ_IMPORT_REQUIRED = ['quizTitle', 'mode', 'question', 'option1', 'option2', 'correctAnswer'];
const VALID_MODES = ['daily', 'topic', 'mock'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

/**
 * Sanitize a string to prevent XSS.
 */
function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Parse and validate imported CSV rows into quiz objects ready for saving.
 * Returns { quizzes: [...], errors: [...] }
 */
function buildQuizzesFromRows(rows) {
  const errors = [];
  const quizMap = new Map(); // title → quiz draft

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // +2 because row 1 is header

    // Required field check
    for (const field of QUIZ_IMPORT_REQUIRED) {
      if (!row[field] || !String(row[field]).trim()) {
        errors.push({ row: rowNum, field, message: `"${field}" is required.` });
      }
    }

    if (errors.some(e => e.row === rowNum)) return; // skip row if missing required fields

    const title = sanitize(row.quizTitle.trim());
    const mode = row.mode.trim().toLowerCase();

    if (!VALID_MODES.includes(mode)) {
      errors.push({ row: rowNum, field: 'mode', message: `mode must be one of: ${VALID_MODES.join(', ')}.` });
      return;
    }

    // Build options array from option1–option4
    const options = [row.option1, row.option2, row.option3, row.option4]
      .filter(o => o && String(o).trim())
      .map(o => sanitize(String(o).trim()));

    const correctAnswer = sanitize(row.correctAnswer.trim());
    if (!options.includes(correctAnswer)) {
      errors.push({
        row: rowNum,
        field: 'correctAnswer',
        message: `correctAnswer "${correctAnswer}" must match one of the option values.`
      });
      return;
    }

    const difficulty = VALID_DIFFICULTIES.includes((row.difficulty || '').toLowerCase())
      ? row.difficulty.toLowerCase()
      : 'medium';

    const timeLimit = parseFloat(row.timeLimit) || 20;
    const marks = parseFloat(row.marks) || 1;
    const negativeMarks = parseFloat(row.negativeMarks) || 0;

    const question = {
      question: sanitize(row.question.trim()),
      options,
      correctAnswer,
      explanation: sanitize((row.explanation || '').trim()),
      topic: sanitize((row.topic || '').trim()),
      difficulty,
      marks,
      negativeMarks,
      isActive: true
    };

    if (!quizMap.has(title)) {
      const isPublished = ['true', '1', 'yes'].includes(
        String(row.isPublished || '').toLowerCase()
      );
      quizMap.set(title, {
        title,
        mode,
        topic: sanitize((row.topic || '').trim()),
        difficulty,
        timeLimit,
        isPublished,
        adminNotes: sanitize((row.adminNotes || '').trim()),
        questions: []
      });
    }

    quizMap.get(title).questions.push(question);
  });

  return {
    quizzes: Array.from(quizMap.values()),
    errors
  };
}

// ─── IMPORT ROUTES ────────────────────────────────────────────────────────────

/**
 * POST /api/admin/import/quizzes
 * Upload a CSV file to import quizzes.
 * Add ?preview=1 to validate and preview without saving.
 */
router.post('/import/quizzes', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Send a CSV as multipart field "file".' });
    }

    const text = req.file.buffer.toString('utf8');
    const rows = parseCSV(text);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'CSV is empty or has no data rows.' });
    }

    // Validate headers
    const headers = Object.keys(rows[0]);
    const missingHeaders = QUIZ_IMPORT_REQUIRED.filter(h => !headers.includes(h));
    if (missingHeaders.length) {
      return res.status(400).json({
        error: `CSV is missing required columns: ${missingHeaders.join(', ')}.`
      });
    }

    const { quizzes, errors } = buildQuizzesFromRows(rows);

    // Preview mode – return parsed data without saving
    if (req.query.preview === '1') {
      return res.json({
        preview: true,
        rowCount: rows.length,
        quizCount: quizzes.length,
        quizzes: quizzes.map(q => ({
          title: q.title,
          mode: q.mode,
          topic: q.topic,
          difficulty: q.difficulty,
          timeLimit: q.timeLimit,
          isPublished: q.isPublished,
          questionCount: q.questions.length,
          questions: q.questions
        })),
        errors
      });
    }

    if (errors.length) {
      return res.status(400).json({
        error: 'Validation errors found. Fix them or use ?preview=1 to inspect.',
        errors
      });
    }

    if (quizzes.length === 0) {
      return res.status(400).json({ error: 'No valid quizzes parsed from the CSV.' });
    }

    // Duplicate detection: skip quizzes whose titles already exist
    const existing = await db.getQuizzes({ includeDeleted: true, includeUnpublished: true });
    const existingTitles = new Set(existing.map(q => q.title.toLowerCase()));

    const toImport = [];
    const skipped = [];
    for (const q of quizzes) {
      if (existingTitles.has(q.title.toLowerCase())) {
        skipped.push(q.title);
      } else {
        toImport.push(q);
      }
    }

    const created = [];
    for (const q of toImport) {
      const quiz = await db.createQuiz({ ...q, createdBy: req.user.id });
      created.push({ id: quiz.id, title: quiz.title, questionCount: quiz.questionCount });
    }

    res.status(201).json({
      imported: created.length,
      skipped: skipped.length,
      skippedTitles: skipped,
      quizzes: created
    });
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum allowed size is 5 MB.' });
    }
    if (err.message === 'Only CSV files are accepted.') {
      return res.status(400).json({ error: err.message });
    }
    console.error('Import quizzes error:', err);
    res.status(500).json({ error: 'Server error during import.' });
  }
});

// ─── EXPORT ROUTES ────────────────────────────────────────────────────────────

/**
 * GET /api/admin/export/quizzes
 * Download all quizzes (including questions) as a CSV file.
 * One row per question; quiz metadata repeated on each row.
 */
router.get('/export/quizzes', async (req, res) => {
  try {
    const quizzes = await db.getQuizzes({ includeDeleted: false, includeUnpublished: true });

    const headers = [
      'quizTitle', 'mode', 'topic', 'difficulty', 'timeLimit', 'isPublished',
      'question', 'option1', 'option2', 'option3', 'option4',
      'correctAnswer', 'explanation', 'marks', 'negativeMarks'
    ];

    const rows = [];
    for (const quiz of quizzes) {
      const qs = quiz.questions || [];
      if (qs.length === 0) {
        // Export quiz row even if no questions
        rows.push({
          quizTitle: quiz.title,
          mode: quiz.mode,
          topic: quiz.topic || '',
          difficulty: quiz.difficulty || 'medium',
          timeLimit: quiz.timeLimit || 20,
          isPublished: quiz.isPublished ? 'true' : 'false',
          question: '',
          option1: '', option2: '', option3: '', option4: '',
          correctAnswer: '', explanation: '', marks: '', negativeMarks: ''
        });
      } else {
        for (const q of qs) {
          rows.push({
            quizTitle: quiz.title,
            mode: quiz.mode,
            topic: quiz.topic || '',
            difficulty: quiz.difficulty || 'medium',
            timeLimit: quiz.timeLimit || 20,
            isPublished: quiz.isPublished ? 'true' : 'false',
            question: q.question || '',
            option1: q.options[0] || '',
            option2: q.options[1] || '',
            option3: q.options[2] || '',
            option4: q.options[3] || '',
            correctAnswer: q.correctAnswer || '',
            explanation: q.explanation || '',
            marks: q.marks ?? 1,
            negativeMarks: q.negativeMarks ?? 0
          });
        }
      }
    }

    const csv = toCSV(rows, headers);
    const filename = `quizzes-export-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('Export quizzes error:', err);
    res.status(500).json({ error: 'Server error during export.' });
  }
});

/**
 * GET /api/admin/export/attempts
 * Download all quiz attempts as a CSV file.
 * No sensitive user info (no email/password) – only username.
 */
router.get('/export/attempts', async (req, res) => {
  try {
    const [users, attempts] = await Promise.all([db.getUsers(), db.getAttempts()]);

    const userMap = new Map();
    for (const u of users) {
      userMap.set(u.id, u.username || u.name || 'Unknown');
    }

    const headers = [
      'attemptId', 'username', 'quizTitle', 'score', 'total', 'percent',
      'status', 'completedAt'
    ];

    const rows = attempts.map(a => {
      const total = a.total || a.maxScore || 0;
      const score = a.score || 0;
      const pct = total ? Math.round((score / total) * 100) : 0;
      const completedAt = a.completedAt
        ? new Date(a.completedAt).toISOString()
        : '';
      return {
        attemptId: a.id,
        username: userMap.get(a.userId) || 'Unknown',
        quizTitle: a.quizTitle || a.quizId,
        score,
        total,
        percent: `${pct}%`,
        status: a.status || 'completed',
        completedAt
      };
    });

    const csv = toCSV(rows, headers);
    const filename = `attempts-export-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('Export attempts error:', err);
    res.status(500).json({ error: 'Server error during export.' });
  }
});

// Multer error handler (file-too-large, wrong type)
// eslint-disable-next-line no-unused-vars
router.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum allowed size is 5 MB.' });
  }
  if (err.message === 'Only CSV files are accepted.') {
    return res.status(400).json({ error: err.message });
  }
  console.error('Import/Export middleware error:', err);
  res.status(500).json({ error: 'Server error.' });
});

module.exports = router;
