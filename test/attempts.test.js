const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../app');

async function registerAndLoginUser(prefix = 'attempts') {
  const agent = request.agent(app);
  const email = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}@example.com`;
  const password = 'Password123!';
  const name = `${prefix} user`;

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

  return { agent, user: meRes.body.user };
}

async function getQuizFixture(agent) {
  const quizzesRes = await agent.get('/api/quizzes');
  assert.equal(quizzesRes.statusCode, 200);
  assert.ok(Array.isArray(quizzesRes.body));
  assert.ok(quizzesRes.body.length > 0, 'expected at least one quiz in seed data');

  const quiz = quizzesRes.body[0];
  const quizDetailsRes = await agent.get(`/api/quizzes/${quiz.id}`);
  assert.equal(quizDetailsRes.statusCode, 200);
  assert.ok(Array.isArray(quizDetailsRes.body.questions));
  assert.ok(quizDetailsRes.body.questions.length > 0, 'quiz must have at least one question');

  const firstQuestion = quizDetailsRes.body.questions[0];
  const selected = Array.isArray(firstQuestion.options) && firstQuestion.options.length > 0
    ? firstQuestion.options[0]
    : '';

  return {
    quizId: quiz.id,
    firstAnswer: {
      questionId: firstQuestion.id,
      selected
    }
  };
}

test('attempts: start endpoint requires auth and submit endpoint rejects unauthorized', async () => {
  const unauthStart = await request(app)
    .post('/api/attempts')
    .send({ quizId: 'quiz-1' });

  assert.equal(unauthStart.statusCode, 401);

  const unauthSubmit = await request(app)
    .post('/api/attempts/non-existent-id/submit')
    .send({ answers: [] });

  assert.equal(unauthSubmit.statusCode, 401);
});

test('attempts: POST /api/attempts returns attemptId and attaches requested quizId', async () => {
  const { agent } = await registerAndLoginUser('attempt_start');
  const { quizId } = await getQuizFixture(agent);

  const startRes = await agent
    .post('/api/attempts')
    .send({ quizId });

  assert.equal(startRes.statusCode, 200);
  assert.equal(typeof startRes.body.attemptId, 'string');
  assert.ok(startRes.body.attemptId.length > 0);

  const attemptRes = await agent.get(`/api/attempts/${startRes.body.attemptId}`);
  assert.equal(attemptRes.statusCode, 200);
  assert.equal(attemptRes.body.id, startRes.body.attemptId);
  assert.equal(attemptRes.body.quizId, quizId);
  assert.equal(attemptRes.body.status, 'in-progress');
});

test('attempts: PUT /api/attempts/:id/save persists answers and does not finalize attempt', async () => {
  const { agent } = await registerAndLoginUser('attempt_save');
  const { quizId, firstAnswer } = await getQuizFixture(agent);

  const startRes = await agent.post('/api/attempts').send({ quizId });
  assert.equal(startRes.statusCode, 200);

  const answers = [firstAnswer];
  const saveRes = await agent
    .put(`/api/attempts/${startRes.body.attemptId}/save`)
    .send({ answers });

  assert.equal(saveRes.statusCode, 200);
  assert.equal(saveRes.body.saved, true);

  const attemptRes = await agent.get(`/api/attempts/${startRes.body.attemptId}`);
  assert.equal(attemptRes.statusCode, 200);
  assert.deepEqual(attemptRes.body.answers, answers);
  assert.equal(attemptRes.body.status, 'in-progress');
  assert.equal(attemptRes.body.completedAt, undefined);
});

test('attempts: POST /api/attempts/:id/submit finalizes attempt and returns score payload', async () => {
  const { agent } = await registerAndLoginUser('attempt_submit');
  const { quizId, firstAnswer } = await getQuizFixture(agent);

  const startRes = await agent.post('/api/attempts').send({ quizId });
  assert.equal(startRes.statusCode, 200);

  const submitRes = await agent
    .post(`/api/attempts/${startRes.body.attemptId}/submit`)
    .send({ answers: [firstAnswer] });

  assert.equal(submitRes.statusCode, 200);
  assert.equal(submitRes.body.completed, true);
  assert.equal(typeof submitRes.body.score, 'number');
  assert.equal(typeof submitRes.body.total, 'number');
  assert.ok(submitRes.body.total >= 1);
  assert.ok(submitRes.body.score >= 0);
  assert.ok(submitRes.body.score <= submitRes.body.total);

  const attemptRes = await agent.get(`/api/attempts/${startRes.body.attemptId}`);
  assert.equal(attemptRes.statusCode, 200);
  assert.ok(['completed', 'expired'].includes(attemptRes.body.status));
  assert.equal(typeof attemptRes.body.completedAt, 'number');
  assert.equal(attemptRes.body.score, submitRes.body.score);
  assert.equal(attemptRes.body.total, submitRes.body.total);
});

test('attempts: result shape is stable in insights response with score and counts', async () => {
  const { agent } = await registerAndLoginUser('attempt_result');
  const { quizId } = await getQuizFixture(agent);

  const startRes = await agent.post('/api/attempts').send({ quizId });
  assert.equal(startRes.statusCode, 200);

  const submitRes = await agent
    .post(`/api/attempts/${startRes.body.attemptId}/submit`)
    .send({ answers: [] });

  assert.equal(submitRes.statusCode, 200);

  const insightsRes = await agent.get(`/api/attempts/${startRes.body.attemptId}/insights`);
  assert.equal(insightsRes.statusCode, 200);

  const result = insightsRes.body;
  assert.equal(result.attemptId, startRes.body.attemptId);
  assert.equal(result.quizId, quizId);
  assert.equal(typeof result.score, 'number');
  assert.equal(typeof result.totalQuestions, 'number');
  assert.equal(typeof result.correctAnswers, 'number');
  assert.equal(typeof result.incorrectAnswers, 'number');
  assert.equal(typeof result.unattemptedQuestions, 'number');

  assert.equal(
    result.correctAnswers + result.incorrectAnswers + result.unattemptedQuestions,
    result.totalQuestions
  );

  assert.equal(result.score, submitRes.body.score);
  assert.equal(result.totalQuestions, submitRes.body.total);

  if (result.ranking) {
    assert.equal(typeof result.ranking.quizRank, 'number');
    assert.equal(typeof result.ranking.percentile, 'number');
    assert.equal(typeof result.ranking.totalParticipants, 'number');
  }
});

test('attempts: submit edge cases for invalid attemptId and double-submit', async () => {
  const { agent } = await registerAndLoginUser('attempt_edges');
  const { quizId } = await getQuizFixture(agent);

  const invalidSubmitRes = await agent
    .post('/api/attempts/invalid-attempt-id/submit')
    .send({ answers: [] });

  assert.equal(invalidSubmitRes.statusCode, 404);

  const startRes = await agent.post('/api/attempts').send({ quizId });
  assert.equal(startRes.statusCode, 200);

  const firstSubmitRes = await agent
    .post(`/api/attempts/${startRes.body.attemptId}/submit`)
    .send({ answers: [] });

  assert.equal(firstSubmitRes.statusCode, 200);

  const secondSubmitRes = await agent
    .post(`/api/attempts/${startRes.body.attemptId}/submit`)
    .send({ answers: [] });

  assert.equal(secondSubmitRes.statusCode, 400);
  assert.equal(secondSubmitRes.body.error, 'Attempt already submitted');
});
