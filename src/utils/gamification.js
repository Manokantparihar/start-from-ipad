const LEVEL_BASE_XP = 50;
const LEVEL_XP_INCREMENT = 25;

const MASTERY_LEVELS = ['Beginner', 'Improving', 'Strong', 'Mastered'];
const MASTERY_RANK_BY_LEVEL = {
  Beginner: 1,
  Improving: 2,
  Strong: 3,
  Mastered: 4
};

const TIER_THRESHOLDS = [
  { tier: 'Diamond', minXp: 700 },
  { tier: 'Gold', minXp: 300 },
  { tier: 'Silver', minXp: 100 },
  { tier: 'Bronze', minXp: 0 }
];

const MISSION_DEFINITIONS = [
  {
    id: 'complete-two-quizzes',
    title: 'Complete 2 Quizzes',
    description: 'Finish any two quizzes today.',
    rewardXp: 8
  },
  {
    id: 'score-80-plus',
    title: 'Score 80%+ Once',
    description: 'Get at least 80% in one quiz today.',
    rewardXp: 6
  },
  {
    id: 'new-topic',
    title: 'New Topic Attempt',
    description: 'Complete a quiz from a topic you have not completed before.',
    rewardXp: 7
  }
];

const BADGES = [
  {
    id: 'first-quiz',
    title: 'First Quiz',
    description: 'Complete your first quiz.',
    category: 'milestone',
    rarity: 'common'
  },
  {
    id: 'five-quizzes',
    title: '5 Quizzes Completed',
    description: 'Complete five quizzes.',
    category: 'milestone',
    rarity: 'common'
  },
  {
    id: 'perfect-score',
    title: 'Perfect Score',
    description: 'Score 100% in a completed quiz.',
    category: 'performance',
    rarity: 'rare'
  },
  {
    id: 'three-day-streak',
    title: '3 Day Streak',
    description: 'Complete quizzes on three consecutive calendar days.',
    category: 'streak',
    rarity: 'rare'
  },
  {
    id: 'seven-day-streak',
    title: '7 Day Streak',
    description: 'Keep your streak alive for seven days.',
    category: 'streak',
    rarity: 'epic'
  },
  {
    id: '30-day-streak',
    title: '30 Day Streak',
    description: 'Maintain a 30 day streak.',
    category: 'streak',
    rarity: 'legendary'
  }
];

const BADGE_ID_SET = new Set(BADGES.map((badge) => badge.id));

const DEFAULT_WEEKEND_BONUS_MULTIPLIER = 1;
const MIN_COMPETITIVE_WEEKLY_PARTICIPANTS = 3;

function computeAccuracyPercent(totalCorrect = 0, totalQuestions = 0) {
  const correct = Math.max(0, Number(totalCorrect) || 0);
  const questions = Math.max(0, Number(totalQuestions) || 0);
  if (questions <= 0) return 0;
  return Math.min(100, Math.round((correct / questions) * 100));
}

function getMasteryLevel({ accuracyPercent = 0, completedQuizCount = 0 } = {}) {
  const accuracy = Math.max(0, Math.min(100, Number(accuracyPercent) || 0));
  const completed = Math.max(0, Number(completedQuizCount) || 0);

  if (accuracy >= 90 && completed >= 20) return 'Mastered';
  if (accuracy >= 75 && completed >= 8) return 'Strong';
  if (accuracy >= 55 && completed >= 3) return 'Improving';
  return 'Beginner';
}

function getMasteryRank(level) {
  return MASTERY_RANK_BY_LEVEL[level] || 1;
}

function getRankScore({ accuracyPercent = 0, masteryLevel = 'Beginner', currentStreak = 0, completedQuizCount = 0 } = {}) {
  const masteryRank = getMasteryRank(masteryLevel);
  const accuracy = Math.max(0, Math.min(100, Number(accuracyPercent) || 0));
  const streak = Math.max(0, Number(currentStreak) || 0);
  const completed = Math.max(0, Number(completedQuizCount) || 0);
  return (masteryRank * 100000) + (accuracy * 1000) + (streak * 10) + Math.min(completed, 999);
}

