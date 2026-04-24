const pool = require('./db.pg');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { normalizeGamificationFields } = require('./gamification');

const DATA_DIR = path.join(__dirname, '../../data');
const writeQueues = new Map();

// Generic read
async function readFile(filename) {
  const filePath = path.join(DATA_DIR, `${filename}.json`);
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// Generic write
async function writeFile(filename, data) {
  const filePath = path.join(DATA_DIR, `${filename}.json`);
  const existingQueue = writeQueues.get(filePath) || Promise.resolve();
  const queuedWrite = existingQueue
    .catch(() => {
      // Keep queue alive even after a previous rejection.
    })
    .then(async () => {
      const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const payload = JSON.stringify(data, null, 2);
      await fs.writeFile(tempPath, payload, 'utf8');
      await fs.rename(tempPath, filePath);
    });

  writeQueues.set(filePath, queuedWrite);
  try {
    await queuedWrite;
  } finally {
    if (writeQueues.get(filePath) === queuedWrite) {
      writeQueues.delete(filePath);
    }
  }
}

function normalizeUser(user) {
  const gamification = normalizeGamificationFields(user);
  const streak = user.streak || {};

  return {
    ...user,
    ...gamification,
    streak: {
      currentStreak: gamification.currentStreak,
      bestStreak: gamification.bestStreak,
      lastActiveDate: gamification.lastActiveDate || streak.lastActiveDate || null,
      updatedAt: streak.updatedAt || user.gamificationUpdatedAt || null
    },
    latestBadge: gamification.badges.length > 0 ? gamification.badges[gamification.badges.length - 1] : null
  };
}

// USERS
const getUsers = async () => {
  try {
    const res = await pool.query('SELECT * FROM users ORDER BY created_at ASC');

    if (res.rows.length > 0) {
      return res.rows.map((row) => {
        const data = row.data && typeof row.data === 'object' ? row.data : {};

        return normalizeUser({
          ...data,
          id: data.id || row.id,
          name: data.name || row.name,
          email: data.email || row.email,
          role: data.role || row.role || 'user'
        });
      });
    }

    return (await readFile('users')).map(normalizeUser);
  } catch (err) {
    console.error('DB users read failed, fallback JSON', err.message);
    return (await readFile('users')).map(normalizeUser);
  }
};

const saveUsers = async (users) => {
  const normalizedUsers = users.map(normalizeUser);

  try {
    for (const user of normalizedUsers) {
      await pool.query(
        `
        INSERT INTO users (
          id,
          name,
          email,
          role,
          data
        )
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          role = EXCLUDED.role,
          data = EXCLUDED.data
        `,
        [
          user.id,
          user.name || '',
          user.email || null,
          user.role || 'user',
          JSON.stringify(user)
        ]
      );
    }

    // JSON backup
    await writeFile('users', normalizedUsers);
  } catch (err) {
    console.error('DB users write failed, fallback JSON', err.message);
    await writeFile('users', normalizedUsers);
  }
};

// ATTEMPTS
const getAttempts = async () => {
  try {
    const res = await pool.query('SELECT * FROM attempts');

    if (res.rows.length > 0) {
  return res.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    quizId: row.quiz_id,
    score: row.score === null ? undefined : Number(row.score),
    total: row.total === null ? undefined : Number(row.total),
    status: row.status,
    startedAt: row.started_at === null ? undefined : Number(row.started_at),
    completedAt: row.completed_at === null ? undefined : Number(row.completed_at),
    answers: Array.isArray(row.answers) ? row.answers : []
  }));
}

    return readFile('attempts');
  } catch (err) {
    console.error('DB read failed, fallback JSON', err.message);
    return readFile('attempts');
  }
};

