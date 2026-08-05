// CourseProgress Module
// Single source of truth for course progress in the browser.
//
// Signed-in users: progress is stored on the account through /api/courses/*.
// Guests: progress falls back to localStorage and is merged into the account
// once, the first time the same course is opened while signed in.
//
// Course progress is fully independent from quizzes, accuracy, mastery,
// streaks and the leaderboard. Nothing here touches practice state.
const CourseProgress = (() => {
  const LOCAL_PREFIX = 'course-progress:';
  const MERGED_PREFIX = 'course-progress-merged:';

  function localKey(courseId) {
    return `${LOCAL_PREFIX}${courseId}`;
  }

  function readLocal(courseId) {
    try {
      const payload = JSON.parse(localStorage.getItem(localKey(courseId)) || 'null');
      return {
        completedLessonIds: Array.isArray(payload?.completedLessonIds) ? payload.completedLessonIds.map(String) : [],
        lastLessonId: payload?.lastLessonId || null,
        lastOpenedAt: payload?.lastOpenedAt || null
      };
    } catch {
      return { completedLessonIds: [], lastLessonId: null, lastOpenedAt: null };
    }
  }

  function writeLocal(courseId, payload) {
    try {
      localStorage.setItem(localKey(courseId), JSON.stringify(payload));
    } catch {
      /* storage unavailable - progress simply is not cached */
    }
  }

  function summarize(courseId, raw, totalLessonsHint) {
    const completedLessonIds = Array.isArray(raw.completedLessonIds) ? raw.completedLessonIds.map(String) : [];
    const totalLessons = Number.isFinite(Number(raw.totalLessons))
      ? Number(raw.totalLessons)
      : Math.max(0, Number(totalLessonsHint) || 0);
    const completedLessons = Number.isFinite(Number(raw.completedLessons))
      ? Number(raw.completedLessons)
      : Math.min(completedLessonIds.length, totalLessons || completedLessonIds.length);

    return {
      courseId: String(courseId),
      completedLessonIds,
      completedLessons,
      totalLessons,
      percent: Number.isFinite(Number(raw.percent))
        ? Number(raw.percent)
        : (totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0),
      lastLessonId: raw.lastLessonId || null,
      lastOpenedAt: raw.lastOpenedAt || null,
      modules: Array.isArray(raw.modules) ? raw.modules : [],
      storage: raw.storage || 'device'
    };
  }

  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'include', ...options });
    if (response.status === 401) return null;
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || 'Course progress request failed.');
    return payload;
  }

  function jsonPost(body) {
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    };
  }

  /** Milestone chips: 25 / 50 / 75 / 100 percent. */
  function milestones(percent) {
    return [25, 50, 75, 100].map((value) => ({ value, reached: Number(percent || 0) >= value }));
  }

  async function mergeOnce(courseId) {
    const flag = `${MERGED_PREFIX}${courseId}`;
    let alreadyMerged = false;
    try {
      alreadyMerged = localStorage.getItem(flag) === '1';
    } catch {
      alreadyMerged = true;
    }
    if (alreadyMerged) return null;

    const local = readLocal(courseId);
    if (!local.completedLessonIds.length && !local.lastLessonId) {
      try { localStorage.setItem(flag, '1'); } catch { /* ignore */ }
      return null;
    }

    const merged = await request(
      `/api/courses/${encodeURIComponent(courseId)}/progress/merge`,
      jsonPost(local)
    ).catch(() => null);

    if (merged) {
      try { localStorage.setItem(flag, '1'); } catch { /* ignore */ }
    }
    return merged;
  }

  /**
   * Loads progress for one course. `totalLessons` is used only when the
   * device fallback is active (guests), where the server total is unknown.
   */
  async function load(courseId, { totalLessons = 0, merge = false } = {}) {
    if (!courseId) return summarize(courseId, { completedLessonIds: [] }, totalLessons);

    try {
      if (merge) await mergeOnce(courseId);
      const payload = await request(`/api/courses/${encodeURIComponent(courseId)}/progress`);
      if (payload) return summarize(courseId, payload, totalLessons);
    } catch {
      /* fall through to the device fallback */
    }

    return summarize(courseId, readLocal(courseId), totalLessons);
  }

  async function setLessonComplete(courseId, lessonId, completed, { totalLessons = 0 } = {}) {
    try {
      const payload = await request(
        `/api/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/complete`,
        jsonPost({ completed })
      );
      if (payload) return summarize(courseId, payload, totalLessons);
    } catch {
      /* fall through to the device fallback */
    }

    const local = readLocal(courseId);
    const set = new Set(local.completedLessonIds);
    if (completed) set.add(String(lessonId));
    else set.delete(String(lessonId));

    const next = { ...local, completedLessonIds: Array.from(set), lastOpenedAt: new Date().toISOString() };
    writeLocal(courseId, next);
    return summarize(courseId, next, totalLessons);
  }

  async function markOpened(courseId, lessonId, { totalLessons = 0 } = {}) {
    try {
      const payload = await request(
        `/api/courses/${encodeURIComponent(courseId)}/opened`,
        jsonPost({ lessonId: lessonId || null })
      );
      if (payload) return summarize(courseId, payload, totalLessons);
    } catch {
      /* fall through to the device fallback */
    }

    const local = readLocal(courseId);
    const next = {
      ...local,
      lastLessonId: lessonId ? String(lessonId) : local.lastLessonId,
      lastOpenedAt: new Date().toISOString()
    };
    writeLocal(courseId, next);
    return summarize(courseId, next, totalLessons);
  }

  /** Progress for many courses at once (resources list, dashboard card). */
  async function loadSummary() {
    try {
      const payload = await request('/api/courses/progress/summary');
      if (payload && Array.isArray(payload.courses)) {
        const map = new Map();
        payload.courses.forEach((entry) => {
          map.set(String(entry.courseId), summarize(entry.courseId, { ...entry, storage: 'account' }, entry.totalLessons));
        });
        return { storage: 'account', byCourse: map, list: payload.courses };
      }
    } catch {
      /* fall through to the device fallback */
    }
    return { storage: 'device', byCourse: new Map(), list: [] };
  }

  /** Progress for a single course card without a network call, for guests. */
  function fromDevice(courseId, totalLessons) {
    return summarize(courseId, readLocal(courseId), totalLessons);
  }

  return {
    load,
    loadSummary,
    fromDevice,
    setLessonComplete,
    markOpened,
    milestones
  };
})();

if (typeof window !== 'undefined') {
  window.CourseProgress = CourseProgress;
}
