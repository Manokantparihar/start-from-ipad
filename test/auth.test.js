const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');
const { getAuthCookieOptions } = require('../src/routes/auth');

test('getAuthCookieOptions enables secure cross-site cookies for proxied HTTPS in production', () => {
  const options = getAuthCookieOptions({ headers: { 'x-forwarded-proto': 'https' } }, { isProduction: true });

  assert.equal(options.secure, true);
  assert.equal(options.sameSite, 'none');
  assert.equal(options.path, '/');
});

test('register, login, and access /api/auth/me', async () => {
  const agent = request.agent(app);

  const email = `testci_${Date.now()}@example.com`;
  const password = 'Password123!';
  const name = 'CI Test User';

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
});