function toUtcDateKey(ts) {
  if (!ts) return null;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function previousDateKey(dateKey) {
  if (!dateKey) return null;
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function dateKeyToDate(dateKey) {
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function daysBetweenDateKeys(a, b) {
  const start = dateKeyToDate(a);
  const end = dateKeyToDate(b);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function getCurrentWeekRange(now = new Date()) {
  const cursor = new Date(now);
  cursor.setUTCHours(0, 0, 0, 0);
  const day = cursor.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  cursor.setUTCDate(cursor.getUTCDate() - diffToMonday);
  const weekStartDateKey = cursor.toISOString().slice(0, 10);

  const weekEnd = new Date(cursor);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const weekEndDateKey = weekEnd.toISOString().slice(0, 10);

  return {
    weekStartDateKey,
    weekEndDateKey,
    weekKey: `${weekStartDateKey}/${weekEndDateKey}`
  };
}

function getTierForXp(totalXp) {
  const xp = Math.max(0, Number(totalXp) || 0);
  // Legacy fallback for older callers still passing XP.
  if (xp >= 700) return 'Mastered';
  if (xp >= 300) return 'Strong';
  if (xp >= 100) return 'Improving';
  return 'Beginner';
}

function getAttemptPercent(attempt) {
  const total = Number(attempt?.total);
  const score = Number(attempt?.score);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(score)) return 0;
  return Math.round((score / total) * 100);
}

function isCompletedAttempt(attempt) {
  return Boolean(attempt && attempt.status === 'completed' && attempt.quizId);
}

function normalizeTopicLabel(value) {
  return String(value || '').trim();
}

function normalizeTopicKey(value) {
  const text = normalizeTopicLabel(value);
  return text ? text.toLowerCase() : '';
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

function getAttemptTopic(attempt, quizMap = new Map()) {
  const quiz = quizMap.get(attempt.quizId) || {};
  const topic = resolveQuizTopic(quiz);
  if (topic.key) return topic;

  const fallback = normalizeTopicLabel(attempt?.topic);
  if (fallback) {
    return { key: normalizeTopicKey(fallback), label: fallback };
  }

  return { key: '', label: '' };
}

function getQuizMode(attempt, quizMap = new Map()) {
  const quiz = quizMap.get(attempt.quizId) || {};
  return String(quiz.mode || attempt.mode || 'topic').trim().toLowerCase();
}

function getWeekendBonusMultiplier(config = {}) {
  const candidate = Number(config?.weekendBonusMultiplier);
  if (Number.isFinite(candidate) && candidate >= 1) return candidate;
  return DEFAULT_WEEKEND_BONUS_MULTIPLIER;
}

function isWeekendDateKey(dateKey) {
  if (!dateKey) return false;
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function normalizeEvent(event = {}) {
  const startDateKey = toUtcDateKey(event.startDate);
  const endDateKey = toUtcDateKey(event.endDate);
  const eligibleModes = Array.isArray(event.eligibleModes)
    ? event.eligibleModes.map((mode) => String(mode || '').trim().toLowerCase()).filter(Boolean)
    : [];
  const eligibleTopics = Array.isArray(event.eligibleTopics)
    ? event.eligibleTopics.map((topic) => normalizeTopicKey(topic)).filter(Boolean)
    : [];
  const progressTarget = Math.max(1, Number(event.progressTarget) || 1);

  return {
    id: String(event.id || '').trim(),
    title: String(event.title || '').trim() || 'Untitled Event',
    startDate: startDateKey,
    endDate: endDateKey,
    eligibleModes,
    eligibleTopics,
    bonusXp: Math.max(0, Number(event.bonusXp) || 0),
    progressTarget,
    badgeReward: event.badgeReward && event.badgeReward.id
      ? {
        id: String(event.badgeReward.id),
        title: String(event.badgeReward.title || 'Event Badge'),
        description: String(event.badgeReward.description || 'Event completion reward.'),
        category: String(event.badgeReward.category || 'event'),
        rarity: String(event.badgeReward.rarity || 'epic')
      }
      : null
  };
}

function isEventActiveOnDate(event = {}, dateKey) {
  if (!event.id || !event.startDate || !event.endDate || !dateKey) return false;
  return dateKey >= event.startDate && dateKey <= event.endDate;
}

function doesAttemptMatchEvent({ attempt, quizMap = new Map(), event }) {
  if (!event || !event.id) return false;
  const dateKey = toUtcDateKey(attempt?.completedAt || attempt?.createdAt || attempt?.startedAt);
  if (!isEventActiveOnDate(event, dateKey)) return false;

  const mode = getQuizMode(attempt, quizMap);
  if (event.eligibleModes.length > 0 && !event.eligibleModes.includes(mode)) {
    return false;
  }

  const topic = getAttemptTopic(attempt, quizMap);
  if (event.eligibleTopics.length > 0 && !event.eligibleTopics.includes(topic.key)) {
    return false;
  }

  return true;
}

function normalizeRewardRedemptions(redemptions = []) {
  if (!Array.isArray(redemptions)) return [];
  return redemptions
    .filter((entry) => entry && entry.id && entry.rewardId)
    .map((entry) => ({
      id: String(entry.id),
      rewardId: String(entry.rewardId),
      title: String(entry.title || entry.rewardId),
      costXp: Math.max(0, Number(entry.costXp) || 0),
      redeemedAt: entry.redeemedAt || null,
      effect: entry.effect || null,
      metadata: entry.metadata || {}
    }))
    .sort((a, b) => {
      const aTime = Date.parse(a.redeemedAt || 0) || 0;
      const bTime = Date.parse(b.redeemedAt || 0) || 0;
      if (aTime !== bTime) return aTime - bTime;
      return a.id.localeCompare(b.id);
    });
}

function getBoostTokensFromRedemptions(redemptions = []) {
  const tokens = [];
  for (const redemption of redemptions) {
    const effect = redemption.effect || {};
    if (effect.type !== 'xp-boost-token') continue;
    tokens.push({
      redemptionId: redemption.id,
      rewardId: redemption.rewardId,
      title: redemption.title,
      multiplier: Math.max(1, Number(effect.multiplier) || 1),
      remainingUses: Math.max(0, Number(effect.uses) || 0),
      redeemedAt: redemption.redeemedAt
    });
  }
  return tokens;
}

function getUserGroupIds(user = {}, groups = []) {
  const direct = Array.isArray(user.groupIds) ? user.groupIds.map(String) : [];
  const fromMembership = groups
    .filter((group) => Array.isArray(group.members) && group.members.includes(user.id))
    .map((group) => String(group.id));
  return Array.from(new Set([...direct, ...fromMembership]));
}

function buildGroupRankings({ users = [], groups = [] } = {}) {
  const byGroupId = new Map();

  for (const group of groups) {
    const members = users.filter((user) => Array.isArray(group.members) && group.members.includes(user.id));
    const ranked = members
      .map((user) => ({
        userId: user.id,
        name: user.name || 'Unknown',
        accuracyPercent: Number(user.accuracyPercent) || 0,
        masteryLevel: user.masteryLevel || user.currentTier || 'Beginner',
        currentStreak: Number(user.currentStreak) || 0
      }))
      .sort((a, b) => {
        const masteryDiff = getMasteryRank(b.masteryLevel) - getMasteryRank(a.masteryLevel);
        if (masteryDiff !== 0) return masteryDiff;
        if (b.accuracyPercent !== a.accuracyPercent) return b.accuracyPercent - a.accuracyPercent;
        if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
        return a.name.localeCompare(b.name);
      })
      .map((entry, index) => ({ ...entry, rank: index + 1 }));

    byGroupId.set(group.id, ranked);
  }

  return byGroupId;
}

function getCompletedAttempts(attempts = []) {
  return attempts.filter(isCompletedAttempt).slice().sort((a, b) => {
    const aTime = Number(a.completedAt || a.createdAt || a.startedAt || 0);
    const bTime = Number(b.completedAt || b.createdAt || b.startedAt || 0);
    if (aTime !== bTime) return aTime - bTime;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

function getLevelProgress(totalXp) {
  const xp = Math.max(0, Number(totalXp) || 0);
  let level = 1;
  let xpForCurrentLevel = 0;
  let xpForNextLevel = LEVEL_BASE_XP;

  while (xp >= xpForNextLevel) {
    level += 1;
    xpForCurrentLevel = xpForNextLevel;
    xpForNextLevel += LEVEL_BASE_XP + ((level - 1) * LEVEL_XP_INCREMENT);
  }

  const xpIntoLevel = xp - xpForCurrentLevel;
  const xpNeededForLevel = Math.max(1, xpForNextLevel - xpForCurrentLevel);
  return {
    currentLevel: level,
    xpToNextLevel: Math.max(0, xpForNextLevel - xp),
    currentLevelXp: xpForCurrentLevel,
    nextLevelXp: xpForNextLevel,
    currentLevelProgress: Math.min(100, Math.round((xpIntoLevel / xpNeededForLevel) * 100))
  };
}

function createMissionProgress({ id, completed, rewardXp, value = 0, target = 1, completedAt = null }) {
  return {
    id,
    completed: Boolean(completed),
    rewardXp,
    rewardEarned: Boolean(completed),
    progress: {
      value,
      target
    },
    completedAt: completed ? completedAt : null
  };
}

function evaluateMissionsForDay({ dateKey, attempts = [], seenTopicsBeforeDay = new Set(), quizMap = new Map() }) {
  const attemptsWithMeta = attempts.map((attempt) => {
    const percent = getAttemptPercent(attempt);
    const topic = getAttemptTopic(attempt, quizMap);
    return {
      attempt,
      percent,
      topic,
      completedAt: Number(attempt.completedAt || attempt.createdAt || attempt.startedAt || 0)
    };
  });

  const completedAtIso = attemptsWithMeta.length > 0
    ? new Date(Math.max(...attemptsWithMeta.map((entry) => entry.completedAt || Date.now()))).toISOString()
    : null;

  const dayTopics = new Set(attemptsWithMeta.map((entry) => entry.topic.key).filter(Boolean));
  const hasNewTopic = Array.from(dayTopics).some((topicKey) => !seenTopicsBeforeDay.has(topicKey));
  const hasScore80 = attemptsWithMeta.some((entry) => entry.percent >= 80);

  const missions = [
    createMissionProgress({
      id: 'complete-two-quizzes',
      completed: attemptsWithMeta.length >= 2,
      rewardXp: 8,
      value: attemptsWithMeta.length,
      target: 2,
      completedAt: completedAtIso
    }),
    createMissionProgress({
      id: 'score-80-plus',
      completed: hasScore80,
      rewardXp: 6,
      value: hasScore80 ? 1 : 0,
      target: 1,
      completedAt: completedAtIso
    }),
    createMissionProgress({
      id: 'new-topic',
      completed: hasNewTopic,
      rewardXp: 7,
      value: hasNewTopic ? 1 : 0,
      target: 1,
      completedAt: completedAtIso
    })
  ];

  const rewardXpEarned = missions
    .filter((mission) => mission.completed)
    .reduce((sum, mission) => sum + mission.rewardXp, 0);

  return {
    dateKey,
    missions,
    rewardXpEarned,
    completedMissionIds: missions.filter((mission) => mission.completed).map((mission) => mission.id),
    dayTopics
  };
}

function buildMissionTimeline({ completedAttempts = [], quizMap = new Map(), now = new Date() }) {
  const attemptsByDay = new Map();
  for (const attempt of completedAttempts) {
    const dateKey = toUtcDateKey(attempt.completedAt || attempt.createdAt || attempt.startedAt);
    if (!dateKey) continue;
    if (!attemptsByDay.has(dateKey)) attemptsByDay.set(dateKey, []);
    attemptsByDay.get(dateKey).push(attempt);
  }

  const sortedDateKeys = Array.from(attemptsByDay.keys()).sort();
  const dailyMissionHistory = [];
  const daySummaries = new Map();
  const seenTopics = new Set();

  for (const dateKey of sortedDateKeys) {
    const seenTopicsBeforeDay = new Set(seenTopics);
    const result = evaluateMissionsForDay({
      dateKey,
      attempts: attemptsByDay.get(dateKey) || [],
      seenTopicsBeforeDay,
      quizMap
    });

    daySummaries.set(dateKey, result);
    dailyMissionHistory.push({
      dateKey,
      missions: result.missions,
      completedMissionIds: result.completedMissionIds,
      rewardXpEarned: result.rewardXpEarned
    });

    for (const topic of result.dayTopics) seenTopics.add(topic);
  }

  const todayKey = toUtcDateKey(now);
  if (todayKey && !daySummaries.has(todayKey)) {
    const seenTopicsBeforeToday = new Set();
    for (const dateKey of sortedDateKeys) {
      if (dateKey >= todayKey) continue;
      const result = daySummaries.get(dateKey);
      if (!result) continue;
      for (const topic of result.dayTopics) seenTopicsBeforeToday.add(topic);
    }

    const todayState = evaluateMissionsForDay({
      dateKey: todayKey,
      attempts: [],
      seenTopicsBeforeDay: seenTopicsBeforeToday,
      quizMap
    });

    daySummaries.set(todayKey, todayState);
  }

  return {
    attemptsByDay,
    sortedDateKeys,
    dailyMissionHistory,
    daySummaries,
    todayKey
  };
}

function normalizeBadgeList(badges) {
  if (!Array.isArray(badges)) return [];

  return badges
    .filter((badge) => badge && badge.id && BADGE_ID_SET.has(String(badge.id)))
    .map((badge) => ({
      id: badge.id,
      title: badge.title || badge.id,
      description: badge.description || '',
      category: badge.category || 'general',
      rarity: badge.rarity || 'common',
      unlockedAt: badge.unlockedAt || null
    }));
}

function mergeBadges(existingBadges = [], newBadges = []) {
  const byId = new Map();

  for (const badge of normalizeBadgeList(existingBadges)) {
    byId.set(badge.id, badge);
  }

  for (const badge of normalizeBadgeList(newBadges)) {
    if (!byId.has(badge.id)) {
      byId.set(badge.id, badge);
      continue;
    }

    const existing = byId.get(badge.id);
    if (!existing.unlockedAt && badge.unlockedAt) {
      byId.set(badge.id, { ...existing, unlockedAt: badge.unlockedAt });
    }
  }

  return Array.from(byId.values()).sort((a, b) => {
    const aTime = a.unlockedAt ? Date.parse(a.unlockedAt) : 0;
    const bTime = b.unlockedAt ? Date.parse(b.unlockedAt) : 0;
    return aTime - bTime;
  });
}

function buildGamificationSnapshot({
  attempts = [],
  quizzes = [],
  events = [],
  groups = [],
  config = {},
  user = {},
  now = new Date(),
  weeklyRank = null,
  weeklyGroupRanks = []
} = {}) {
  const completedAttempts = getCompletedAttempts(attempts);
  const quizMap = new Map((quizzes || []).map((quiz) => [quiz.id, quiz]));
  const { weekStartDateKey, weekEndDateKey, weekKey } = getCurrentWeekRange(now);
  const normalizedEvents = (events || []).map(normalizeEvent).filter((event) => event.id);

  const missionTimeline = buildMissionTimeline({ completedAttempts, quizMap, now });
  const daySummaries = missionTimeline.daySummaries;

  const uniqueDayKeys = missionTimeline.sortedDateKeys;
  const seenDayAttempts = new Set();
  const seenTopics = new Set();

  let totalXp = 0;
  let baseXp = 0;
  let boostXp = 0;
  let weekendBonusXp = 0;
  let eventBonusXp = 0;
  let missionBonusXp = 0;
  let completedQuizCount = 0;
  let totalCorrectAnswers = 0;
  let totalQuestionsAnswered = 0;
  let currentStreak = 0;
  let bestStreak = 0;
  let lastActiveDate = null;
  let previousDay = null;

  let freezeAvailableCount = 1;
  let freezeUsedCount = 0;
  let freezeLastConsumedOn = null;

  let weeklyXp = 0;
  let weeklyCompletedQuizzes = 0;
  let weeklyCorrectAnswers = 0;
  let weeklyQuestionsAnswered = 0;

  let firstQuizAt = null;
  let fiveQuizzesAt = null;
  let threeDayStreakAt = null;
  let sevenDayStreakAt = null;
  let perfectScoreAt = null;
  let thirtyDayStreakAt = null;

  const rewardRedemptions = [];

  const weekendMultiplier = getWeekendBonusMultiplier(config);
  const eventProgressById = new Map(normalizedEvents.map((event) => [event.id, {
    eventId: event.id,
    title: event.title,
    progress: 0,
    target: event.progressTarget,
    bonusXpEarned: 0,
    completed: false,
    badgeAwardedAt: null
  }]));

  const consumedBoostHistory = [];

  for (const dateKey of uniqueDayKeys) {
    const dayAttempts = missionTimeline.attemptsByDay.get(dateKey) || [];
    const isInCurrentWeek = dateKey >= weekStartDateKey && dateKey < weekEndDateKey;

    if (!previousDay) {
      currentStreak = dayAttempts.length > 0 ? 1 : 0;
    } else {
      const diff = daysBetweenDateKeys(previousDay, dateKey);
      if (diff === 1) {
        currentStreak += 1;
      } else if (diff === 2 && freezeAvailableCount > 0) {
        freezeAvailableCount = 0;
        freezeUsedCount = 1;
        freezeLastConsumedOn = previousDateKey(dateKey);
        currentStreak += 1;
      } else {
        currentStreak = 1;
      }
    }

    if (currentStreak > bestStreak) {
      bestStreak = currentStreak;
      if (currentStreak >= 3 && !threeDayStreakAt) {
        threeDayStreakAt = new Date(dayAttempts[dayAttempts.length - 1]?.completedAt || Date.now()).toISOString();
      }
      if (currentStreak >= 7 && !sevenDayStreakAt) {
        sevenDayStreakAt = new Date(dayAttempts[dayAttempts.length - 1]?.completedAt || Date.now()).toISOString();
      }
      if (currentStreak >= 30 && !thirtyDayStreakAt) {
        thirtyDayStreakAt = new Date(dayAttempts[dayAttempts.length - 1]?.completedAt || Date.now()).toISOString();
      }
    }

    previousDay = dateKey;
    lastActiveDate = dateKey;

    for (const attempt of dayAttempts) {
      completedQuizCount += 1;
      const completedAt = Number(attempt.completedAt || attempt.createdAt || attempt.startedAt || Date.now());
      const completedAtIso = new Date(completedAt).toISOString();
      const percent = getAttemptPercent(attempt);
      const topic = getAttemptTopic(attempt, quizMap);

      if (!firstQuizAt) firstQuizAt = completedAtIso;
      if (!fiveQuizzesAt && completedQuizCount >= 5) fiveQuizzesAt = completedAtIso;
      if (!perfectScoreAt && percent === 100) perfectScoreAt = completedAtIso;

      totalCorrectAnswers += Math.max(0, Number(attempt.score) || 0);
      totalQuestionsAnswered += Math.max(0, Number(attempt.total) || 0);

      if (topic.key && !seenTopics.has(topic.key)) {
        seenTopics.add(topic.key);
      }

      let rawAttemptXp = 10;
      if (percent >= 80) rawAttemptXp += 5;
      if (percent === 100) rawAttemptXp += 10;
      if (!seenDayAttempts.has(dateKey)) {
        rawAttemptXp += 3;
        seenDayAttempts.add(dateKey);
      }

      baseXp += rawAttemptXp;

      const weekendMultiplierApplied = isWeekendDateKey(dateKey) ? weekendMultiplier : 1;
      const combinedMultiplier = weekendMultiplierApplied;

      const boostedAttemptXp = Math.round(rawAttemptXp * combinedMultiplier);
      const weekendDelta = Math.max(0, boostedAttemptXp - rawAttemptXp);

      weekendBonusXp += weekendDelta;
      totalXp += boostedAttemptXp;

      for (const event of normalizedEvents) {
        if (!doesAttemptMatchEvent({ attempt, quizMap, event })) continue;
        totalXp += event.bonusXp;
        eventBonusXp += event.bonusXp;
        const progress = eventProgressById.get(event.id);
        if (progress) {
          progress.progress += 1;
          progress.bonusXpEarned += event.bonusXp;
          if (!progress.completed && progress.progress >= progress.target) {
            progress.completed = true;
            progress.badgeAwardedAt = completedAtIso;
          }
        }
      }

      if (isInCurrentWeek) {
        weeklyXp += boostedAttemptXp;
        weeklyCompletedQuizzes += 1;
        weeklyCorrectAnswers += Math.max(0, Number(attempt.score) || 0);
        weeklyQuestionsAnswered += Math.max(0, Number(attempt.total) || 0);
      }
    }

    const missionState = daySummaries.get(dateKey);
    if (missionState) {
      missionBonusXp += missionState.rewardXpEarned;
      totalXp += missionState.rewardXpEarned;
      if (isInCurrentWeek) {
        weeklyXp += missionState.rewardXpEarned;
      }

    }
  }

  // Build event snapshots used by dashboard and progress APIs.
  const activeEvents = normalizedEvents
    .filter((event) => isEventActiveOnDate(event, toUtcDateKey(now)))
    .map((event) => {
      const progress = eventProgressById.get(event.id);
      return {
        id: event.id,
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        bonusXp: event.bonusXp,
        progress: progress ? progress.progress : 0,
        target: event.progressTarget,
        completed: Boolean(progress?.completed)
      };
    });

  const levelProgress = getLevelProgress(totalXp);
  const accuracyPercent = computeAccuracyPercent(totalCorrectAnswers, totalQuestionsAnswered);
  const weeklyAccuracyPercent = computeAccuracyPercent(weeklyCorrectAnswers, weeklyQuestionsAnswered);
  const masteryLevel = getMasteryLevel({ accuracyPercent, completedQuizCount });
  const rankScore = getRankScore({ accuracyPercent, masteryLevel, currentStreak, completedQuizCount });
  const badges = [];

  function pushBadge(id, unlockedAt, overrideMeta = null) {
    if (!unlockedAt) return;
    const meta = overrideMeta || BADGES.find((badge) => badge.id === id);
    if (!meta) return;
    badges.push({
      id: meta.id,
      title: meta.title,
      description: meta.description,
      category: meta.category || 'general',
      rarity: meta.rarity || 'common',
      unlockedAt
    });
  }

  pushBadge('first-quiz', firstQuizAt);
  pushBadge('five-quizzes', fiveQuizzesAt);
  pushBadge('perfect-score', perfectScoreAt);
  pushBadge('three-day-streak', threeDayStreakAt);
  pushBadge('seven-day-streak', sevenDayStreakAt);
  pushBadge('30-day-streak', thirtyDayStreakAt);

  const todayState = daySummaries.get(missionTimeline.todayKey) || evaluateMissionsForDay({
    dateKey: missionTimeline.todayKey,
    attempts: [],
    seenTopicsBeforeDay: new Set(),
    quizMap
  });

  const activeBoost = null;
  const totalSpentXp = 0;
  const xpBalance = totalXp;

  return {
    totalXp,
    xpBalance,
    totalSpentXp,
    baseXp,
    boostXp,
    weekendBonusXp,
    eventBonusXp,
    missionBonusXp,
    currentLevel: levelProgress.currentLevel,
    xpToNextLevel: levelProgress.xpToNextLevel,
    currentLevelXp: levelProgress.currentLevelXp,
    nextLevelXp: levelProgress.nextLevelXp,
    currentLevelProgress: levelProgress.currentLevelProgress,
    completedQuizCount,
    totalCorrectAnswers,
    totalQuestionsAnswered,
    accuracyPercent,
    masteryLevel,
    rankScore,
    currentStreak,
    bestStreak,
    lastActiveDate,
    streakFreeze: {
      maxCount: 1,
      availableCount: freezeAvailableCount,
      usedCount: freezeUsedCount,
      lastConsumedOn: freezeLastConsumedOn
    },
    activeBoost,
    consumedBoostHistory,
    activeEvents,
    eventProgress: Array.from(eventProgressById.values()),
    weeklyXp,
    weeklyAccuracyPercent,
    weeklyCompletedQuizzes,
    weeklyRank: Number.isFinite(Number(weeklyRank)) ? Number(weeklyRank) : null,
    weekKey,
    currentTier: masteryLevel,
    badges,
    rewardRedemptions,
    groupIds: getUserGroupIds(user, groups),
    weeklyGroupRanks: Array.isArray(weeklyGroupRanks) ? weeklyGroupRanks : [],
    dailyMissionHistory: missionTimeline.dailyMissionHistory,
    todayMissions: {
      dateKey: missionTimeline.todayKey,
      missions: todayState.missions,
      completedMissionIds: todayState.completedMissionIds,
      rewardXpEarned: todayState.rewardXpEarned
    }
  };
}

function normalizeMissionHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((entry) => entry && entry.dateKey)
    .map((entry) => ({
      dateKey: entry.dateKey,
      missions: Array.isArray(entry.missions) ? entry.missions : [],
      completedMissionIds: Array.isArray(entry.completedMissionIds) ? entry.completedMissionIds : [],
      rewardXpEarned: Number(entry.rewardXpEarned) || 0
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function normalizeGamificationFields(user = {}) {
  const totalXp = Math.max(0, Number(user.totalXp) || 0);
  const xpBalance = Math.max(0, Number(user.xpBalance) || totalXp);
  const currentLevel = Math.max(1, Number(user.currentLevel) || 1);
  const xpToNextLevel = Number(user.xpToNextLevel);
  const currentStreak = Math.max(0, Number(user.currentStreak ?? user.streak?.currentStreak) || 0);
  const bestStreak = Math.max(0, Number(user.bestStreak ?? user.streak?.bestStreak) || 0);
  const completedQuizCount = Math.max(0, Number(user.completedQuizCount) || 0);
  const totalCorrectAnswers = Math.max(0, Number(user.totalCorrectAnswers) || 0);
  const totalQuestionsAnswered = Math.max(0, Number(user.totalQuestionsAnswered) || 0);
  const fallbackAccuracy = Number(user.averageScore) || 0;
  const accuracyPercent = Number.isFinite(Number(user.accuracyPercent))
    ? Math.max(0, Math.min(100, Number(user.accuracyPercent)))
    : (totalQuestionsAnswered > 0 ? computeAccuracyPercent(totalCorrectAnswers, totalQuestionsAnswered) : Math.max(0, Math.min(100, fallbackAccuracy)));
  const masteryLevel = MASTERY_LEVELS.includes(String(user.masteryLevel))
    ? String(user.masteryLevel)
    : (MASTERY_LEVELS.includes(String(user.currentTier)) ? String(user.currentTier) : getMasteryLevel({ accuracyPercent, completedQuizCount }));
  const rankScore = Math.max(0, Number(user.rankScore) || getRankScore({ accuracyPercent, masteryLevel, currentStreak, completedQuizCount }));
  const weeklyXp = Math.max(0, Number(user.weeklyXp) || 0);
  const weeklyAccuracyPercent = Number.isFinite(Number(user.weeklyAccuracyPercent))
    ? Math.max(0, Math.min(100, Number(user.weeklyAccuracyPercent)))
    : 0;
  const weeklyCompletedQuizzes = Math.max(0, Number(user.weeklyCompletedQuizzes) || 0);
  const rewardRedemptions = normalizeRewardRedemptions(user.rewardRedemptions);
  const activeEvents = Array.isArray(user.activeEvents) ? user.activeEvents : [];
  const eventProgress = Array.isArray(user.eventProgress) ? user.eventProgress : [];
  const consumedBoostHistory = Array.isArray(user.consumedBoostHistory) ? user.consumedBoostHistory : [];
  const weeklyGroupRanks = Array.isArray(user.weeklyGroupRanks) ? user.weeklyGroupRanks : [];
  const groupIds = Array.isArray(user.groupIds) ? user.groupIds : [];
  const activeBoost = user.activeBoost && Number(user.activeBoost.remainingUses) > 0
    ? {
      rewardId: user.activeBoost.rewardId || null,
      title: user.activeBoost.title || 'XP Boost',
      multiplier: Math.max(1, Number(user.activeBoost.multiplier) || 1),
      remainingUses: Math.max(0, Number(user.activeBoost.remainingUses) || 0),
      startedAt: user.activeBoost.startedAt || null,
      expiresAt: user.activeBoost.expiresAt || null,
      source: user.activeBoost.source || 'reward-shop'
    }
    : null;

  const levelProgress = getLevelProgress(totalXp);
  const freeze = user.streakFreeze || {};
  const inferredAvailable = freeze.availableCount === undefined
    ? (Number(freeze.usedCount) >= 1 ? 0 : 1)
    : Number(freeze.availableCount);
  const missionHistory = normalizeMissionHistory(user.dailyMissionHistory);
  const todayKey = toUtcDateKey(new Date());
  const todayMissions = user.todayMissions && user.todayMissions.dateKey === todayKey
    ? user.todayMissions
    : {
      dateKey: todayKey,
      missions: MISSION_DEFINITIONS.map((mission) => ({
        id: mission.id,
        completed: false,
        rewardXp: mission.rewardXp,
        rewardEarned: false,
        progress: {
          value: 0,
          target: mission.id === 'complete-two-quizzes' ? 2 : 1
        },
        completedAt: null
      })),
      completedMissionIds: [],
      rewardXpEarned: 0
    };

  return {
    totalXp,
    xpBalance,
    currentLevel,
    xpToNextLevel: Number.isFinite(xpToNextLevel) ? xpToNextLevel : levelProgress.xpToNextLevel,
    currentLevelXp: Number(user.currentLevelXp) || levelProgress.currentLevelXp,
    nextLevelXp: Number(user.nextLevelXp) || levelProgress.nextLevelXp,
    currentLevelProgress: Number(user.currentLevelProgress) || levelProgress.currentLevelProgress,
    completedQuizCount,
    totalCorrectAnswers,
    totalQuestionsAnswered,
    accuracyPercent,
    masteryLevel,
    rankScore,
    currentStreak,
    bestStreak,
    lastActiveDate: user.lastActiveDate || user.streak?.lastActiveDate || null,
    streakFreeze: {
      maxCount: 1,
      availableCount: Math.max(0, Math.min(1, Number.isFinite(inferredAvailable) ? inferredAvailable : 1)),
      usedCount: Math.max(0, Math.min(1, Number(freeze.usedCount) || 0)),
      lastConsumedOn: freeze.lastConsumedOn || null
    },
    weeklyXp,
    weeklyAccuracyPercent,
    weeklyCompletedQuizzes,
    weeklyRank: Number(user.weeklyRank) > 0 ? Number(user.weeklyRank) : null,
    weekKey: typeof user.weekKey === 'string' ? user.weekKey : getCurrentWeekRange(new Date()).weekKey,
    currentTier: masteryLevel,
    badges: normalizeBadgeList(user.badges),
    activeBoost,
    activeEvents,
    eventProgress,
    rewardRedemptions,
    consumedBoostHistory,
    weeklyGroupRanks,
    groupIds,
    dailyMissionHistory: missionHistory,
    todayMissions
  };
}

function mergeGamificationIntoUser(user, snapshot) {
  const badges = normalizeBadgeList(snapshot.badges || []);
  const latestBadge = badges.length > 0 ? badges[badges.length - 1] : null;

  return {
    ...user,
    totalXp: Number(snapshot.totalXp) || 0,
    xpBalance: Math.max(0, Number(snapshot.xpBalance) || 0),
    totalSpentXp: Math.max(0, Number(snapshot.totalSpentXp) || 0),
    baseXp: Number(snapshot.baseXp) || 0,
    boostXp: Number(snapshot.boostXp) || 0,
    weekendBonusXp: Number(snapshot.weekendBonusXp) || 0,
    eventBonusXp: Number(snapshot.eventBonusXp) || 0,
    missionBonusXp: Number(snapshot.missionBonusXp) || 0,
    currentLevel: Number(snapshot.currentLevel) || 1,
    xpToNextLevel: Number(snapshot.xpToNextLevel) || 0,
    currentLevelXp: Number(snapshot.currentLevelXp) || 0,
    nextLevelXp: Number(snapshot.nextLevelXp) || 0,
    currentLevelProgress: Number(snapshot.currentLevelProgress) || 0,
    completedQuizCount: Number(snapshot.completedQuizCount) || 0,
    totalCorrectAnswers: Number(snapshot.totalCorrectAnswers) || 0,
    totalQuestionsAnswered: Number(snapshot.totalQuestionsAnswered) || 0,
    accuracyPercent: Math.max(0, Math.min(100, Number(snapshot.accuracyPercent) || 0)),
    masteryLevel: snapshot.masteryLevel || getMasteryLevel({
      accuracyPercent: Number(snapshot.accuracyPercent) || 0,
      completedQuizCount: Number(snapshot.completedQuizCount) || 0
    }),
    rankScore: Math.max(0, Number(snapshot.rankScore) || 0),
    currentStreak: Number(snapshot.currentStreak) || 0,
    bestStreak: Number(snapshot.bestStreak) || 0,
    lastActiveDate: snapshot.lastActiveDate || null,
    streakFreeze: {
      maxCount: 1,
      availableCount: Math.max(0, Math.min(1, Number(snapshot.streakFreeze?.availableCount) || 0)),
      usedCount: Math.max(0, Math.min(1, Number(snapshot.streakFreeze?.usedCount) || 0)),
      lastConsumedOn: snapshot.streakFreeze?.lastConsumedOn || null
    },
    weeklyXp: Number(snapshot.weeklyXp) || 0,
    weeklyAccuracyPercent: Math.max(0, Math.min(100, Number(snapshot.weeklyAccuracyPercent) || 0)),
    weeklyCompletedQuizzes: Number(snapshot.weeklyCompletedQuizzes) || 0,
    weeklyRank: Number(snapshot.weeklyRank) > 0 ? Number(snapshot.weeklyRank) : null,
    weekKey: snapshot.weekKey || getCurrentWeekRange(new Date()).weekKey,
    currentTier: snapshot.masteryLevel || snapshot.currentTier || 'Beginner',
    activeBoost: snapshot.activeBoost || null,
    activeEvents: Array.isArray(snapshot.activeEvents) ? snapshot.activeEvents : [],
    eventProgress: Array.isArray(snapshot.eventProgress) ? snapshot.eventProgress : [],
    rewardRedemptions: normalizeRewardRedemptions(snapshot.rewardRedemptions),
    consumedBoostHistory: Array.isArray(snapshot.consumedBoostHistory) ? snapshot.consumedBoostHistory : [],
    groupIds: Array.isArray(snapshot.groupIds) ? snapshot.groupIds : [],
    weeklyGroupRanks: Array.isArray(snapshot.weeklyGroupRanks) ? snapshot.weeklyGroupRanks : [],
    badges,
    latestBadge,
    dailyMissionHistory: normalizeMissionHistory(snapshot.dailyMissionHistory),
    todayMissions: snapshot.todayMissions,
    streak: {
      currentStreak: Number(snapshot.currentStreak) || 0,
      bestStreak: Number(snapshot.bestStreak) || 0,
      lastActiveDate: snapshot.lastActiveDate || null,
      updatedAt: new Date().toISOString()
    },
    gamificationUpdatedAt: new Date().toISOString()
  };
}

function getLatestBadge(user) {
  const badges = normalizeBadgeList(user?.badges);
  return badges.length > 0 ? badges[badges.length - 1] : null;
}

function buildPublicGamification(user = {}) {
  const normalized = normalizeGamificationFields(user);
  return {
    totalXp: normalized.totalXp,
    xpBalance: normalized.xpBalance,
    currentLevel: normalized.currentLevel,
    xpToNextLevel: normalized.xpToNextLevel,
    currentLevelProgress: normalized.currentLevelProgress,
    completedQuizCount: normalized.completedQuizCount,
    totalCorrectAnswers: normalized.totalCorrectAnswers,
    totalQuestionsAnswered: normalized.totalQuestionsAnswered,
    accuracyPercent: normalized.accuracyPercent,
    masteryLevel: normalized.masteryLevel,
    rankScore: normalized.rankScore,
    currentStreak: normalized.currentStreak,
    bestStreak: normalized.bestStreak,
    lastActiveDate: normalized.lastActiveDate,
    streakFreeze: normalized.streakFreeze,
    weeklyXp: normalized.weeklyXp,
    weeklyAccuracyPercent: normalized.weeklyAccuracyPercent,
    weeklyCompletedQuizzes: normalized.weeklyCompletedQuizzes,
    weeklyRank: normalized.weeklyRank,
    currentTier: normalized.currentTier,
    weekKey: normalized.weekKey,
    activeBoost: normalized.activeBoost,
    activeEvents: normalized.activeEvents,
    eventProgress: normalized.eventProgress,
    weeklyGroupRanks: normalized.weeklyGroupRanks,
    groupIds: normalized.groupIds,
    rewardRedemptions: normalized.rewardRedemptions,
    latestBadge: getLatestBadge(user),
    badges: normalized.badges,
    todayMissions: normalized.todayMissions
  };
}

function summarizeUserForLeaderboard(user = {}, currentUserId = null) {
  const normalized = normalizeGamificationFields(user);
  return {
    userId: user.id,
    name: user.name || 'Unknown',
    profileImage: user.profileImage || null,
    totalXp: normalized.totalXp,
    weeklyXp: normalized.weeklyXp,
    accuracyPercent: normalized.accuracyPercent,
    masteryLevel: normalized.masteryLevel,
    rankScore: normalized.rankScore,
    weeklyCompletedQuizzes: normalized.weeklyCompletedQuizzes,
    currentStreak: normalized.currentStreak,
    bestStreak: normalized.bestStreak,
    completedQuizCount: normalized.completedQuizCount,
    currentTier: normalized.currentTier,
    weeklyRank: normalized.weeklyRank,
    isCurrentUser: Boolean(currentUserId && user.id === currentUserId)
  };
}

async function syncUsersToGamification({
  users = [],
  attempts = [],
  quizzes = [],
  events = [],
  groups = [],
  config = {},
  now = new Date()
} = {}) {
  const attemptsByUser = new Map();
  for (const attempt of attempts) {
    if (!isCompletedAttempt(attempt)) continue;
    if (!attemptsByUser.has(attempt.userId)) attemptsByUser.set(attempt.userId, []);
    attemptsByUser.get(attempt.userId).push(attempt);
  }

  const preliminary = users.map((user) => ({
    user,
    snapshot: buildGamificationSnapshot({
      attempts: attemptsByUser.get(user.id) || [],
      quizzes,
      events,
      groups,
      config,
      user,
      now,
      weeklyRank: null,
      weeklyGroupRanks: []
    })
  }));

  const rankedWeekly = preliminary
    .map((entry) => ({
      id: entry.user.id,
      name: entry.user.name || 'Unknown',
      weeklyAccuracyPercent: Number(entry.snapshot.weeklyAccuracyPercent) || 0,
      weeklyCompletedQuizzes: Number(entry.snapshot.weeklyCompletedQuizzes) || 0
    }))
    .sort((a, b) => {
      if (b.weeklyAccuracyPercent !== a.weeklyAccuracyPercent) return b.weeklyAccuracyPercent - a.weeklyAccuracyPercent;
      if (b.weeklyCompletedQuizzes !== a.weeklyCompletedQuizzes) return b.weeklyCompletedQuizzes - a.weeklyCompletedQuizzes;
      return a.name.localeCompare(b.name);
    });

  const rankedWeeklyEligible = rankedWeekly.filter((entry) => Number(entry.weeklyCompletedQuizzes) > 0);
  const weeklyRankByUserId = rankedWeeklyEligible.length >= MIN_COMPETITIVE_WEEKLY_PARTICIPANTS
    ? new Map(rankedWeeklyEligible.map((entry, index) => [entry.id, index + 1]))
    : new Map();

  const normalizedGroups = Array.isArray(groups) ? groups.filter((group) => group && group.id) : [];
  const userSnapshotsById = new Map(preliminary.map((entry) => [entry.user.id, entry.snapshot]));
  const weeklyGroupRanksByUserId = new Map();

  for (const group of normalizedGroups) {
    const memberIds = Array.isArray(group.members) ? group.members : [];
    const rankedGroup = memberIds
      .map((memberId) => {
        const snapshot = userSnapshotsById.get(memberId);
        const user = users.find((entry) => entry.id === memberId);
        if (!snapshot || !user) return null;
        return {
          userId: memberId,
          name: user.name || 'Unknown',
          weeklyAccuracyPercent: Number(snapshot.weeklyAccuracyPercent) || 0,
          weeklyCompletedQuizzes: Number(snapshot.weeklyCompletedQuizzes) || 0,
          accuracyPercent: Number(snapshot.accuracyPercent) || 0,
          masteryLevel: snapshot.masteryLevel || 'Beginner'
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b.weeklyAccuracyPercent !== a.weeklyAccuracyPercent) return b.weeklyAccuracyPercent - a.weeklyAccuracyPercent;
        if (b.weeklyCompletedQuizzes !== a.weeklyCompletedQuizzes) return b.weeklyCompletedQuizzes - a.weeklyCompletedQuizzes;
        const masteryDiff = getMasteryRank(b.masteryLevel) - getMasteryRank(a.masteryLevel);
        if (masteryDiff !== 0) return masteryDiff;
        if (b.accuracyPercent !== a.accuracyPercent) return b.accuracyPercent - a.accuracyPercent;
        return a.name.localeCompare(b.name);
      });

    rankedGroup.forEach((entry, index) => {
      const existing = weeklyGroupRanksByUserId.get(entry.userId) || [];
      existing.push({
        groupId: group.id,
        groupName: group.name || group.id,
        rank: index + 1,
        totalMembers: rankedGroup.length
      });
      weeklyGroupRanksByUserId.set(entry.userId, existing);
    });
  }

  return preliminary.map((entry) => {
    const weeklyRank = weeklyRankByUserId.get(entry.user.id) || null;
    const weeklyGroupRanks = weeklyGroupRanksByUserId.get(entry.user.id) || [];
    const snapshotWithWeeklyRank = {
      ...entry.snapshot,
      weeklyRank,
      weeklyGroupRanks,
      groupIds: getUserGroupIds(entry.user, normalizedGroups),
      currentTier: entry.snapshot.masteryLevel || 'Beginner',
      masteryLevel: entry.snapshot.masteryLevel || 'Beginner'
    };

    return mergeGamificationIntoUser(entry.user, snapshotWithWeeklyRank);
  });
}

function getUserMissionStateForDate({ attempts = [], quizzes = [], dateKey, now = new Date() } = {}) {
  const completedAttempts = getCompletedAttempts(attempts);
  const quizMap = new Map((quizzes || []).map((quiz) => [quiz.id, quiz]));
  const missionTimeline = buildMissionTimeline({ completedAttempts, quizMap, now });
  return missionTimeline.daySummaries.get(dateKey) || evaluateMissionsForDay({
    dateKey,
    attempts: [],
    seenTopicsBeforeDay: new Set(),
    quizMap
  });
}

module.exports = {
  BADGES,
  LEVEL_BASE_XP,
  LEVEL_XP_INCREMENT,
  MISSION_DEFINITIONS,
  MASTERY_LEVELS,
  TIER_THRESHOLDS,
  buildGamificationSnapshot,
  buildPublicGamification,
  getAttemptPercent,
  getCompletedAttempts,
  getCurrentWeekRange,
  getLatestBadge,
  getMasteryLevel,
  getMasteryRank,
  getRankScore,
  getLevelProgress,
  getUserGroupIds,
  getTierForXp,
  getUserMissionStateForDate,
  isEventActiveOnDate,
  isCompletedAttempt,
  mergeGamificationIntoUser,
  normalizeBadgeList,
  normalizeEvent,
  normalizeGamificationFields,
  normalizeRewardRedemptions,
  normalizeTopicKey,
  previousDateKey,
  resolveQuizTopic,
  summarizeUserForLeaderboard,
  syncUsersToGamification,
  toUtcDateKey
};