function toUtcDateKey(ts) {
  if (!ts) return null;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeTopicKey(value) {
  const text = String(value || '').trim();
  return text ? text.toLowerCase() : '';
}

function normalizeTopicLabel(value) {
  return String(value || '').trim();
}

function resolveQuizTopic(quiz) {
  const directTopic = normalizeTopicLabel(quiz?.topic);
  if (directTopic) {
    return { key: normalizeTopicKey(directTopic), label: directTopic };
  }

  if (Array.isArray(quiz?.questions)) {
    for (const question of quiz.questions) {
      const questionTopic = normalizeTopicLabel(question?.topic);
      if (questionTopic) {
        return { key: normalizeTopicKey(questionTopic), label: questionTopic };
      }
    }
  }

  return { key: '', label: '' };
}

function isCountableAttempt(attempt) {
  if (!attempt || !attempt.quizId) return false;
  if (attempt.status === 'completed') return true;

  const score = Number(attempt.score);
  const total = Number(attempt.total);
  return attempt.status === 'expired' && Number.isFinite(score) && Number.isFinite(total) && total > 0;
}

function getAttemptPercent(attempt) {
  const total = Number(attempt?.total);
  const score = Number(attempt?.score);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(score)) return 0;
  return Math.round((score / total) * 100);
}

