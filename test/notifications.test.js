const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../app');
const { createNotification } = require('../src/routes/notifications');

async function registerAndLoginUser() {
  const agent = request.agent(app);
  const email = `notif_${Date.now()}_${Math.floor(Math.random() * 10000)}@example.com`;
  const password = 'Password123!';
  const name = 'Notification Test User';

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

  return {
    agent,
    user: meRes.body.user
  };
}

test('notifications: unauthenticated access is rejected', async () => {
  const resList = await request(app).get('/api/notifications');
  assert.equal(resList.statusCode, 401);

  const resUnread = await request(app).get('/api/notifications/unread-count');
  assert.equal(resUnread.statusCode, 401);

  const resMarkAll = await request(app).patch('/api/notifications/read-all');
  assert.equal(resMarkAll.statusCode, 401);
});

test('notifications: fetch unread count, mark-one, mark-all, and archive flow', async () => {
  const { agent, user } = await registerAndLoginUser();

  const n1 = await createNotification({
    userId: user.id,
    type: 'announcement',
    title: 'Announcement 1',
    message: 'Message 1'
  });

  const n2 = await createNotification({
    userId: user.id,
    type: 'quiz',
    title: 'Quiz 1',
    message: 'Message 2'
  });

  const n3 = await createNotification({
    userId: user.id,
    type: 'revision',
    title: 'Revision 1',
    message: 'Message 3'
  });

  const listRes = await agent.get('/api/notifications');
  assert.equal(listRes.statusCode, 200);
  assert.ok(Array.isArray(listRes.body.notifications));
  assert.equal(listRes.body.unreadCount, 3);

  const unreadRes = await agent.get('/api/notifications/unread-count');
  assert.equal(unreadRes.statusCode, 200);
  assert.equal(unreadRes.body.unreadCount, 3);

  const markOneRes = await agent.patch(`/api/notifications/${encodeURIComponent(n1.id)}/read`);
  assert.equal(markOneRes.statusCode, 200);
  assert.equal(markOneRes.body.notification.id, n1.id);
  assert.equal(markOneRes.body.notification.read, true);

  const unreadAfterOneRes = await agent.get('/api/notifications/unread-count');
  assert.equal(unreadAfterOneRes.statusCode, 200);
  assert.equal(unreadAfterOneRes.body.unreadCount, 2);

  const markAllRes = await agent.patch('/api/notifications/read-all');
  assert.equal(markAllRes.statusCode, 200);

  const unreadAfterAllRes = await agent.get('/api/notifications/unread-count');
  assert.equal(unreadAfterAllRes.statusCode, 200);
  assert.equal(unreadAfterAllRes.body.unreadCount, 0);

  const archiveBulkRes = await agent
    .patch('/api/notifications/archive')
    .send({ ids: [n2.id, n3.id] });

  assert.equal(archiveBulkRes.statusCode, 200);
  assert.equal(archiveBulkRes.body.changed, 2);

  const archiveOneRes = await agent
    .patch(`/api/notifications/${encodeURIComponent(n1.id)}/archive`)
    .send({ archived: true });

  assert.equal(archiveOneRes.statusCode, 200);
  assert.equal(archiveOneRes.body.notification.archived, true);

  const unarchiveOneRes = await agent
    .patch(`/api/notifications/${encodeURIComponent(n1.id)}/archive`)
    .send({ archived: false });

  assert.equal(unarchiveOneRes.statusCode, 200);
  assert.equal(unarchiveOneRes.body.notification.archived, false);

  const finalListRes = await agent.get('/api/notifications');
  assert.equal(finalListRes.statusCode, 200);

  const finalById = new Map(finalListRes.body.notifications.map((item) => [item.id, item]));
  assert.equal(finalById.get(n2.id).archived, true);
  assert.equal(finalById.get(n3.id).archived, true);
  assert.equal(finalById.get(n1.id).archived, false);
});
