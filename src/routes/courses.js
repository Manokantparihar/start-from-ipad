const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../utils/db');
const authMiddleware = require('../middlewares/auth');
const courseProgress = require('../utils/courseProgressStore');

const router = express.Router();
const LESSONS_DIR = path.join(__dirname, '../../uploads/lessons');

const VALID_DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];
const DEFAULT_MODULE_KEY = 'course-content';
const DEFAULT_MODULE_TITLE = 'Course content';

function sanitizeOutput(value) {
  return value == null ? '' : String(value);
}

function normalizeStatus(value) {
  const status = String(value || 'draft').toLowerCase();
  return status === 'published' ? 'published' : 'draft';
}

function isPublishedCourse(course) {
  return !course.isDeleted && normalizeStatus(course.status) === 'published';
}

function normalizeDifficulty(value) {
  const raw = String(value || '').trim().toLowerCase();
  const match = VALID_DIFFICULTIES.find((entry) => entry.toLowerCase() === raw);
  return match || null;
}

function toPositiveIntOrNull(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/** Optional course metadata. Absent values stay null so the UI can skip them. */
function courseMetadata(course) {
  return {
    slug: course.slug ? sanitizeOutput(course.slug) : null,
    coverImage: course.coverImage ? sanitizeOutput(course.coverImage) : null,
    difficulty: normalizeDifficulty(course.difficulty),
    estimatedMinutes: toPositiveIntOrNull(course.estimatedMinutes),
    certificateEnabled: Boolean(course.certificateEnabled)
  };
}

function slugifyModule(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function lessonModuleKey(lesson) {
  const explicit = slugifyModule(lesson.moduleKey);
  if (explicit) return explicit;
  const fromTitle = slugifyModule(lesson.moduleTitle);
  if (fromTitle) return fromTitle;
  return DEFAULT_MODULE_KEY;
}

function mapLesson(lesson) {
  return {
    id: lesson.id,
    title: sanitizeOutput(lesson.title),
    description: sanitizeOutput(lesson.description),
    type: sanitizeOutput(lesson.type || 'pdf'),
    order: Number(lesson.order) || 1,
    moduleKey: lessonModuleKey(lesson),
    moduleTitle: sanitizeOutput(lesson.moduleTitle) || DEFAULT_MODULE_TITLE,
    moduleOrder: Number(lesson.moduleOrder) || 1,
    origFilename: sanitizeOutput(lesson.origFilename),
    size: Number(lesson.size) || 0,
    updatedAt: lesson.updatedAt || lesson.createdAt || null,
    viewUrl: `/api/courses/lessons/${lesson.id}/view`,
    downloadUrl: `/api/courses/lessons/${lesson.id}/download`
  };
}

/**
 * Groups the flat lesson list into modules. Modules live on the existing
 * lesson records (moduleKey / moduleTitle / moduleOrder), so lessons without
 * module fields fall into one implicit "Course content" module and keep
 * rendering exactly as before.
 */
function groupIntoModules(lessons) {
  const groups = new Map();

  lessons.forEach((lesson) => {
    const key = lesson.moduleKey;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title: lesson.moduleTitle || DEFAULT_MODULE_TITLE,
        order: lesson.moduleOrder,
        lessons: []
      });
    }
    const group = groups.get(key);
    group.order = Math.min(group.order, lesson.moduleOrder);
    group.lessons.push(lesson);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      lessons: group.lessons.slice().sort((a, b) => a.order - b.order),
      lessonCount: group.lessons.length
    }))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

async function loadPublishedCourse(idOrSlug) {
  const [courses, lessons] = await Promise.all([db.getCourses(), db.getLessons()]);

  const course = courses.find((entry) => (
    isPublishedCourse(entry) && (entry.id === idOrSlug || entry.slug === idOrSlug)
  ));

  if (!course) return null;

  const orderedLessons = lessons
    .filter((entry) => entry.courseId === course.id && !entry.isDeleted)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .map(mapLesson);

  return { course, lessons: orderedLessons };
}

