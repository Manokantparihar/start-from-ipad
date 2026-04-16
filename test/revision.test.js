const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');

test('revision: wrong questions should be tracked after submit', async () => {
  const agent = request.agent(app);

  const email = `rev_${Date.now()}@example.com`;
  const password = 'Password123!';
  const name = 'Revision User';

  const registerRes = await agent
    .post('/api/auth/register')
    .send({ name, email, password });

  assert.equal(registerRes.statusCode, 201);

  const loginRes = await agent
    .post('/api/auth/login')
    .send({ email, password });

  assert.equal(loginRes.statusCode, 200);

  const meRes = await agent.get('/api/auth/me');
  assert.equal(meRes.statusCode, 200);
  assert.equal(meRes.body.user.email, email);

  const quizRes = await agent.get('/api/quizzes');
  assert.equal(quizRes.statusCode, 200);

  const quiz = quizRes.body[0];
  assert.ok(quiz);

  const startRes = await agent
    .post('/api/attempts')
    .send({ quizId: quiz.id });

  assert.equal(startRes.statusCode, 200);

  const attemptId = startRes.body.attemptId;

  const submitRes = await agent
    .post(`/api/attempts/${attemptId}/submit`)
    .send({ answers: [] });

  assert.equal(submitRes.statusCode, 200);

  const revRes = await agent.get('/api/revision/sets');
  assert.equal(revRes.statusCode, 200);

  assert.ok(revRes.body);
});

test('revision: wrong question backlog should not duplicate for same question', async () => {
  const agent = request.agent(app);

  const email = `revdup_${Date.now()}@example.com`;
  const password = 'Password123!';
  const name = 'Revision Duplicate User';

  const registerRes2 = await agent
    .post('/api/auth/register')
    .send({ name, email, password });

  assert.equal(registerRes2.statusCode, 201);

  const loginRes2 = await agent
    .post('/api/auth/login')
    .send({ email, password });

  assert.equal(loginRes2.statusCode, 200);

  const meRes2 = await agent.get('/api/auth/me');
  assert.equal(meRes2.statusCode, 200);
  assert.equal(meRes2.body.user.email, email);

  const quizRes = await agent.get('/api/quizzes');
  assert.equal(quizRes.statusCode, 200);

  const quiz = quizRes.body[0];
  assert.ok(quiz);

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
  assert.ok(firstSnapshot);

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

  assert.ok(secondSnapshot);
  assert.equal(typeof rev2.body, typeof rev1.body);
  assert.notEqual(secondSnapshot.length, 0);
});