function previousDateKey(dateKey) {
  if (!dateKey) return null;
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function computeStreakMetrics(dateKeys, referenceDate = new Date()) {
  const uniqueDates = Array.from(new Set(dateKeys.filter(Boolean))).sort();
  if (uniqueDates.length === 0) {
    return { currentStreak: 0, bestStreak: 0, lastActiveDate: null };
  }

  let bestStreak = 0;
  let run = 0;
  let previous = null;

  for (const dateKey of uniqueDates) {
    if (!previous) {
      run = 1;
    } else if (previousDateKey(dateKey) === previous) {
      run += 1;
    } else {
      run = 1;
    }
    bestStreak = Math.max(bestStreak, run);
    previous = dateKey;
  }

  const lastActiveDate = uniqueDates[uniqueDates.length - 1];
  const todayKey = toUtcDateKey(referenceDate);
  const yesterdayKey = previousDateKey(todayKey);
  let currentStreak = 0;

  if (lastActiveDate === todayKey || lastActiveDate === yesterdayKey) {
    currentStreak = 1;
    let cursor = lastActiveDate;
    for (let index = uniqueDates.length - 2; index >= 0; index -= 1) {
      const dateKey = uniqueDates[index];
      if (previousDateKey(cursor) === dateKey) {
        currentStreak += 1;
        cursor = dateKey;
      } else {
        break;
      }
    }
  }

  return { currentStreak, bestStreak, lastActiveDate };
}

function buildLeaderboardSummaries({ users = [], attempts = [], quizzes = [], topicKey = '' } = {}) {
  const userMap = new Map(users.map((user) => [user.id, user]));
  const quizMap = new Map(quizzes.map((quiz) => [quiz.id, quiz]));
  const topicIndex = new Map();
  const summaries = new Map();
  const normalizedTopicKey = normalizeTopicKey(topicKey);

  const ensureSummary = (userId) => {
    if (!summaries.has(userId)) {
      const user = userMap.get(userId) || {};
      summaries.set(userId, {
        userId,
        name: user.name || user.username || 'Unknown',
        profileImage: user.profileImage || null,
        totalCompleted: 0,
        totalScore: 0,
        dateKeys: new Set()
      });
    }
    return summaries.get(userId);
  };

  for (const quiz of quizzes) {
    const topic = resolveQuizTopic(quiz);
    if (topic.key) {
      topicIndex.set(topic.key, topic.label);
    }
  }

  for (const attempt of attempts) {
    if (!isCountableAttempt(attempt)) continue;

    const quiz = quizMap.get(attempt.quizId) || {};
    const topic = resolveQuizTopic(quiz);
    if (topic.key) {
      topicIndex.set(topic.key, topic.label);
    }

    if (normalizedTopicKey && topic.key !== normalizedTopicKey) continue;

    const summary = ensureSummary(attempt.userId);
    summary.totalCompleted += 1;
    summary.totalScore += getAttemptPercent(attempt);

    const dateKey = toUtcDateKey(attempt.completedAt || attempt.createdAt || attempt.startedAt);
    if (dateKey) summary.dateKeys.add(dateKey);

    if (topic.key) {
      if (!summary.topics) summary.topics = new Map();
      if (!summary.topics.has(topic.key)) {
        summary.topics.set(topic.key, { label: topic.label, totalCompleted: 0, totalScore: 0 });
      }
      const topicStats = summary.topics.get(topic.key);
      topicStats.totalCompleted += 1;
      topicStats.totalScore += getAttemptPercent(attempt);
    }
  }

  const rows = Array.from(summaries.values()).map((summary) => {
    const averageScore = summary.totalCompleted > 0
      ? Math.round(summary.totalScore / summary.totalCompleted)
      : 0;
    const streakMetrics = computeStreakMetrics(Array.from(summary.dateKeys));

    return {
      userId: summary.userId,
      name: summary.name,
      profileImage: summary.profileImage,
      averageScore,
      totalCompleted: summary.totalCompleted,
      currentStreak: streakMetrics.currentStreak,
      bestStreak: streakMetrics.bestStreak,
      lastActiveDate: streakMetrics.lastActiveDate,
      topics: summary.topics || new Map()
    };
  });

  return {
    rows,
    topics: Array.from(topicIndex.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  };
}

function sortOverallRows(rows) {
  return [...rows].sort((a, b) => {
    if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
    if (b.totalCompleted !== a.totalCompleted) return b.totalCompleted - a.totalCompleted;
    if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
    return a.name.localeCompare(b.name);
  });
}

function sortStreakRows(rows) {
  return [...rows].sort((a, b) => {
    if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
    if (b.bestStreak !== a.bestStreak) return b.bestStreak - a.bestStreak;
    if (b.totalCompleted !== a.totalCompleted) return b.totalCompleted - a.totalCompleted;
    return a.name.localeCompare(b.name);
  });
}

function sortTopicRows(rows) {
  return [...rows].sort((a, b) => {
    if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
    if (b.totalCompleted !== a.totalCompleted) return b.totalCompleted - a.totalCompleted;
    if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
    return a.name.localeCompare(b.name);
  });
}

function stripLeaderboardRow(row, rank, includeStreak = false, isCurrentUser = false) {
  const payload = {
    rank,
    name: row.name,
    profileImage: row.profileImage || null,
    averageScore: row.averageScore,
    totalCompleted: row.totalCompleted,
    isCurrentUser: Boolean(isCurrentUser)
  };

  if (includeStreak) {
    payload.currentStreak = row.currentStreak;
    payload.bestStreak = row.bestStreak;
    payload.lastActiveDate = row.lastActiveDate || null;
  }

  return payload;
}

function buildLeaderboardResponse({ mode, users, attempts, quizzes, limit = 10, viewerUserId = null, topicKey = '' } = {}) {
  const { rows, topics } = buildLeaderboardSummaries({ users, attempts, quizzes, topicKey });
  const rankedRows = mode === 'streak'
    ? sortStreakRows(rows)
    : mode === 'topic'
      ? sortTopicRows(rows)
      : sortOverallRows(rows);

  const effectiveLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(50, Number(limit))) : 10;
  const rankedWithPositions = rankedRows.map((row, index) => ({ ...row, rank: index + 1 }));
  const limitedRows = rankedWithPositions.slice(0, effectiveLimit);
  const viewer = viewerUserId
    ? rankedWithPositions.find((row) => row.userId === viewerUserId) || null
    : null;

  return {
    entries: limitedRows.map((row) => stripLeaderboardRow(row, row.rank, mode !== 'topic', row.userId === viewerUserId)),
    viewer: viewer
      ? stripLeaderboardRow(viewer, viewer.rank, mode !== 'topic', true)
      : null,
    topics
  };
}

function computeUserStreakSnapshot({ attempts = [], quizzes = [], userId }) {
  const userDates = [];

  for (const attempt of attempts) {
    if (attempt.userId !== userId || !isCountableAttempt(attempt)) continue;
    const dateKey = toUtcDateKey(attempt.completedAt || attempt.createdAt || attempt.startedAt);
    if (dateKey) userDates.push(dateKey);
  }

  return computeStreakMetrics(userDates);
}

module.exports = {
  buildLeaderboardResponse,
  computeUserStreakSnapshot,
  computeStreakMetrics,
  isCountableAttempt,
  normalizeTopicKey,
  resolveQuizTopic,
  toUtcDateKey
};