router.get('/lessons/:id/view', async (req, res) => {
  try {
    const lessons = await db.getLessons();
    const lesson = lessons.find((entry) => entry.id === req.params.id && !entry.isDeleted);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });

    const courses = await db.getCourses();
    const linkedCourse = courses.find((entry) => entry.id === lesson.courseId && isPublishedCourse(entry));
    if (!linkedCourse) return res.status(404).json({ error: 'Course not available.' });

    const filePath = path.join(LESSONS_DIR, lesson.filename || '');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on server.' });

    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(lesson.origFilename || lesson.filename || 'lesson.pdf')}"`);
    res.setHeader('Content-Type', 'application/pdf');
    return res.sendFile(filePath);
  } catch {
    return res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/lessons/:id/download', async (req, res) => {
  try {
    const lessons = await db.getLessons();
    const lesson = lessons.find((entry) => entry.id === req.params.id && !entry.isDeleted);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });

    const courses = await db.getCourses();
    const linkedCourse = courses.find((entry) => entry.id === lesson.courseId && isPublishedCourse(entry));
    if (!linkedCourse) return res.status(404).json({ error: 'Course not available.' });

    const filePath = path.join(LESSONS_DIR, lesson.filename || '');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on server.' });

    return res.download(filePath, lesson.origFilename || lesson.filename || 'lesson.pdf');
  } catch {
    return res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/', async (_req, res) => {
  try {
    const [courses, lessons] = await Promise.all([db.getCourses(), db.getLessons()]);

    const activeCourses = courses
      .filter((entry) => isPublishedCourse(entry))
      .map((entry) => {
        const lessonCount = lessons.filter((lesson) => lesson.courseId === entry.id && !lesson.isDeleted).length;
        return {
          id: entry.id,
          title: sanitizeOutput(entry.title),
          description: sanitizeOutput(entry.description),
          category: sanitizeOutput(entry.category || 'General'),
          status: normalizeStatus(entry.status),
          lessonCount,
          ...courseMetadata(entry),
          updatedAt: entry.updatedAt || entry.lastUpdated || entry.createdAt || null
        };
      })
      .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));

    return res.json(activeCourses);
  } catch {
    return res.status(500).json({ error: 'Server error while loading courses.' });
  }
});

/* ------------------------------------------------------------------ *
 * Progress endpoints (existing auth middleware, no new auth)
 *
 * Course progress is intentionally independent from quizzes, attempts,
 * accuracy, mastery, streaks, XP and the leaderboard.
 * ------------------------------------------------------------------ */

router.get('/progress/summary', authMiddleware, async (req, res) => {
  try {
    const [courses, lessons, entries] = await Promise.all([
      db.getCourses(),
      db.getLessons(),
      courseProgress.getUserProgressSummary(req.userId)
    ]);

    const summary = entries
      .map((entry) => {
        const course = courses.find((item) => item.id === entry.courseId && isPublishedCourse(item));
        if (!course) return null;

        const courseLessons = lessons.filter((lesson) => lesson.courseId === course.id && !lesson.isDeleted);
        const totalLessons = courseLessons.length;
        const validIds = new Set(courseLessons.map((lesson) => lesson.id));
        const completedLessons = entry.completedLessonIds.filter((id) => validIds.has(id)).length;

        return {
          courseId: course.id,
          title: sanitizeOutput(course.title),
          category: sanitizeOutput(course.category || 'General'),
          coverImage: course.coverImage ? sanitizeOutput(course.coverImage) : null,
          totalLessons,
          completedLessons,
          percent: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
          lastLessonId: validIds.has(entry.lastLessonId) ? entry.lastLessonId : null,
          lastOpenedAt: entry.lastOpenedAt,
          updatedAt: entry.updatedAt
        };
      })
      .filter(Boolean)
      .sort((a, b) => Date.parse(b.lastOpenedAt || b.updatedAt || 0) - Date.parse(a.lastOpenedAt || a.updatedAt || 0));

    return res.json({ courses: summary });
  } catch {
    return res.status(500).json({ error: 'Server error while loading course progress.' });
  }
});

