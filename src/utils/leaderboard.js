const {
  getAttemptPercent,
  getCurrentWeekRange,
  getMasteryLevel,
  getMasteryRank,
  getRankScore,
  isCompletedAttempt,
  previousDateKey,
  toUtcDateKey
} = require('./gamification');

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
        totalXp: Number(user.totalXp) || 0,
        weeklyXp: Number(user.weeklyXp) || 0,
        accuracyPercent: Number(user.accuracyPercent) || 0,
        weeklyAccuracyPercent: Number(user.weeklyAccuracyPercent) || 0,
        masteryLevel: user.masteryLevel || user.currentTier || 'Beginner',
        rankScore: Number(user.rankScore) || 0,
        weeklyCompletedQuizzes: Number(user.weeklyCompletedQuizzes) || 0,
        currentStreak: Number(user.currentStreak ?? user.streak?.currentStreak) || 0,
        bestStreak: Number(user.bestStreak ?? user.streak?.bestStreak) || 0,
        totalCompleted: 0,
        totalScore: 0,
        totalCorrect: 0,
        totalQuestions: 0,
        weeklyCorrect: 0,
        weeklyQuestions: 0,
        dateKeys: new Set(),
        currentTier: user.masteryLevel || user.currentTier || 'Beginner'
      });
    }
    return summaries.get(userId);
  };

  for (const user of users) {
    ensureSummary(user.id);
  }

  for (const quiz of quizzes) {
    const topic = resolveQuizTopic(quiz);
    if (topic.key) {
      topicIndex.set(topic.key, topic.label);
    }
  }

  for (const attempt of attempts) {
    if (!isCompletedAttempt(attempt)) continue;

    const quiz = quizMap.get(attempt.quizId) || {};
    const topic = resolveQuizTopic(quiz);
    if (topic.key) {
      topicIndex.set(topic.key, topic.label);
    }

    if (normalizedTopicKey && topic.key !== normalizedTopicKey) continue;

    const summary = ensureSummary(attempt.userId);
    summary.totalCompleted += 1;
    summary.totalScore += getAttemptPercent(attempt);
    summary.totalCorrect += Math.max(0, Number(attempt.score) || 0);
    summary.totalQuestions += Math.max(0, Number(attempt.total) || 0);

    const dateKey = toUtcDateKey(attempt.completedAt || attempt.createdAt || attempt.startedAt);
    if (dateKey) summary.dateKeys.add(dateKey);

    const { weekStartDateKey, weekEndDateKey } = getCurrentWeekRange(new Date());
    if (dateKey && dateKey >= weekStartDateKey && dateKey < weekEndDateKey) {
      summary.weeklyCorrect += Math.max(0, Number(attempt.score) || 0);
      summary.weeklyQuestions += Math.max(0, Number(attempt.total) || 0);
    }

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
    const calculatedAccuracy = summary.totalQuestions > 0
      ? Math.round((summary.totalCorrect / summary.totalQuestions) * 100)
      : 0;
    const effectiveAccuracy = Number.isFinite(Number(summary.accuracyPercent)) && Number(summary.accuracyPercent) > 0
      ? Math.max(0, Math.min(100, Number(summary.accuracyPercent)))
      : calculatedAccuracy;
    const weeklyAccuracy = summary.weeklyQuestions > 0
      ? Math.round((summary.weeklyCorrect / summary.weeklyQuestions) * 100)
      : (Number(summary.weeklyAccuracyPercent) || 0);
    const masteryLevel = getMasteryLevel({
      accuracyPercent: effectiveAccuracy,
      completedQuizCount: summary.totalCompleted
    });
    const averageScore = summary.totalCompleted > 0
      ? Math.round(summary.totalScore / summary.totalCompleted)
      : 0;
    const streakMetrics = computeStreakMetrics(Array.from(summary.dateKeys));

    return {
      userId: summary.userId,
      name: summary.name,
      profileImage: summary.profileImage,
      totalXp: summary.totalXp,
      weeklyXp: summary.weeklyXp,
      accuracyPercent: effectiveAccuracy,
      weeklyAccuracyPercent: Math.max(0, Math.min(100, Number(weeklyAccuracy) || 0)),
      masteryLevel,
      rankScore: getRankScore({
        accuracyPercent: effectiveAccuracy,
        masteryLevel,
        currentStreak: summary.currentStreak || streakMetrics.currentStreak,
        completedQuizCount: summary.totalCompleted
      }),
      weeklyCompletedQuizzes: summary.weeklyCompletedQuizzes,
      averageScore,
      totalCompleted: summary.totalCompleted,
      currentStreak: summary.currentStreak || streakMetrics.currentStreak,
      bestStreak: summary.bestStreak || streakMetrics.bestStreak,
      lastActiveDate: streakMetrics.lastActiveDate,
      currentTier: masteryLevel,
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

function sortWeeklyRows(rows) {
  return [...rows].sort((a, b) => {
    if (b.weeklyAccuracyPercent !== a.weeklyAccuracyPercent) return b.weeklyAccuracyPercent - a.weeklyAccuracyPercent;
    if (b.weeklyCompletedQuizzes !== a.weeklyCompletedQuizzes) return b.weeklyCompletedQuizzes - a.weeklyCompletedQuizzes;
    const masteryDiff = getMasteryRank(b.masteryLevel) - getMasteryRank(a.masteryLevel);
    if (masteryDiff !== 0) return masteryDiff;
    if (b.accuracyPercent !== a.accuracyPercent) return b.accuracyPercent - a.accuracyPercent;
    return a.name.localeCompare(b.name);
  });
}

function sortOverallRows(rows) {
  return [...rows].sort((a, b) => {
    const masteryDiff = getMasteryRank(b.masteryLevel) - getMasteryRank(a.masteryLevel);
    if (masteryDiff !== 0) return masteryDiff;
    if (b.accuracyPercent !== a.accuracyPercent) return b.accuracyPercent - a.accuracyPercent;
    if (b.totalCompleted !== a.totalCompleted) return b.totalCompleted - a.totalCompleted;
    if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
    return a.name.localeCompare(b.name);
  });
}

function sortStreakRows(rows) {
  return [...rows].sort((a, b) => {
    if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
    if (b.bestStreak !== a.bestStreak) return b.bestStreak - a.bestStreak;
    const masteryDiff = getMasteryRank(b.masteryLevel) - getMasteryRank(a.masteryLevel);
    if (masteryDiff !== 0) return masteryDiff;
    if (b.accuracyPercent !== a.accuracyPercent) return b.accuracyPercent - a.accuracyPercent;
    if (b.totalCompleted !== a.totalCompleted) return b.totalCompleted - a.totalCompleted;
    return a.name.localeCompare(b.name);
  });
}

function sortTopicRows(rows) {
  return [...rows].sort((a, b) => {
    if (b.accuracyPercent !== a.accuracyPercent) return b.accuracyPercent - a.accuracyPercent;
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
    totalXp: row.totalXp || 0,
    accuracyPercent: row.accuracyPercent || 0,
    weeklyAccuracyPercent: row.weeklyAccuracyPercent || 0,
    masteryLevel: row.masteryLevel || row.currentTier || 'Beginner',
    rankScore: row.rankScore || 0,
    weeklyXp: row.weeklyXp || 0,
    weeklyCompletedQuizzes: row.weeklyCompletedQuizzes || 0,
    currentStreak: row.currentStreak || 0,
    tier: row.masteryLevel || row.currentTier || 'Beginner',
    isCurrentUser: Boolean(isCurrentUser)
  };

  if (includeStreak) {
    payload.currentStreak = row.currentStreak || 0;
  }

  return payload;
}

function buildLeaderboardResponse({ mode, users, attempts, quizzes, limit = 10, viewerUserId = null, topicKey = '' } = {}) {
  const { rows, topics } = buildLeaderboardSummaries({ users, attempts, quizzes, topicKey });
  const rankedRows = mode === 'streak'
    ? sortStreakRows(rows)
    : mode === 'weekly'
      ? sortWeeklyRows(rows)
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
    week: getCurrentWeekRange(),
    topics
  };
}

function computeUserStreakSnapshot({ attempts = [], quizzes = [], userId }) {
  const userDates = [];

  for (const attempt of attempts) {
    if (attempt.userId !== userId || !isCompletedAttempt(attempt)) continue;
    const dateKey = toUtcDateKey(attempt.completedAt || attempt.createdAt || attempt.startedAt);
    if (dateKey) userDates.push(dateKey);
  }

  return computeStreakMetrics(userDates);
}

module.exports = {
  buildLeaderboardResponse,
  computeUserStreakSnapshot,
  computeStreakMetrics,
  normalizeTopicKey,
  resolveQuizTopic,
  toUtcDateKey
};