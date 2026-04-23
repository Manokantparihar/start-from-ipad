const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const app = require('../app');
const db = require('../src/utils/db');
const config = require('../src/config');

function mockLeaderboardDb(t, { users = [], attempts = [], quizzes = [], groups = [] } = {}) {
  const originals = {
    getUsers: db.getUsers,
    getAttempts: db.getAttempts,
    getQuizzes: db.getQuizzes,
    getGroups: db.getGroups
  };

  db.getUsers = async () => users;
  db.getAttempts = async () => attempts;
  db.getQuizzes = async () => quizzes;
  db.getGroups = async () => groups;

  t.after(() => {
    db.getUsers = originals.getUsers;
    db.getAttempts = originals.getAttempts;
    db.getQuizzes = originals.getQuizzes;
    db.getGroups = originals.getGroups;
  });
}

function makeCompletedAttempt({
  id,
  userId,
  quizId,
  score,
  total,
  durationSeconds,
  completedAt = Date.now()
}) {
  const end = Number(completedAt);
  const start = end - (Number(durationSeconds) * 1000);

  return {
    id,
    userId,
    quizId,
    score,
    total,
    status: 'completed',
    startedAt: start,
    completedAt: end
  };
}

test('leaderboard: public fetch works for active endpoints', async (t) => {
  mockLeaderboardDb(t, {
    users: [
      { id: 'u1', name: 'Alice', accuracyPercent: 82 },
      { id: 'u2', name: 'Bob', accuracyPercent: 75 }
    ],
    quizzes: [
      { id: 'q1', topic: 'Math', questions: [{ id: 'x1', topic: 'Math' }] }
    ],
    attempts: [
      makeCompletedAttempt({
        id: 'a1',
        userId: 'u1',
        quizId: 'q1',
        score: 8,
        total: 10,
        durationSeconds: 120
      }),
      makeCompletedAttempt({
        id: 'a2',
        userId: 'u2',
        quizId: 'q1',
        score: 7,
        total: 10,
        durationSeconds: 100
      })
    ],
    groups: [
      { id: 'g1', name: 'Group One', description: 'Test group' }
    ]
  });

  const overallRes = await request(app).get('/api/leaderboard/overall');
  assert.equal(overallRes.statusCode, 200);
  assert.ok(Array.isArray(overallRes.body.leaderboard));

  const streakRes = await request(app).get('/api/leaderboard/streak');
  assert.equal(streakRes.statusCode, 200);
  assert.ok(Array.isArray(streakRes.body.leaderboard));

  const weeklyRes = await request(app).get('/api/leaderboard/weekly');
  assert.equal(weeklyRes.statusCode, 200);
  assert.ok(Array.isArray(weeklyRes.body.leaderboard));

  const topicRes = await request(app).get('/api/leaderboard/topic?topic=Math');
  assert.equal(topicRes.statusCode, 200);
  assert.ok(Array.isArray(topicRes.body.leaderboard));
  assert.ok(Array.isArray(topicRes.body.topics));

  const groupRes = await request(app).get('/api/leaderboard/group/g1');
  assert.equal(groupRes.statusCode, 200);
  assert.ok(Array.isArray(groupRes.body.leaderboard));
  assert.equal(groupRes.body.group.id, 'g1');
});

test('leaderboard: overall ranking follows current order behavior', async (t) => {
  mockLeaderboardDb(t, {
    users: [
      { id: 'u1', name: 'Alice', accuracyPercent: 80 },
      { id: 'u2', name: 'Bob', accuracyPercent: 90 },
      { id: 'u3', name: 'Cara', accuracyPercent: 80 }
    ],
    quizzes: [{ id: 'q1', topic: 'Math', questions: [{ id: 'm1', topic: 'Math' }] }],
    attempts: [
      makeCompletedAttempt({
        id: 'a1',
        userId: 'u1',
        quizId: 'q1',
        score: 8,
        total: 10,
        durationSeconds: 100
      }),
      makeCompletedAttempt({
        id: 'a2',
        userId: 'u2',
        quizId: 'q1',
        score: 9,
        total: 10,
        durationSeconds: 300
      }),
      makeCompletedAttempt({
        id: 'a3',
        userId: 'u3',
        quizId: 'q1',
        score: 8,
        total: 10,
        durationSeconds: 200
      })
    ]
  });

  const res = await request(app).get('/api/leaderboard/overall?limit=10');
  assert.equal(res.statusCode, 200);

  const names = res.body.leaderboard.map((entry) => entry.name);
  assert.deepEqual(names, ['Bob', 'Alice', 'Cara']);

  const ranks = res.body.leaderboard.map((entry) => entry.rank);
  assert.deepEqual(ranks, [1, 2, 3]);
});

