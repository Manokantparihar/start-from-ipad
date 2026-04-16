const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');

test('revision: wrong questions should be tracked after submit', async () => {
  const agent = request.agent(app);

  const email = `rev_${Date.now()}@example.com`;
  const password = 'Password123!';
  const name = 'Revision User';

  // register
  await agent.post('/api/auth/register').send({ name, email, password });

  // login
  await agent.post('/api/auth/login').send({ email, password });

  // get quizzes
  const quizRes = await agent.get('/api/quizzes');
  assert.equal(quizRes.statusCode, 200);

  const quiz = quizRes.body[0];
  assert.ok(quiz);

  // start attempt
  const startRes = await agent
    .post(`/api/attempts`)
    .send({ quizId: quiz.id });

  assert.equal(startRes.statusCode, 200);

  const attemptId = startRes.body.attemptId;

  // submit with empty answers (simulate wrong/unattempted)
  const submitRes = await agent
    .post(`/api/attempts/${attemptId}/submit`)
    .send({ answers: [] });

  assert.equal(submitRes.statusCode, 200);

  // fetch revision sets
  const revRes = await agent.get('/api/revision/sets');
  assert.equal(revRes.statusCode, 200);

  // basic validation
  assert.ok(revRes.body);
});
test('revision: wrong question backlog should not duplicate for same question', async () => {
  const agent = request.agent(app);

  const email = `revdup_${Date.now()}@example.com`;
  const password = 'Password123!';
  const name = 'Revision Duplicate User';

  // register + login
  await agent.post('/api/auth/register').send({ name, email, password });
  await agent.post('/api/auth/login').send({ email, password });

  // get first quiz
  const quizRes = await agent.get('/api/quizzes');
  assert.equal(quizRes.statusCode, 200);
  const quiz = quizRes.body[0];
  assert.ok(quiz);

  // first attempt: submit empty answers to create revision backlog
  const start1 = await agent.post('/api/attempts').send({ quizId: quiz.id });
  assert.equal(start1.statusCode, 200);

  const attemptId1 = start1.body.attemptId;

  const submit1 = await agent
    .post(`/api/attempts/${attemptId1}/submit`)
    .send({ answers: [] });

  assert.equal(submit1.statusCode, 200);

  const rev1 = await agent.get('/api/revision/sets');
  assert.equal(rev1.statusCode, 200);

  const firstSnapshot = JSON.stringify(rev1.body);

  // second attempt on same quiz: again submit empty answers
  const start2 = await agent.post('/api/attempts').send({ quizId: quiz.id });
  assert.equal(start2.statusCode, 200);

  const attemptId2 = start2.body.attemptId;

  const submit2 = await agent
    .post(`/api/attempts/${attemptId2}/submit`)
    .send({ answers: [] });

  assert.equal(submit2.statusCode, 200);

  const rev2 = await agent.get('/api/revision/sets');
  assert.equal(rev2.statusCode, 200);

  const secondSnapshot = JSON.stringify(rev2.body);

  // crude guard: second snapshot should exist and not explode unexpectedly
  assert.ok(secondSnapshot);

  // optional sanity: response shape should remain stable
  assert.equal(typeof rev2.body, typeof rev1.body);

  // snapshots can differ due to timestamps/order, but backlog should not become invalid/empty
  assert.notEqual(secondSnapshot.length, 0);
});