const saveAttempts = async (attempts) => {
  try {
    for (const attempt of attempts) {
      await pool.query(
        `
        INSERT INTO attempts (
  id,
  user_id,
  quiz_id,
  score,
  total,
  status,
  started_at,
  completed_at,
  answers
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  quiz_id = EXCLUDED.quiz_id,
  score = EXCLUDED.score,
  total = EXCLUDED.total,
  status = EXCLUDED.status,
  started_at = EXCLUDED.started_at,
  completed_at = EXCLUDED.completed_at,
  answers = EXCLUDED.answers
        `,
        [
  attempt.id,
  attempt.userId || null,
  attempt.quizId || null,
  attempt.score ?? null,
  attempt.total ?? null,
  attempt.status || null,
  attempt.startedAt || null,
  attempt.completedAt || null,
  JSON.stringify(attempt.answers || [])
]
      );
    }

    // keep JSON as backup
    await writeFile('attempts', attempts);

  } catch (err) {
    console.error('DB write failed, fallback JSON', err.message);
    await writeFile('attempts', attempts);
  }
};

async function deleteAttemptsByUser(userId) {
  const attempts = await readFile('attempts');
  const filtered = attempts.filter((attempt) => attempt.userId !== userId);
  const deletedCount = attempts.length - filtered.length;
  if (deletedCount > 0) {
    await writeFile('attempts', filtered);
  }
  return { deletedCount, attempts: filtered };
}

async function deleteAttemptsByUserAndQuiz(userId, quizId) {
  const attempts = await readFile('attempts');
  const filtered = attempts.filter(
    (attempt) => !(attempt.userId === userId && String(attempt.quizId) === String(quizId))
  );
  const deletedCount = attempts.length - filtered.length;
  if (deletedCount > 0) {
    await writeFile('attempts', filtered);
  }
  return { deletedCount, attempts: filtered };
}

async function deleteAttemptById(attemptId) {
  const attempts = await readFile('attempts');
  const target = attempts.find((attempt) => attempt.id === attemptId) || null;
  const filtered = attempts.filter((attempt) => attempt.id !== attemptId);
  const deletedCount = attempts.length - filtered.length;
  if (deletedCount > 0) {
    await writeFile('attempts', filtered);
  }
  return { deletedCount, attempts: filtered, deletedAttempt: target };
}

// ─── QUIZ DB HELPERS (migration-friendly) ────────────────────────────────────

/**
 * Get quizzes with optional filters.
 * @param {object} opts
 * @param {boolean} opts.includeDeleted    - include soft-deleted quizzes (default false)
 * @param {boolean} opts.includeUnpublished - include draft/unpublished quizzes (default false)
 */
async function getQuizzes({ includeDeleted = false, includeUnpublished = false } = {}) {
  const all = await readFile('quizzes');
  return all.filter(q => {
    if (!includeDeleted && q.isDeleted) return false;
    if (!includeUnpublished && !q.isPublished) return false;
    return true;
  });
}

const saveQuizzes = (quizzes) => writeFile('quizzes', quizzes);

async function findQuizById(id) {
  const all = await readFile('quizzes');
  return all.find(q => q.id === id) || null;
}

async function createQuiz(quizData) {
  const all = await readFile('quizzes');
  const now = new Date().toISOString();
  const quiz = {
    id: uuidv4(),
    title: quizData.title,
    slug: quizData.slug || generateSlug(quizData.title),
    description: quizData.description || '',
    mode: quizData.mode || 'topic',
    topic: quizData.topic || '',
    difficulty: quizData.difficulty || 'medium',
    timeLimit: quizData.timeLimit || 20,
    isPublished: quizData.isPublished === true,
    isDeleted: false,
    createdBy: quizData.createdBy || null,
    createdAt: now,
    updatedAt: now,
    adminNotes: quizData.adminNotes || '',
    questions: (quizData.questions || []).map(normalizeQuestion)
  };
  quiz.questionCount = quiz.questions.length;
  all.push(quiz);
  await writeFile('quizzes', all);
  return quiz;
}

async function updateQuiz(id, changes) {
  const all = await readFile('quizzes');
  const idx = all.findIndex(q => q.id === id);
  if (idx === -1) return null;
  const existing = all[idx];
  const updated = {
    ...existing,
    ...changes,
    id: existing.id, // never change id
    createdAt: existing.createdAt, // never change createdAt
    updatedAt: new Date().toISOString()
  };
  if (changes.title && !changes.slug) {
    updated.slug = generateSlug(changes.title);
  }
  if (changes.questions) {
    updated.questions = changes.questions.map(normalizeQuestion);
  }
  updated.questionCount = (updated.questions || []).length;
  all[idx] = updated;
  await writeFile('quizzes', all);
  return updated;
}

