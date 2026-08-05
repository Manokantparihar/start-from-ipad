/**
 * Course progress repository.
 *
 * Storage-agnostic on purpose: the route layer never knows which driver is
 * active. Two interchangeable drivers:
 *
 *  1. Postgres/Supabase driver - used whenever DATABASE_URL is configured and
 *     the course_progress table can be bootstrapped. Durable on serverless.
 *  2. Users-file driver - writes into the existing per-user record through
 *     db.getUsers()/db.saveUsers() (field `courseProgress`). No new data file.
 *
 * Course completion here is deliberately independent from quizzes,
 * attempts, XP, streaks, mastery and the leaderboard. Nothing in this module
 * writes to gamification state.
 */

const pool = require('./db.pg');
const db = require('./db');

const COURSE_ROW = '__course__';

let bootstrapPromise = null;

function hasPostgresConfig() {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Idempotent bootstrap. Resolves true when the Postgres driver is usable.
 */
function ensurePostgres() {
  if (!hasPostgresConfig()) return Promise.resolve(false);
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS course_progress (
          user_id        text NOT NULL,
          course_id      text NOT NULL,
          lesson_id      text NOT NULL,
          completed_at   timestamptz,
          last_opened_at timestamptz,
          last_lesson_id text,
          PRIMARY KEY (user_id, course_id, lesson_id)
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS course_progress_user_idx
          ON course_progress (user_id)
      `);
      return true;
    } catch (error) {
      console.error('course_progress bootstrap failed, using users fallback:', error.message);
      return false;
    }
  })();

  return bootstrapPromise;
}

function nowIso() {
  return new Date().toISOString();
}

function emptyProgress(courseId) {
  return {
    courseId: String(courseId || ''),
    completedLessonIds: [],
    lastLessonId: null,
    lastOpenedAt: null,
    updatedAt: null
  };
}

function normalizeProgress(courseId, raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const ids = Array.isArray(source.completedLessonIds) ? source.completedLessonIds : [];
  return {
    courseId: String(courseId || ''),
    completedLessonIds: Array.from(new Set(ids.map((id) => String(id)).filter(Boolean))),
    lastLessonId: source.lastLessonId ? String(source.lastLessonId) : null,
    lastOpenedAt: source.lastOpenedAt || null,
    updatedAt: source.updatedAt || null
  };
}

/* ------------------------------------------------------------------ *
 * Postgres driver
 * ------------------------------------------------------------------ */

function rowsToProgress(courseId, rows) {
  const progress = emptyProgress(courseId);

  rows.forEach((row) => {
    if (row.lesson_id === COURSE_ROW) {
      progress.lastOpenedAt = row.last_opened_at ? new Date(row.last_opened_at).toISOString() : progress.lastOpenedAt;
      progress.lastLessonId = row.last_lesson_id || progress.lastLessonId;
      progress.updatedAt = progress.lastOpenedAt;
      return;
    }
    if (row.completed_at) {
      progress.completedLessonIds.push(String(row.lesson_id));
      const iso = new Date(row.completed_at).toISOString();
      if (!progress.updatedAt || iso > progress.updatedAt) progress.updatedAt = iso;
    }
  });

  return progress;
}

const pgDriver = {
  async getCourse(userId, courseId) {
    const res = await pool.query(
      'SELECT lesson_id, completed_at, last_opened_at, last_lesson_id FROM course_progress WHERE user_id = $1 AND course_id = $2',
      [userId, courseId]
    );
    return rowsToProgress(courseId, res.rows);
  },

  async getAll(userId) {
    const res = await pool.query(
      'SELECT course_id, lesson_id, completed_at, last_opened_at, last_lesson_id FROM course_progress WHERE user_id = $1',
      [userId]
    );
    const byCourse = new Map();
    res.rows.forEach((row) => {
      const list = byCourse.get(row.course_id) || [];
      list.push(row);
      byCourse.set(row.course_id, list);
    });
    return Array.from(byCourse.entries()).map(([courseId, rows]) => rowsToProgress(courseId, rows));
  },

  async setLessonComplete(userId, courseId, lessonId, done) {
    if (done) {
      await pool.query(
        `INSERT INTO course_progress (user_id, course_id, lesson_id, completed_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (user_id, course_id, lesson_id)
         DO UPDATE SET completed_at = now()`,
        [userId, courseId, lessonId]
      );
    } else {
      await pool.query(
        'DELETE FROM course_progress WHERE user_id = $1 AND course_id = $2 AND lesson_id = $3',
        [userId, courseId, lessonId]
      );
    }
    return this.getCourse(userId, courseId);
  },

  async touchCourse(userId, courseId, lessonId) {
    await pool.query(
      `INSERT INTO course_progress (user_id, course_id, lesson_id, last_opened_at, last_lesson_id)
       VALUES ($1, $2, $3, now(), $4)
       ON CONFLICT (user_id, course_id, lesson_id)
       DO UPDATE SET last_opened_at = now(),
                     last_lesson_id = COALESCE(EXCLUDED.last_lesson_id, course_progress.last_lesson_id)`,
      [userId, courseId, COURSE_ROW, lessonId ? String(lessonId) : null]
    );
    return this.getCourse(userId, courseId);
  }
};

/* ------------------------------------------------------------------ *
 * Users-file driver (no new data file)
 * ------------------------------------------------------------------ */

async function withUser(userId, mutate) {
  const users = await db.getUsers();
  const idx = users.findIndex((entry) => entry.id === userId);
  if (idx === -1) return null;

  const user = users[idx];
  const map = user.courseProgress && typeof user.courseProgress === 'object' ? { ...user.courseProgress } : {};

  if (!mutate) return map;

  const next = mutate(map);
  users[idx] = { ...user, courseProgress: next };
  await db.saveUsers(users);
  return next;
}

const usersDriver = {
  async getCourse(userId, courseId) {
    const map = (await withUser(userId, null)) || {};
    return normalizeProgress(courseId, map[courseId]);
  },

  async getAll(userId) {
    const map = (await withUser(userId, null)) || {};
    return Object.keys(map).map((courseId) => normalizeProgress(courseId, map[courseId]));
  },

  async setLessonComplete(userId, courseId, lessonId, done) {
    const next = await withUser(userId, (map) => {
      const current = normalizeProgress(courseId, map[courseId]);
      const set = new Set(current.completedLessonIds);
      if (done) set.add(String(lessonId));
      else set.delete(String(lessonId));

      return {
        ...map,
        [courseId]: {
          ...current,
          completedLessonIds: Array.from(set),
          updatedAt: nowIso()
        }
      };
    });

    if (!next) return emptyProgress(courseId);
    return normalizeProgress(courseId, next[courseId]);
  },

  async touchCourse(userId, courseId, lessonId) {
    const next = await withUser(userId, (map) => {
      const current = normalizeProgress(courseId, map[courseId]);
      return {
        ...map,
        [courseId]: {
          ...current,
          lastLessonId: lessonId ? String(lessonId) : current.lastLessonId,
          lastOpenedAt: nowIso(),
          updatedAt: nowIso()
        }
      };
    });

    if (!next) return emptyProgress(courseId);
    return normalizeProgress(courseId, next[courseId]);
  }
};

/* ------------------------------------------------------------------ *
 * Public interface
 * ------------------------------------------------------------------ */

async function getDriver() {
  const usePg = await ensurePostgres();
  return usePg ? pgDriver : usersDriver;
}

async function run(operation) {
  const driver = await getDriver();
  try {
    return await operation(driver);
  } catch (error) {
    if (driver === pgDriver) {
      console.error('course_progress query failed, using users fallback:', error.message);
      return operation(usersDriver);
    }
    throw error;
  }
}

async function getUserCourseProgress(userId, courseId) {
  if (!userId || !courseId) return emptyProgress(courseId);
  return run((driver) => driver.getCourse(String(userId), String(courseId)));
}

async function getUserProgressSummary(userId) {
  if (!userId) return [];
  return run((driver) => driver.getAll(String(userId)));
}

async function setLessonComplete(userId, courseId, lessonId, done = true) {
  if (!userId || !courseId || !lessonId) return emptyProgress(courseId);
  return run((driver) => driver.setLessonComplete(String(userId), String(courseId), String(lessonId), Boolean(done)));
}

async function touchCourse(userId, courseId, lessonId = null) {
  if (!userId || !courseId) return emptyProgress(courseId);
  return run((driver) => driver.touchCourse(String(userId), String(courseId), lessonId));
}

/**
 * One-time merge of device-local progress after sign-in. Additive only:
 * a lesson completed locally is never un-completed server-side.
 */
async function mergeLocalProgress(userId, courseId, local = {}) {
  if (!userId || !courseId) return emptyProgress(courseId);

  const incoming = normalizeProgress(courseId, local);
  const current = await getUserCourseProgress(userId, courseId);
  const missing = incoming.completedLessonIds.filter((id) => !current.completedLessonIds.includes(id));

  let result = current;
  for (const lessonId of missing) {
    result = await setLessonComplete(userId, courseId, lessonId, true);
  }

  if (incoming.lastLessonId || incoming.lastOpenedAt) {
    result = await touchCourse(userId, courseId, incoming.lastLessonId || current.lastLessonId);
  }

  return result;
}

module.exports = {
  getUserCourseProgress,
  getUserProgressSummary,
  setLessonComplete,
  touchCourse,
  mergeLocalProgress,
  emptyProgress,
  COURSE_ROW
};