test('leaderboard: response shape matches current API fields', async (t) => {
  mockLeaderboardDb(t, {
    users: [
      { id: 'u1', name: 'Shape User', accuracyPercent: 88, totalXp: 120, currentStreak: 4 }
    ],
    quizzes: [{ id: 'q1', topic: 'Science', questions: [{ id: 's1', topic: 'Science' }] }],
    attempts: [
      makeCompletedAttempt({
        id: 'a1',
        userId: 'u1',
        quizId: 'q1',
        score: 9,
        total: 10,
        durationSeconds: 90
      })
    ]
  });

  const res = await request(app).get('/api/leaderboard/overall');
  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.body.leaderboard), true);
  assert.equal(res.body.leaderboard.length, 1);

  const row = res.body.leaderboard[0];
  assert.ok(Object.hasOwn(row, 'rank'));
  assert.ok(Object.hasOwn(row, 'name'));
  assert.ok(Object.hasOwn(row, 'totalXp'));
  assert.ok(Object.hasOwn(row, 'accuracyPercent'));
  assert.ok(Object.hasOwn(row, 'weeklyAccuracyPercent'));
  assert.ok(Object.hasOwn(row, 'rankScore'));
  assert.ok(Object.hasOwn(row, 'weeklyXp'));
  assert.ok(Object.hasOwn(row, 'weeklyCompletedQuizzes'));
  assert.ok(Object.hasOwn(row, 'totalMarks'));
  assert.ok(Object.hasOwn(row, 'totalTimeTakenSeconds'));
  assert.ok(Object.hasOwn(row, 'currentStreak'));
  assert.ok(Object.hasOwn(row, 'tier'));
  assert.ok(Object.hasOwn(row, 'isCurrentUser'));
});

test('leaderboard: authenticated request sets viewer for current user', async (t) => {
  mockLeaderboardDb(t, {
    users: [
      { id: 'viewer-1', name: 'Viewer User', accuracyPercent: 91 },
      { id: 'other-1', name: 'Other User', accuracyPercent: 80 }
    ],
    quizzes: [{ id: 'q1', topic: 'History', questions: [{ id: 'h1', topic: 'History' }] }],
    attempts: [
      makeCompletedAttempt({
        id: 'a1',
        userId: 'viewer-1',
        quizId: 'q1',
        score: 9,
        total: 10,
        durationSeconds: 100
      }),
      makeCompletedAttempt({
        id: 'a2',
        userId: 'other-1',
        quizId: 'q1',
        score: 8,
        total: 10,
        durationSeconds: 120
      })
    ]
  });

  const token = jwt.sign({ userId: 'viewer-1' }, config.jwtSecret, { expiresIn: '1h' });

  const res = await request(app)
    .get('/api/leaderboard/overall')
    .set('Cookie', [`token=${token}`]);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.viewer);
  assert.equal(res.body.viewer.name, 'Viewer User');
  assert.equal(res.body.viewer.isCurrentUser, true);
});

test('leaderboard: empty and single-participant edge cases remain stable', async (t) => {
  mockLeaderboardDb(t, {
    users: [],
    attempts: [],
    quizzes: []
  });

  const emptyRes = await request(app).get('/api/leaderboard/overall');
  assert.equal(emptyRes.statusCode, 200);
  assert.deepEqual(emptyRes.body.leaderboard, []);
  assert.equal(emptyRes.body.viewer, null);

  db.getUsers = async () => [
    { id: 'solo-1', name: 'Solo User', accuracyPercent: 70 }
  ];
  db.getQuizzes = async () => [
    { id: 'q1', topic: 'General', questions: [{ id: 'g1', topic: 'General' }] }
  ];
  db.getAttempts = async () => [
    makeCompletedAttempt({
      id: 'a1',
      userId: 'solo-1',
      quizId: 'q1',
      score: 6,
      total: 10,
      durationSeconds: 80
    })
  ];

  const singleRes = await request(app).get('/api/leaderboard/overall');
  assert.equal(singleRes.statusCode, 200);
  assert.equal(singleRes.body.leaderboard.length, 1);
  assert.equal(singleRes.body.leaderboard[0].name, 'Solo User');
  assert.equal(singleRes.body.leaderboard[0].rank, null);
});

test('leaderboard: no unauthorized rejection because endpoint is public', async (t) => {
  mockLeaderboardDb(t, {
    users: [
      { id: 'u1', name: 'Public User', accuracyPercent: 80 },
      { id: 'u2', name: 'Public User 2', accuracyPercent: 75 }
    ],
    quizzes: [{ id: 'q1', topic: 'Math', questions: [{ id: 'm1', topic: 'Math' }] }],
    attempts: [
      makeCompletedAttempt({
        id: 'a1',
        userId: 'u1',
        quizId: 'q1',
        score: 8,
        total: 10,
        durationSeconds: 110
      }),
      makeCompletedAttempt({
        id: 'a2',
        userId: 'u2',
        quizId: 'q1',
        score: 7,
        total: 10,
        durationSeconds: 130
      })
    ]
  });

  const res = await request(app)
    .get('/api/leaderboard/overall')
    .set('Cookie', ['token=not-a-valid-jwt']);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.viewer, null);
});