async function deleteQuiz(id, softDelete = true) {
  const all = await readFile('quizzes');
  const idx = all.findIndex(q => q.id === id);
  if (idx === -1) return false;
  if (softDelete) {
    all[idx].isDeleted = true;
    all[idx].updatedAt = new Date().toISOString();
    await writeFile('quizzes', all);
  } else {
    all.splice(idx, 1);
    await writeFile('quizzes', all);
  }
  return true;
}

async function duplicateQuiz(id, userId) {
  const all = await readFile('quizzes');
  const original = all.find(q => q.id === id);
  if (!original) return null;
  const now = new Date().toISOString();
  const copy = {
    ...JSON.parse(JSON.stringify(original)),
    id: uuidv4(),
    title: `${original.title} (Copy)`,
    slug: generateSlug(`${original.title} copy`),
    isPublished: false,
    isDeleted: false,
    createdBy: userId,
    createdAt: now,
    updatedAt: now
  };
  all.push(copy);
  await writeFile('quizzes', all);
  return copy;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function generateSlug(title) {
  // Limit length first to prevent any performance issues with long inputs
  const safe = String(title).slice(0, 200);
  return safe
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')   // spaces → dashes (separate pass avoids ReDoS)
    .replace(/_/g, '-')      // underscores → dashes
    .replace(/-{2,}/g, '-')  // collapse multiple dashes
    .replace(/^-|-$/g, '');  // trim leading/trailing dashes
}

function normalizeQuestion(q) {
  return {
    id: q.id || uuidv4(),
    question: q.question || q.text || '',
    options: Array.isArray(q.options) ? q.options : [],
    correctAnswer: q.correctAnswer !== undefined ? q.correctAnswer : '',
    explanation: q.explanation || '',
    topic: q.topic || '',
    difficulty: q.difficulty || 'medium',
    marks: typeof q.marks === 'number' ? q.marks : 1,
    negativeMarks: typeof q.negativeMarks === 'number' ? q.negativeMarks : 0,
    isActive: q.isActive !== false
  };
}

// RESOURCES (PDFs / Notes / Assignments)
const getResources = () => readFile('resources');
const saveResources = (resources) => writeFile('resources', resources);

// COURSES / LESSONS
const getCourses = () => readFile('courses');
const saveCourses = (courses) => writeFile('courses', courses);
const getLessons = () => readFile('lessons');
const saveLessons = (lessons) => writeFile('lessons', lessons);

// NOTIFICATIONS
const getNotifications = async () => {
  try {
    const res = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC');

    if (res.rows.length > 0) {
      return res.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        message: row.message,
        type: row.type,
        read: row.is_read === true,
        isRead: row.is_read === true,
        archived: row.is_archived === true,
        isArchived: row.is_archived === true,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined
      }));
    }

    return readFile('notifications');
  } catch (err) {
    console.error('DB notifications read failed, fallback JSON', err.message);
    return readFile('notifications');
  }
};
const saveNotifications = async (notifications) => {
  try {
    for (const n of notifications) {
      await pool.query(
        `
        INSERT INTO notifications (
          id,
          user_id,
          title,
          message,
          type,
          is_read,
          is_archived,
          created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          title = EXCLUDED.title,
          message = EXCLUDED.message,
          type = EXCLUDED.type,
          is_read = EXCLUDED.is_read,
          is_archived = EXCLUDED.is_archived,
          created_at = EXCLUDED.created_at
        `,
        [
          n.id,
          n.userId || null,
          n.title || '',
          n.message || '',
          n.type || null,
          n.read !== undefined ? n.read === true : n.isRead === true,
          n.archived !== undefined ? n.archived === true : n.isArchived === true,
          n.createdAt ? new Date(n.createdAt) : new Date()
        ]
      );
    }

    // JSON backup (safe fallback)
    await writeFile('notifications', notifications);

  } catch (err) {
    console.error('DB notifications write failed, fallback JSON', err.message);
    await writeFile('notifications', notifications);
  }
};

