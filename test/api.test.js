const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');

test('GET / should return 200', async () => {
  const res = await request(app).get('/');
  assert.equal(res.statusCode, 200);
});