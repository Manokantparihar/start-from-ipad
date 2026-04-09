const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');

const router = express.Router();

const LESSONS_DIR = path.join(__dirname, '../../uploads/lessons');
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const VALID_STATUSES = ['draft', 'published'];
const VALID_LESSON_TYPES = ['pdf', 'note', 'current-affairs', 'schedule'];

if (!fs.existsSync(LESSONS_DIR)) {
  fs.mkdirSync(LESSONS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, LESSONS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    return cb(new Error('Only PDF files are allowed.'));
  }
});

function sanitize(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
}

function normalizeStatus(value) {
  const status = String(value || 'draft').toLowerCase();
  return VALID_STATUSES.includes(status) ? status : 'draft';
}

function normalizeLessonType(value) {
  const kind = String(value || 'pdf').toLowerCase();
  return VALID_LESSON_TYPES.includes(kind) ? kind : 'pdf';
}

function toPositiveInt(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function validateCoursePayload(payload) {
  const errors = [];
  const title = sanitize(payload.title);

  if (!title) {
    errors.push({ field: 'title', message: 'Course title is required.' });
  }

  if (payload.status && !VALID_STATUSES.includes(String(payload.status).toLowerCase())) {
    errors.push({ field: 'status', message: 'Status must be Draft or Published.' });
  }

  return errors;
}

async function getCourseAndLessons(courseId) {
  const [courses, lessons] = await Promise.all([db.getCourses(), db.getLessons()]);
  const course = courses.find((entry) => entry.id === courseId && !entry.isDeleted);
  if (!course) return null;

  const courseLessons = lessons
    .filter((entry) => entry.courseId === courseId && !entry.isDeleted)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

  return { course, lessons: courseLessons };
}

router.post('/lessons', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large. Maximum size is 10 MB.'
        : err.message || 'Upload failed.';
      return res.status(400).json({ error: msg });
    }

    const title = sanitize(req.body.title);
    const description = sanitize(req.body.description);
    const courseId = sanitize(req.body.courseId);
    const type = normalizeLessonType(req.body.type);
    const order = toPositiveInt(req.body.order, 1);

    if (!title) return res.status(400).json({ error: 'Lesson title is required.' });
    if (!courseId) return res.status(400).json({ error: 'Course is required.' });
    if (!req.file) return res.status(400).json({ error: 'Lesson file is required.' });

    try {
      const [courses, lessons] = await Promise.all([db.getCourses(), db.getLessons()]);
      const course = courses.find((entry) => entry.id === courseId && !entry.isDeleted);
      if (!course) {
        return res.status(400).json({ error: 'Selected course does not exist.' });
      }

      const lesson = {
        id: uuidv4(),
        courseId,
        title,
        description,
        type,
        order,
        origFilename: req.file.originalname,
        filename: req.file.filename,
        filePath: `/uploads/lessons/${req.file.filename}`,
        size: req.file.size,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDeleted: false
      };

      lessons.push(lesson);
      const updatedCourse = {
        ...course,
        updatedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };
      const nextCourses = courses.map((entry) => (entry.id === course.id ? updatedCourse : entry));

      await Promise.all([db.saveLessons(lessons), db.saveCourses(nextCourses)]);
      return res.status(201).json({ lesson });
    } catch (saveError) {
      return res.status(500).json({ error: 'Server error while creating lesson.' });
    }
  });
});

router.put('/lessons/:id', async (req, res) => {
  try {
    const [courses, lessons] = await Promise.all([db.getCourses(), db.getLessons()]);
    const idx = lessons.findIndex((entry) => entry.id === req.params.id && !entry.isDeleted);
    if (idx === -1) return res.status(404).json({ error: 'Lesson not found.' });

    const current = lessons[idx];
    const title = sanitize(req.body.title || current.title);
    const description = sanitize(req.body.description || current.description);
    const courseId = sanitize(req.body.courseId || current.courseId);
    const type = normalizeLessonType(req.body.type || current.type);
    const order = toPositiveInt(req.body.order, Number(current.order) || 1);

    if (!title) return res.status(400).json({ error: 'Lesson title is required.' });

    const courseExists = courses.some((entry) => entry.id === courseId && !entry.isDeleted);
    if (!courseExists) return res.status(400).json({ error: 'Selected course does not exist.' });

    const updated = {
      ...current,
      title,
      description,
      courseId,
      type,
      order,
      updatedAt: new Date().toISOString()
    };

    lessons[idx] = updated;
    await db.saveLessons(lessons);

    return res.json({ lesson: updated });
  } catch {
    return res.status(500).json({ error: 'Server error while updating lesson.' });
  }
});