// NOTIFICATION LOGS (admin broadcast history)
const getNotificationLogs = () => readFile('notification-logs');
const saveNotificationLogs = (logs) => writeFile('notification-logs', logs);

// PHASE 3: Events / Groups / Rewards / Config
const getEvents = () => readFile('events');
const saveEvents = (events) => writeFile('events', events);

const getGroups = () => readFile('groups');
const saveGroups = (groups) => writeFile('groups', groups);

const getRewards = () => readFile('rewards');
const saveRewards = (rewards) => writeFile('rewards', rewards);

async function getGamificationConfig() {
  const rows = await readFile('gamification-config');
  if (Array.isArray(rows)) {
    return rows[0] || {};
  }
  return rows || {};
}

async function saveGamificationConfig(config = {}) {
  return writeFile('gamification-config', [config]);
}

// ─── REVISION SYSTEM (Wrong Questions & Bookmarks) ───────────────────────────────

function normalizeWrongQuestionRow(row = {}, userId) {
  const now = new Date().toISOString();
  const questionId = String(row.questionId || '').trim();
  return {
    id: row.id || uuidv4(),
    userId,
    questionId,
    quizId: String(row.quizId || '').trim(),
    topic: String(row.topic || 'General').trim() || 'General',
    selectedAnswer: row.selectedAnswer === undefined || row.selectedAnswer === null ? '' : String(row.selectedAnswer),
    correctAnswer: row.correctAnswer === undefined || row.correctAnswer === null ? '' : String(row.correctAnswer),
    status: String(row.status || (row.selectedAnswer === undefined || row.selectedAnswer === null || row.selectedAnswer === '' ? 'unattempted' : 'wrong')).trim() || 'wrong',
    timesMissed: Number.isFinite(Number(row.timesMissed)) ? Number(row.timesMissed) : 1,
    timestamp: row.timestamp || row.firstSeenAt || now,
    firstSeenAt: row.firstSeenAt || row.timestamp || now,
    lastSeenAt: row.lastSeenAt || row.updatedAt || row.timestamp || now,
    updatedAt: row.updatedAt || row.lastSeenAt || row.timestamp || now,
    lastOutcome: row.lastOutcome || String(row.status || (row.selectedAnswer === undefined || row.selectedAnswer === null || row.selectedAnswer === '' ? 'unattempted' : 'wrong')).trim() || 'wrong'
  };
}

function getWrongQuestionKey(userId, questionId) {
  return `${String(userId || '').trim()}::${String(questionId || '').trim()}`;
}

function mergeWrongQuestionRows(rows = []) {
  const merged = new Map();

  rows.forEach((row) => {
    const normalized = normalizeWrongQuestionRow(row, row.userId);
    if (!normalized.userId || !normalized.questionId) return;

    const key = getWrongQuestionKey(normalized.userId, normalized.questionId);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, normalized);
      return;
    }

    const existingTime = new Date(existing.updatedAt || existing.lastSeenAt || existing.timestamp || 0).getTime();
    const candidateTime = new Date(normalized.updatedAt || normalized.lastSeenAt || normalized.timestamp || 0).getTime();
    const selected = candidateTime >= existingTime ? normalized : existing;
    const other = candidateTime >= existingTime ? existing : normalized;

    merged.set(key, {
      ...selected,
      timesMissed: Math.max(Number(selected.timesMissed) || 0, Number(other.timesMissed) || 0),
      firstSeenAt: selected.firstSeenAt || other.firstSeenAt || selected.timestamp || other.timestamp,
      timestamp: selected.timestamp || other.timestamp,
      lastSeenAt: selected.lastSeenAt || other.lastSeenAt,
      updatedAt: selected.updatedAt || other.updatedAt,
      lastOutcome: selected.lastOutcome || other.lastOutcome
    });
  });

  return Array.from(merged.values());
}

/**
 * Get all wrong questions for a user
 * Returns unique canonical rows keyed by userId + questionId.
 */
