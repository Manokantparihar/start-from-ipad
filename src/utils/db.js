const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '../../data');

// Generic read
async function readFile(filename) {
  try {
    const filePath = path.join(DATA_DIR, `${filename}.json`);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data || '[]');
  } catch (error) {
    return [];
  }
}

// Generic write
async function writeFile(filename, data) {
  const filePath = path.join(DATA_DIR, `${filename}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// USERS
const getUsers = () => readFile('users');
const saveUsers = (users) => writeFile('users', users);

// ATTEMPTS
const getAttempts = () => readFile('attempts');
const saveAttempts = (attempts) => writeFile('attempts', attempts);

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

// NOTIFICATIONS
const getNotifications = () => readFile('notifications');
const saveNotifications = (notifications) => writeFile('notifications', notifications);

// NOTIFICATION LOGS (admin broadcast history)
const getNotificationLogs = () => readFile('notification-logs');
const saveNotificationLogs = (logs) => writeFile('notification-logs', logs);

module.exports = {
  getUsers,
  saveUsers,
  getAttempts,
  saveAttempts,
  getResources,
  saveResources,
  getNotifications,
  saveNotifications,
  getNotificationLogs,
  saveNotificationLogs,
  // Quiz helpers (migration-friendly abstraction)
  getQuizzes,
  saveQuizzes,
  findQuizById,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  duplicateQuiz,
  generateSlug,
  normalizeQuestion
};