router.patch('/lessons/:id/replace-file', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large. Maximum size is 10 MB.'
        : err.message || 'Upload failed.';
      return res.status(400).json({ error: msg });
    }

    if (!req.file) return res.status(400).json({ error: 'File is required.' });

    try {
      const lessons = await db.getLessons();
      const idx = lessons.findIndex((entry) => entry.id === req.params.id && !entry.isDeleted);
      if (idx === -1) return res.status(404).json({ error: 'Lesson not found.' });

      const lesson = lessons[idx];
      const oldFile = lesson.filename ? path.resolve(LESSONS_DIR, path.basename(lesson.filename)) : null;

      lessons[idx] = {
        ...lesson,
        origFilename: req.file.originalname,
        filename: req.file.filename,
        filePath: `/uploads/lessons/${req.file.filename}`,
        size: req.file.size,
        updatedAt: new Date().toISOString()
      };

      await db.saveLessons(lessons);

      if (oldFile && oldFile.startsWith(LESSONS_DIR + path.sep) && fs.existsSync(oldFile)) {
        try {
          fs.unlinkSync(oldFile);
        } catch (unlinkErr) {
          console.error('Could not remove old lesson file:', unlinkErr.message);
        }
      }

      return res.json({ lesson: lessons[idx] });
    } catch {
      return res.status(500).json({ error: 'Server error while replacing file.' });
    }
  });
});

router.patch('/lessons/:id/move', async (req, res) => {
  const direction = String(req.body.direction || '').toLowerCase();
  if (!['up', 'down'].includes(direction)) {
    return res.status(400).json({ error: 'direction must be up or down.' });
  }

  try {
    const lessons = await db.getLessons();
    const lesson = lessons.find((entry) => entry.id === req.params.id && !entry.isDeleted);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });

    const sameCourse = lessons
      .filter((entry) => entry.courseId === lesson.courseId && !entry.isDeleted)
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    const currentIndex = sameCourse.findIndex((entry) => entry.id === lesson.id);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sameCourse.length) {
      return res.status(400).json({ error: 'Cannot move further in that direction.' });
    }

    const current = sameCourse[currentIndex];
    const target = sameCourse[targetIndex];
    const currentOrder = Number(current.order) || currentIndex + 1;
    const targetOrder = Number(target.order) || targetIndex + 1;

    const nextLessons = lessons.map((entry) => {
      if (entry.id === current.id) {
        return { ...entry, order: targetOrder, updatedAt: new Date().toISOString() };
      }
      if (entry.id === target.id) {
        return { ...entry, order: currentOrder, updatedAt: new Date().toISOString() };
      }
      return entry;
    });

    await db.saveLessons(nextLessons);
    return res.json({ moved: true });
  } catch {
    return res.status(500).json({ error: 'Server error while moving lesson.' });
  }
});