async function getWrongQuestions(userId) {
  try {
    const res = await pool.query(
      `
      SELECT *
      FROM wrong_questions
      WHERE user_id = $1
      ORDER BY updated_at DESC NULLS LAST, last_seen_at DESC NULLS LAST
      `,
      [userId]
    );

    if (res.rows.length > 0) {
      return res.rows.map((row) => {
        const data = row.data && typeof row.data === 'object' ? row.data : {};

        return normalizeWrongQuestionRow({
          ...data,
          id: data.id || row.id,
          userId: data.userId || row.user_id,
          questionId: data.questionId || row.question_id,
          quizId: data.quizId || row.quiz_id || '',
          topic: data.topic || row.topic || 'General',
          selectedAnswer:
            data.selectedAnswer !== undefined ? data.selectedAnswer : row.selected_answer || '',
          correctAnswer:
            data.correctAnswer !== undefined ? data.correctAnswer : row.correct_answer || '',
          status: data.status || row.status || 'wrong',
          timesMissed:
            data.timesMissed !== undefined ? data.timesMissed : Number(row.times_missed) || 1,
          firstSeenAt:
            data.firstSeenAt || (row.first_seen_at ? new Date(row.first_seen_at).toISOString() : undefined),
          lastSeenAt:
            data.lastSeenAt || (row.last_seen_at ? new Date(row.last_seen_at).toISOString() : undefined),
          updatedAt:
            data.updatedAt || (row.updated_at ? new Date(row.updated_at).toISOString() : undefined),
          timestamp:
            data.timestamp || data.firstSeenAt || (row.first_seen_at ? new Date(row.first_seen_at).toISOString() : undefined),
          lastOutcome: data.lastOutcome || row.status || 'wrong'
        }, userId);
      });
    }

    const all = await readFile('wrong-questions');
    const filtered = Array.isArray(all) ? all.filter((w) => w.userId === userId) : [];
    const deduped = mergeWrongQuestionRows(filtered);

    if (deduped.length !== filtered.length) {
      const remaining = Array.isArray(all) ? all.filter((entry) => entry.userId !== userId) : [];
      await writeFile('wrong-questions', [...remaining, ...deduped]);
    }

    return deduped;
  } catch (err) {
    console.error('DB wrong questions read failed, fallback JSON', err.message);

    const all = await readFile('wrong-questions');
    const filtered = Array.isArray(all) ? all.filter((w) => w.userId === userId) : [];
    const deduped = mergeWrongQuestionRows(filtered);

    if (deduped.length !== filtered.length) {
      const remaining = Array.isArray(all) ? all.filter((entry) => entry.userId !== userId) : [];
      await writeFile('wrong-questions', [...remaining, ...deduped]);
    }

    return deduped;
  }
}

/**
 * Add or update a wrong question (called after quiz submission)
 */