router.get('/:id/progress', authMiddleware, async (req, res) => {
  try {
    const loaded = await loadPublishedCourse(req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Course not found.' });

    const progress = await courseProgress.getUserCourseProgress(req.userId, loaded.course.id);
    return res.json(buildProgressResponse(loaded, progress));
  } catch {
    return res.status(500).json({ error: 'Server error while loading course progress.' });
  }
});

router.post('/:id/lessons/:lessonId/complete', authMiddleware, async (req, res) => {
  try {
    const loaded = await loadPublishedCourse(req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Course not found.' });

    const lesson = loaded.lessons.find((entry) => entry.id === req.params.lessonId);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found in this course.' });

    const current = await courseProgress.getUserCourseProgress(req.userId, loaded.course.id);
    const done = typeof req.body?.completed === 'boolean'
      ? req.body.completed
      : !current.completedLessonIds.includes(lesson.id);

    const progress = await courseProgress.setLessonComplete(req.userId, loaded.course.id, lesson.id, done);
    return res.json(buildProgressResponse(loaded, progress));
  } catch {
    return res.status(500).json({ error: 'Server error while saving lesson progress.' });
  }
});

router.post('/:id/opened', authMiddleware, async (req, res) => {
  try {
    const loaded = await loadPublishedCourse(req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Course not found.' });

    const requestedLessonId = req.body?.lessonId ? String(req.body.lessonId) : null;
    const lessonId = loaded.lessons.some((entry) => entry.id === requestedLessonId) ? requestedLessonId : null;

    const progress = await courseProgress.touchCourse(req.userId, loaded.course.id, lessonId);
    return res.json(buildProgressResponse(loaded, progress));
  } catch {
    return res.status(500).json({ error: 'Server error while saving course activity.' });
  }
});

/** Merges device-local progress once, after sign-in. Additive only. */
router.post('/:id/progress/merge', authMiddleware, async (req, res) => {
  try {
    const loaded = await loadPublishedCourse(req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Course not found.' });

    const validIds = new Set(loaded.lessons.map((entry) => entry.id));
    const incomingIds = Array.isArray(req.body?.completedLessonIds) ? req.body.completedLessonIds : [];

    const progress = await courseProgress.mergeLocalProgress(req.userId, loaded.course.id, {
      completedLessonIds: incomingIds.map(String).filter((id) => validIds.has(id)),
      lastLessonId: validIds.has(String(req.body?.lastLessonId)) ? String(req.body.lastLessonId) : null,
      lastOpenedAt: req.body?.lastOpenedAt || null
    });

    return res.json(buildProgressResponse(loaded, progress));
  } catch {
    return res.status(500).json({ error: 'Server error while merging course progress.' });
  }
});

function buildProgressResponse(loaded, progress) {
  const validIds = new Set(loaded.lessons.map((entry) => entry.id));
  const completedLessonIds = progress.completedLessonIds.filter((id) => validIds.has(id));
  const totalLessons = loaded.lessons.length;

  const modules = groupIntoModules(loaded.lessons).map((module) => {
    const completed = module.lessons.filter((lesson) => completedLessonIds.includes(lesson.id)).length;
    return {
      key: module.key,
      title: module.title,
      lessonCount: module.lessonCount,
      completedLessons: completed,
      percent: module.lessonCount > 0 ? Math.round((completed / module.lessonCount) * 100) : 0
    };
  });

  return {
    courseId: loaded.course.id,
    completedLessonIds,
    completedLessons: completedLessonIds.length,
    totalLessons,
    percent: totalLessons > 0 ? Math.round((completedLessonIds.length / totalLessons) * 100) : 0,
    lastLessonId: validIds.has(progress.lastLessonId) ? progress.lastLessonId : null,
    lastOpenedAt: progress.lastOpenedAt,
    updatedAt: progress.updatedAt,
    modules,
    storage: 'account'
  };
}

router.get('/:id', async (req, res) => {
  try {
    const loaded = await loadPublishedCourse(req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Course not found.' });

    const { course, lessons } = loaded;

    return res.json({
      id: course.id,
      title: sanitizeOutput(course.title),
      description: sanitizeOutput(course.description),
      category: sanitizeOutput(course.category || 'General'),
      status: normalizeStatus(course.status),
      ...courseMetadata(course),
      updatedAt: course.updatedAt || course.lastUpdated || course.createdAt || null,
      // Flat list kept byte-compatible for existing consumers.
      lessons,
      modules: groupIntoModules(lessons)
    });
  } catch {
    return res.status(500).json({ error: 'Server error while loading course detail.' });
  }
});

module.exports = router;
