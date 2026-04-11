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
const getUsers = async () => (await readFile('users')).map(normalizeUser);
const saveUsers = async (users) => writeFile('users', users.map(normalizeUser));

// ATTEMPTS
const getAttempts = () => readFile('attempts');
const saveAttempts = (attempts) => writeFile('attempts', attempts);

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
const getNotifications = () => readFile('notifications');
const saveNotifications = (notifications) => writeFile('notifications', notifications);

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

/**
 * Get all wrong questions for a user
 * Returns array of { userId, questionId, quizId, topic, selectedAnswer, correctAnswer, timestamp }
 */
async function getWrongQuestions(userId) {
  const all = await readFile('wrong-questions');
  return Array.isArray(all) ? all.filter(w => w.userId === userId) : [];
}

/**
 * Add a wrong question (called after quiz submission)
 */
async function addWrongQuestion(userId, data) {
  const all = await readFile('wrong-questions');
  const entry = {
    id: uuidv4(),
    userId,
    questionId: data.questionId,
    quizId: data.quizId || '',
    topic: data.topic || 'General',
    selectedAnswer: data.selectedAnswer || '',
    correctAnswer: data.correctAnswer || '',
    timestamp: new Date().toISOString()
  };
  all.push(entry);
  await writeFile('wrong-questions', all);
  return entry;
}

/**
 * Remove a wrong question entry
 */
async function removeWrongQuestion(id) {
  const all = await readFile('wrong-questions');
  const filtered = all.filter(w => w.id !== id);
  await writeFile('wrong-questions', filtered);
}

async function deleteWrongQuestionsByUser(userId) {
  const all = await readFile('wrong-questions');
  const filtered = all.filter((entry) => entry.userId !== userId);
  const deletedCount = all.length - filtered.length;
  if (deletedCount > 0) {
    await writeFile('wrong-questions', filtered);
  }
  return { deletedCount, wrongQuestions: filtered };
}

async function deleteWrongQuestionsByUserAndQuiz(userId, quizId) {
  const all = await readFile('wrong-questions');
  const filtered = all.filter((entry) => !(entry.userId === userId && String(entry.quizId) === String(quizId)));
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
  const all = await readFile('bookmarks');
  return Array.isArray(all) ? all.filter(b => b.userId === userId) : [];
}

/**
 * Add a bookmark
 */
async function addBookmark(userId, data) {
  const all = await readFile('bookmarks');
  // Check if already bookmarked
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
  all.push(entry);
  await writeFile('bookmarks', all);
  return entry;
}

/**
 * Remove a bookmark
 */
async function removeBookmark(userId, questionId) {
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
  deleteWrongQuestionsByUser,
  deleteWrongQuestionsByUserAndQuiz,
  getBookmarks,
  addBookmark,
  removeBookmark,
  isQuestionBookmarked
};