async function addWrongQuestion(userId, data) {
  const all = await readFile('wrong-questions');
  const filtered = Array.isArray(all) ? all : [];
  const questionId = String(data.questionId || '').trim();
  const key = getWrongQuestionKey(userId, questionId);
  const now = new Date().toISOString();
  const status = String(data.status || (data.selectedAnswer === undefined || data.selectedAnswer === null || data.selectedAnswer === '' ? 'unattempted' : 'wrong')).trim() || 'wrong';
  const existingIndex = filtered.findIndex((row) => getWrongQuestionKey(row.userId, row.questionId) === key);
  const existing = existingIndex >= 0 ? normalizeWrongQuestionRow(filtered[existingIndex], userId) : null;

  const nextRow = {
    ...(existing || {}),
    id: existing?.id || uuidv4(),
    userId,
    questionId,
    quizId: String(data.quizId || existing?.quizId || '').trim(),
    topic: String(data.topic || existing?.topic || 'General').trim() || 'General',
    selectedAnswer: data.selectedAnswer === undefined || data.selectedAnswer === null ? (existing?.selectedAnswer || '') : String(data.selectedAnswer),
    correctAnswer: data.correctAnswer === undefined || data.correctAnswer === null ? (existing?.correctAnswer || '') : String(data.correctAnswer),
    status,
    timesMissed: (Number(existing?.timesMissed) || 0) + 1,
    timestamp: existing?.timestamp || now,
    firstSeenAt: existing?.firstSeenAt || existing?.timestamp || now,
    lastSeenAt: now,
    updatedAt: now,
    lastOutcome: status
  };

  try {
    await pool.query(
      `
      INSERT INTO wrong_questions (
        id,
        user_id,
        question_id,
        quiz_id,
        topic,
        selected_answer,
        correct_answer,
        status,
        times_missed,
        first_seen_at,
        last_seen_at,
        updated_at,
        data
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (user_id, question_id) DO UPDATE SET
        quiz_id = EXCLUDED.quiz_id,
        topic = EXCLUDED.topic,
        selected_answer = EXCLUDED.selected_answer,
        correct_answer = EXCLUDED.correct_answer,
        status = EXCLUDED.status,
        times_missed = wrong_questions.times_missed + 1,
        first_seen_at = COALESCE(wrong_questions.first_seen_at, EXCLUDED.first_seen_at),
        last_seen_at = EXCLUDED.last_seen_at,
        updated_at = EXCLUDED.updated_at,
        data = EXCLUDED.data
      `,
      [
        nextRow.id,
        nextRow.userId,
        nextRow.questionId,
        nextRow.quizId || null,
        nextRow.topic || 'General',
        nextRow.selectedAnswer || '',
        nextRow.correctAnswer || '',
        nextRow.status || 'wrong',
        Number(nextRow.timesMissed) || 1,
        nextRow.firstSeenAt ? new Date(nextRow.firstSeenAt) : new Date(),
        nextRow.lastSeenAt ? new Date(nextRow.lastSeenAt) : new Date(),
        nextRow.updatedAt ? new Date(nextRow.updatedAt) : new Date(),
        JSON.stringify(nextRow)
      ]
    );
  } catch (err) {
    console.error('DB wrong question write failed, fallback JSON', err.message);
  }

  const nextRows = existingIndex >= 0
    ? [...filtered.slice(0, existingIndex), nextRow, ...filtered.slice(existingIndex + 1)]
    : [...filtered, nextRow];

  const deduped = mergeWrongQuestionRows(nextRows);
  await writeFile('wrong-questions', deduped);
  return nextRow;
}

/**
 * Remove a wrong question entry
 */
async function removeWrongQuestion(id) {
  try {
    await pool.query('DELETE FROM wrong_questions WHERE id = $1', [id]);
  } catch (err) {
    console.error('DB wrong question delete failed, fallback JSON', err.message);
  }

  const all = await readFile('wrong-questions');
  const filtered = all.filter(w => w.id !== id);
  await writeFile('wrong-questions', filtered);
}

async function replaceWrongQuestionsForUser(userId, nextWrongQuestions = []) {
  const all = await readFile('wrong-questions');
  const remainingRows = all.filter((entry) => entry.userId !== userId);
  const normalizedRows = Array.isArray(nextWrongQuestions) ? nextWrongQuestions : [];

  const updatedRows = normalizedRows
    .map((row) => normalizeWrongQuestionRow({
      ...row,
      status: row.status || (String(row.selectedAnswer || '').trim() ? 'wrong' : 'unattempted'),
      timesMissed: Number.isFinite(Number(row.timesMissed)) ? Number(row.timesMissed) : 1,
      updatedAt: row.updatedAt || row.lastSeenAt || row.timestamp,
      lastOutcome: row.lastOutcome || row.status
    }, userId))
    .filter((row) => row.questionId);

  await writeFile('wrong-questions', [...remainingRows, ...mergeWrongQuestionRows(updatedRows)]);
  return { wrongQuestions: updatedRows, total: remainingRows.length + updatedRows.length };
}

async function deleteWrongQuestionsByUser(userId) {
  try {
    await pool.query('DELETE FROM wrong_questions WHERE user_id = $1', [userId]);
  } catch (err) {
    console.error('DB wrong questions delete by user failed, fallback JSON', err.message);
  }

  const all = await readFile('wrong-questions');
  const filtered = all.filter((entry) => entry.userId !== userId);
  const deletedCount = all.length - filtered.length;

  if (deletedCount > 0) {
    await writeFile('wrong-questions', filtered);
  }

  return { deletedCount, wrongQuestions: filtered };
}

