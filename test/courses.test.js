const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');

async function registerAgent(prefix) {
  const agent = request.agent(app);
  const email = `${prefix}_${Date.now()}@example.com`;
  const password = 'Password123!';

  const registerRes = await agent
    .post('/api/auth/register')
    .send({ name: 'Course User', email, password });
  assert.equal(registerRes.statusCode, 201);

  const loginRes = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(loginRes.statusCode, 200);

  return agent;
}

test('courses: catalog exposes optional metadata fields', async () => {
  const listRes = await request(app).get('/api/courses');
  assert.equal(listRes.statusCode, 200);
  assert.ok(Array.isArray(listRes.body));

  for (const course of listRes.body) {
    assert.ok(typeof course.id === 'string' && course.id.length > 0);
    assert.equal(typeof course.lessonCount, 'number');
    assert.ok('coverImage' in course);
    assert.ok('difficulty' in course);
    assert.ok('estimatedMinutes' in course);
    assert.ok('certificateEnabled' in course);
  }
});

test('courses: detail groups lessons into modules', async () => {
  const listRes = await request(app).get('/api/courses');
  assert.equal(listRes.statusCode, 200);

  const course = listRes.body[0];
  if (!course) return; // No published courses seeded in this environment.

  const detailRes = await request(app).get(`/api/courses/${course.id}`);
  assert.equal(detailRes.statusCode, 200);
  assert.ok(Array.isArray(detailRes.body.lessons));
  assert.ok(Array.isArray(detailRes.body.modules));

  const lessonIdsFromModules = detailRes.body.modules.flatMap((mod) => {
    assert.ok(typeof mod.key === 'string' && mod.key.length > 0);
    assert.ok(typeof mod.title === 'string' && mod.title.length > 0);
    assert.ok(Array.isArray(mod.lessons));
    return mod.lessons.map((lesson) => lesson.id);
  });

  // Every lesson appears exactly once across modules.
  assert.equal(lessonIdsFromModules.length, detailRes.body.lessons.length);
  assert.equal(new Set(lessonIdsFromModules).size, lessonIdsFromModules.length);
});

test('courses: progress endpoints require authentication', async () => {
  const listRes = await request(app).get('/api/courses');
  const course = listRes.body[0];
  if (!course) return;

  const summaryRes = await request(app).get('/api/courses/progress/summary');
  assert.equal(summaryRes.statusCode, 401);

  const progressRes = await request(app).get(`/api/courses/${course.id}/progress`);
  assert.equal(progressRes.statusCode, 401);
});

test('courses: lesson completion is idempotent and additive', async () => {
  const listRes = await request(app).get('/api/courses');
  const course = (listRes.body || []).find((item) => Number(item.lessonCount) > 0);
  if (!course) return;

  const agent = await registerAgent('course');

  const detailRes = await agent.get(`/api/courses/${course.id}`);
  assert.equal(detailRes.statusCode, 200);
  const lesson = detailRes.body.lessons[0];
  assert.ok(lesson);

  const initialRes = await agent.get(`/api/courses/${course.id}/progress`);
  assert.equal(initialRes.statusCode, 200);
  assert.equal(initialRes.body.completedLessons, 0);
  assert.equal(initialRes.body.percent, 0);

  const completeRes = await agent
    .post(`/api/courses/${course.id}/lessons/${lesson.id}/complete`)
    .send({ completed: true });
  assert.equal(completeRes.statusCode, 200);
  assert.equal(completeRes.body.completedLessons, 1);
  assert.ok(completeRes.body.completedLessonIds.includes(lesson.id));

  // Repeating the same completion must not double-count.
  const repeatRes = await agent
    .post(`/api/courses/${course.id}/lessons/${lesson.id}/complete`)
    .send({ completed: true });
  assert.equal(repeatRes.statusCode, 200);
  assert.equal(repeatRes.body.completedLessons, 1);

  const summaryRes = await agent.get('/api/courses/progress/summary');
  assert.equal(summaryRes.statusCode, 200);
  const entry = (summaryRes.body.courses || []).find((item) => item.courseId === course.id);
  assert.ok(entry);
  assert.equal(entry.completedLessons, 1);

  // Un-completing works too.
  const undoRes = await agent
    .post(`/api/courses/${course.id}/lessons/${lesson.id}/complete`)
    .send({ completed: false });
  assert.equal(undoRes.statusCode, 200);
  assert.equal(undoRes.body.completedLessons, 0);
});

test('courses: device merge only adds lessons, never removes them', async () => {
  const listRes = await request(app).get('/api/courses');
  const course = (listRes.body || []).find((item) => Number(item.lessonCount) > 0);
  if (!course) return;

  const agent = await registerAgent('merge');
  const detailRes = await agent.get(`/api/courses/${course.id}`);
  const lesson = detailRes.body.lessons[0];
  assert.ok(lesson);

  await agent
    .post(`/api/courses/${course.id}/lessons/${lesson.id}/complete`)
    .send({ completed: true });

  const mergeRes = await agent
    .post(`/api/courses/${course.id}/progress/merge`)
    .send({ completedLessonIds: ['does-not-exist'] });
  assert.equal(mergeRes.statusCode, 200);

  // Unknown ids are ignored and existing progress survives the merge.
  assert.ok(mergeRes.body.completedLessonIds.includes(lesson.id));
  assert.ok(!mergeRes.body.completedLessonIds.includes('does-not-exist'));
});

test('courses: unknown course id returns 404', async () => {
  const res = await request(app).get('/api/courses/definitely-not-a-course');
  assert.equal(res.statusCode, 404);
});