router.delete('/lessons/:id', async (req, res) => {
  try {
    const lessons = await db.getLessons();
    const idx = lessons.findIndex((entry) => entry.id === req.params.id && !entry.isDeleted);
    if (idx === -1) return res.status(404).json({ error: 'Lesson not found.' });

    lessons[idx] = {
      ...lessons[idx],
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.saveLessons(lessons);
    return res.json({ deleted: true });
  } catch {
    return res.status(500).json({ error: 'Server error while deleting lesson.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const [courses, lessons] = await Promise.all([db.getCourses(), db.getLessons()]);

    const search = String(req.query.search || '').toLowerCase().trim();
    const status = String(req.query.status || '').toLowerCase().trim();

    const list = courses
      .filter((entry) => !entry.isDeleted)
      .filter((entry) => {
        if (!search) return true;
        return String(entry.title || '').toLowerCase().includes(search)
          || String(entry.description || '').toLowerCase().includes(search)
          || String(entry.category || '').toLowerCase().includes(search);
      })
      .filter((entry) => (status ? String(entry.status || 'draft').toLowerCase() === status : true))
      .map((entry) => ({
        ...entry,
        status: normalizeStatus(entry.status),
        lessonsCount: lessons.filter((lesson) => lesson.courseId === entry.id && !lesson.isDeleted).length,
        lastUpdated: entry.lastUpdated || entry.updatedAt || entry.createdAt || null
      }))
      .sort((a, b) => Date.parse(b.lastUpdated || 0) - Date.parse(a.lastUpdated || 0));

    return res.json(list);
  } catch {
    return res.status(500).json({ error: 'Server error while loading courses.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = {
      title: req.body.title,
      description: req.body.description,
      category: req.body.category,
      status: req.body.status
    };

    const errors = validateCoursePayload(payload);
    if (errors.length) return res.status(400).json({ errors });

    const courses = await db.getCourses();
    const now = new Date().toISOString();

    const course = {
      id: uuidv4(),
      title: sanitize(payload.title),
      description: sanitize(payload.description),
      category: sanitize(payload.category) || 'General',
      status: normalizeStatus(payload.status),
      createdAt: now,
      updatedAt: now,
      lastUpdated: now,
      createdBy: req.user ? req.user.id : null,
      isDeleted: false
    };

    courses.push(course);
    await db.saveCourses(courses);

    return res.status(201).json({ course });
  } catch {
    return res.status(500).json({ error: 'Server error while creating course.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await getCourseAndLessons(req.params.id);
    if (!result) return res.status(404).json({ error: 'Course not found.' });
    return res.json(result);
  } catch {
    return res.status(500).json({ error: 'Server error while loading course detail.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const payload = {
      title: req.body.title,
      description: req.body.description,
      category: req.body.category,
      status: req.body.status
    };

    const errors = validateCoursePayload(payload);
    if (errors.length) return res.status(400).json({ errors });

    const courses = await db.getCourses();
    const idx = courses.findIndex((entry) => entry.id === req.params.id && !entry.isDeleted);
    if (idx === -1) return res.status(404).json({ error: 'Course not found.' });

    courses[idx] = {
      ...courses[idx],
      title: sanitize(payload.title),
      description: sanitize(payload.description),
      category: sanitize(payload.category) || 'General',
      status: normalizeStatus(payload.status),
      updatedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    await db.saveCourses(courses);
    return res.json({ course: courses[idx] });
  } catch {
    return res.status(500).json({ error: 'Server error while updating course.' });
  }
});

router.patch('/:id/publish', async (req, res) => {
  try {
    const courses = await db.getCourses();
    const idx = courses.findIndex((entry) => entry.id === req.params.id && !entry.isDeleted);
    if (idx === -1) return res.status(404).json({ error: 'Course not found.' });

    const nextStatus = req.body.status
      ? normalizeStatus(req.body.status)
      : (courses[idx].status === 'published' ? 'draft' : 'published');

    courses[idx] = {
      ...courses[idx],
      status: nextStatus,
      updatedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    await db.saveCourses(courses);
    return res.json({ id: courses[idx].id, status: courses[idx].status });
  } catch {
    return res.status(500).json({ error: 'Server error while updating course status.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [courses, lessons] = await Promise.all([db.getCourses(), db.getLessons()]);
    const idx = courses.findIndex((entry) => entry.id === req.params.id && !entry.isDeleted);
    if (idx === -1) return res.status(404).json({ error: 'Course not found.' });

    courses[idx] = {
      ...courses[idx],
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    const nextLessons = lessons.map((entry) => {
      if (entry.courseId !== req.params.id || entry.isDeleted) return entry;
      return {
        ...entry,
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });

    await Promise.all([db.saveCourses(courses), db.saveLessons(nextLessons)]);
    return res.json({ deleted: true });
  } catch {
    return res.status(500).json({ error: 'Server error while deleting course.' });
  }
});

module.exports = router;