async function deleteWrongQuestionsByUserAndQuiz(userId, quizId) {
  try {
    await pool.query(
      'DELETE FROM wrong_questions WHERE user_id = $1 AND quiz_id = $2',
      [userId, String(quizId)]
    );
  } catch (err) {
    console.error('DB wrong questions delete by user+quiz failed, fallback JSON', err.message);
  }

  const all = await readFile('wrong-questions');
  const filtered = all.filter(
    (entry) => !(entry.userId === userId && String(entry.quizId) === String(quizId))
  );
  const deletedCount = all.length - filtered.length;

  if (deletedCount > 0) {
    await writeFile('wrong-questions', filtered);
  }

  return { deletedCount, wrongQuestions: filtered };
}
 

/**
 * Get all bookmarks for a user
 * Returns array of { userId, questionId, quizId, topic, timestamp }
 */
async function getBookmarks(userId) {
  try {
    const res = await pool.query(
      `
      SELECT *
      FROM bookmarks
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId]
    );

    if (res.rows.length > 0) {
      return res.rows.map((row) => {
        const data = row.data && typeof row.data === 'object' ? row.data : {};

        return {
          ...data,
          id: data.id || row.id,
          userId: data.userId || row.user_id,
          questionId: data.questionId || row.question_id,
          quizId: data.quizId || row.quiz_id || '',
          topic: data.topic || row.topic || 'General',
          timestamp:
            data.timestamp || (row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString())
        };
      });
    }

    const all = await readFile('bookmarks');
    return Array.isArray(all) ? all.filter(b => b.userId === userId) : [];
  } catch (err) {
    console.error('DB bookmarks read failed, fallback JSON', err.message);
    const all = await readFile('bookmarks');
    return Array.isArray(all) ? all.filter(b => b.userId === userId) : [];
  }
}

/**
 * Add a bookmark
 */
async function addBookmark(userId, data) {
  const all = await readFile('bookmarks');
  const exists = all.find(b => b.userId === userId && b.questionId === data.questionId);
  if (exists) return exists;

  const entry = {
    id: uuidv4(),
    userId,
    questionId: data.questionId,
    quizId: data.quizId || '',
    topic: data.topic || 'General',
    timestamp: new Date().toISOString()
  };

  try {
    await pool.query(
      `
      INSERT INTO bookmarks (
        id,
        user_id,
        question_id,
        quiz_id,
        topic,
        created_at,
        data
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (user_id, question_id) DO UPDATE SET
        quiz_id = EXCLUDED.quiz_id,
        topic = EXCLUDED.topic,
        created_at = EXCLUDED.created_at,
        data = EXCLUDED.data
      `,
      [
        entry.id,
        entry.userId,
        entry.questionId,
        entry.quizId || null,
        entry.topic || 'General',
        entry.timestamp ? new Date(entry.timestamp) : new Date(),
        JSON.stringify(entry)
      ]
    );
  } catch (err) {
    console.error('DB bookmark write failed, fallback JSON', err.message);
  }

  all.push(entry);
  await writeFile('bookmarks', all);
  return entry;
}

/**
 * Remove a bookmark
 */
async function removeBookmark(userId, questionId) {
  try {
    await pool.query(
      'DELETE FROM bookmarks WHERE user_id = $1 AND question_id = $2',
      [userId, questionId]
    );
  } catch (err) {
    console.error('DB bookmark delete failed, fallback JSON', err.message);
  }

  const all = await readFile('bookmarks');
  const filtered = all.filter(b => !(b.userId === userId && b.questionId === questionId));
  await writeFile('bookmarks', filtered);
}

/**
 * Check if a question is bookmarked
 */
async function isQuestionBookmarked(userId, questionId) {
  const bookmarks = await getBookmarks(userId);
  return bookmarks.some(b => b.questionId === questionId);
}

async function migrateLegacyRevisionState(userId) {
  const users = await readFile('users');
  const userIndex = users.findIndex((entry) => entry.id === userId);
  if (userIndex === -1) {
    return { migrated: false, reason: 'user-not-found' };
  }

  const user = users[userIndex] || {};
  const legacy = user.revision && typeof user.revision === 'object' ? user.revision : null;
  if (!legacy) {
    return { migrated: false, reason: 'no-legacy-revision' };
  }

  const wrongEntries = Array.isArray(legacy.wrongQuestions) ? legacy.wrongQuestions : [];
  const bookmarkEntries = Array.isArray(legacy.bookmarks) ? legacy.bookmarks : [];

  const allWrong = await readFile('wrong-questions');
  const allBookmarks = await readFile('bookmarks');

  const existingWrongKeys = new Set(
    allWrong
      .filter((row) => row.userId === userId)
      .map((row) => `${String(row.questionId || '').trim()}::${String(row.quizId || '').trim()}`)
  );

  const existingBookmarkKeys = new Set(
    allBookmarks
      .filter((row) => row.userId === userId)
      .map((row) => String(row.questionId || '').trim())
  );

  let migratedWrongCount = 0;
  let migratedBookmarkCount = 0;

  for (const row of wrongEntries) {
    const questionId = String(row?.questionId || '').trim();
    if (!questionId) continue;
    const quizId = String(row?.quizId || '').trim();
    const key = `${questionId}::${quizId}`;
    if (existingWrongKeys.has(key)) continue;

    allWrong.push({
      id: uuidv4(),
      userId,
      questionId,
      quizId,
      topic: String(row?.topic || 'General').trim() || 'General',
      selectedAnswer: '',
      correctAnswer: row?.correctAnswer === undefined || row?.correctAnswer === null ? '' : String(row.correctAnswer),
      timestamp: row?.lastSeenAt || row?.savedAt || new Date().toISOString()
    });

    existingWrongKeys.add(key);
    migratedWrongCount += 1;
  }

  for (const row of bookmarkEntries) {
    const questionId = String(row?.questionId || '').trim();
    if (!questionId || existingBookmarkKeys.has(questionId)) continue;

    allBookmarks.push({
      id: uuidv4(),
      userId,
      questionId,
      quizId: String(row?.quizId || '').trim(),
      topic: String(row?.topic || 'General').trim() || 'General',
      timestamp: row?.savedAt || row?.lastSeenAt || new Date().toISOString()
    });

    existingBookmarkKeys.add(questionId);
    migratedBookmarkCount += 1;
  }

  user.revision = undefined;
  users[userIndex] = user;

  await Promise.all([
    writeFile('wrong-questions', allWrong),
    writeFile('bookmarks', allBookmarks),
    writeFile('users', users.map(normalizeUser))
  ]);

  return {
    migrated: true,
    migratedWrongCount,
    migratedBookmarkCount
  };
}

module.exports = {
  getUsers,
  saveUsers,
  getAttempts,
  saveAttempts,
  deleteAttemptsByUser,
  deleteAttemptsByUserAndQuiz,
  deleteAttemptById,
  getResources,
  saveResources,
  getCourses,
  saveCourses,
  getLessons,
  saveLessons,
  getNotifications,
  saveNotifications,
  getNotificationLogs,
  saveNotificationLogs,
  getEvents,
  saveEvents,
  getGroups,
  saveGroups,
  getRewards,
  saveRewards,
  getGamificationConfig,
  saveGamificationConfig,
  // Quiz helpers (migration-friendly abstraction)
  getQuizzes,
  saveQuizzes,
  findQuizById,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  duplicateQuiz,
  generateSlug,
  normalizeQuestion,
  // Revision system (wrong questions & bookmarks)
  getWrongQuestions,
  addWrongQuestion,
  removeWrongQuestion,
  replaceWrongQuestionsForUser,
  deleteWrongQuestionsByUser,
  deleteWrongQuestionsByUserAndQuiz,
  getBookmarks,
  addBookmark,
  removeBookmark,
  isQuestionBookmarked,
  migrateLegacyRevisionState
};
