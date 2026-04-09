const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../utils/db');

const router = express.Router();
const LESSONS_DIR = path.join(__dirname, '../../uploads/lessons');

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
          updatedAt: entry.updatedAt || entry.lastUpdated || entry.createdAt || null
        };
      })
      .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));

    return res.json(activeCourses);
  } catch {
    return res.status(500).json({ error: 'Server error while loading courses.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [courses, lessons] = await Promise.all([db.getCourses(), db.getLessons()]);

    const course = courses.find((entry) => (
      !entry.isDeleted
      && normalizeStatus(entry.status) === 'published'
      && (entry.id === req.params.id || entry.slug === req.params.id)
    ));

    if (!course) return res.status(404).json({ error: 'Course not found.' });

    const orderedLessons = lessons
      .filter((entry) => entry.courseId === course.id && !entry.isDeleted)
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      .map((entry) => ({
        id: entry.id,
        title: sanitizeOutput(entry.title),
        description: sanitizeOutput(entry.description),
        type: sanitizeOutput(entry.type || 'pdf'),
        order: Number(entry.order) || 1,
        origFilename: sanitizeOutput(entry.origFilename),
        size: Number(entry.size) || 0,
        updatedAt: entry.updatedAt || entry.createdAt || null,
        viewUrl: `/api/courses/lessons/${entry.id}/view`,
        downloadUrl: `/api/courses/lessons/${entry.id}/download`
      }));

    return res.json({
      id: course.id,
      title: sanitizeOutput(course.title),
      description: sanitizeOutput(course.description),
      category: sanitizeOutput(course.category || 'General'),
      status: normalizeStatus(course.status),
      updatedAt: course.updatedAt || course.lastUpdated || course.createdAt || null,
      lessons: orderedLessons
    });
  } catch {
    return res.status(500).json({ error: 'Server error while loading course detail.' });
  }
});

module.exports = router;
