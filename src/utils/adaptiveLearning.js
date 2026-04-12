const DAY_MS = 24 * 60 * 60 * 1000;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toTimeMs(value) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTopic(value) {
  return String(value || 'General').trim() || 'General';
}

function daysSince(timestamp, now = Date.now()) {
  const time = toTimeMs(timestamp);
  if (!time) return null;
  return Math.max(0, Math.floor((now - time) / DAY_MS));
}

function getQuestionTopic(question, quiz) {
  return normalizeTopic(question?.topic || quiz?.topic || 'General');
}

function getAttemptCompletionTime(attempt) {
  return toTimeMs(attempt?.completedAt || attempt?.updatedAt || attempt?.createdAt || attempt?.startedAt);
}

function buildQuestionMap(quizzes = []) {
  const map = new Map();
  quizzes.forEach((quiz) => {
    (quiz.questions || []).forEach((question) => {
      map.set(question.id, {
        ...question,
        quizId: quiz.id,
        quizTitle: quiz.title,
        quizMode: quiz.mode,
        quizTopic: quiz.topic || ''
      });
    });
  });
  return map;
}

function ensureTopicStats(topicStats, topic) {
  const key = normalizeTopic(topic);
  if (!topicStats.has(key)) {
    topicStats.set(key, {
      topic: key,
      correct: 0,
      wrong: 0,
      skipped: 0,
      attempted: 0,
      questionSeen: 0,
      practiceSessions: 0,
      revisionWrongCount: 0,
      recentWrong7d: 0,
      recentWrong30d: 0,
      lastPracticedAt: 0,
      lastWrongAt: 0,
      bookmarks: 0,
      sessionIds: new Set(),
      recentWrongSources: new Set()
    });
  }
  return topicStats.get(key);
}

function buildTopicStats({
  userId,
  attempts = [],
  quizzes = [],
  wrongQuestions = [],
  bookmarks = [],
  now = Date.now()
} = {}) {
  const quizMap = new Map(quizzes.map((quiz) => [quiz.id, quiz]));
  const topicStats = new Map();

  const userAttempts = attempts.filter((attempt) =>
    String(attempt.userId) === String(userId) && ['completed', 'expired'].includes(attempt.status)
  );

  for (const attempt of userAttempts) {
    const quiz = quizMap.get(attempt.quizId);
    if (!quiz || !Array.isArray(quiz.questions)) continue;

    const completedAt = getAttemptCompletionTime(attempt);
    const answers = Array.isArray(attempt.answers) ? attempt.answers : [];
    const answerMap = new Map(answers.map((answer) => [String(answer.questionId), answer.selected]));
    const topicsSeenInAttempt = new Set();

    for (const question of quiz.questions) {
      const topic = getQuestionTopic(question, quiz);
      topicsSeenInAttempt.add(topic);
      const stat = ensureTopicStats(topicStats, topic);
      stat.questionSeen += 1;

      const selected = answerMap.has(question.id) ? answerMap.get(question.id) : null;
      const isAttempted = selected !== null && selected !== undefined && selected !== '';
      const isCorrect = isAttempted && selected === question.correctAnswer;

      if (isAttempted) {
        stat.attempted += 1;
      } else {
        stat.skipped += 1;
      }

      if (isCorrect) {
        stat.correct += 1;
      } else if (isAttempted) {
        stat.wrong += 1;
      }

      if (completedAt > stat.lastPracticedAt) {
        stat.lastPracticedAt = completedAt;
      }
      if (!isCorrect && completedAt > stat.lastWrongAt) {
        stat.lastWrongAt = completedAt;
      }
      if (!isCorrect && completedAt && completedAt >= now - (7 * DAY_MS)) {
        stat.recentWrong7d += 1;
      }
      if (!isCorrect && completedAt && completedAt >= now - (30 * DAY_MS)) {
        stat.recentWrong30d += 1;
      }
    }

    topicsSeenInAttempt.forEach((topic) => {
      const stat = ensureTopicStats(topicStats, topic);
      if (!stat.sessionIds.has(attempt.id)) {
        stat.sessionIds.add(attempt.id);
        stat.practiceSessions += 1;
      }
    });
  }

  for (const wrongQuestion of wrongQuestions) {
    const topic = normalizeTopic(wrongQuestion.topic);
    const stat = ensureTopicStats(topicStats, topic);
    stat.revisionWrongCount += 1;
    const timestamp = toTimeMs(wrongQuestion.timestamp || wrongQuestion.lastSeenAt || wrongQuestion.savedAt);
    if (timestamp > stat.lastWrongAt) {
      stat.lastWrongAt = timestamp;
    }
    if (timestamp && timestamp >= now - (7 * DAY_MS)) {
      stat.recentWrong7d += 1;
      stat.recentWrongSources.add(wrongQuestion.questionId || wrongQuestion.id || `${topic}-${timestamp}`);
    }
    if (timestamp && timestamp >= now - (30 * DAY_MS)) {
      stat.recentWrong30d += 1;
    }
  }

  for (const bookmark of bookmarks) {
    const topic = normalizeTopic(bookmark.topic);
    const stat = ensureTopicStats(topicStats, topic);
    stat.bookmarks += 1;
  }

  const topicRows = Array.from(topicStats.values()).map((stat) => {
    const attempted = stat.correct + stat.wrong;
    const accuracy = attempted > 0 ? Math.round((stat.correct / attempted) * 100) : 0;
    const daysSinceLastPractice = stat.lastPracticedAt ? daysSince(stat.lastPracticedAt, now) : null;
    const daysSinceLastWrong = stat.lastWrongAt ? daysSince(stat.lastWrongAt, now) : null;
    const lowAttemptPenalty = Math.max(0, 6 - stat.practiceSessions) * 7;
    const accuracyPenalty = attempted === 0 ? 34 : Math.max(0, 100 - accuracy) * 0.45;
    const recencyPenalty = daysSinceLastPractice === null ? 12 : Math.min(18, daysSinceLastPractice * 1.8);
    const recentWrongPenalty = Math.min(24, (stat.recentWrong7d * 6) + (stat.recentWrong30d * 1.25));
    const skippedPenalty = Math.min(12, stat.skipped * 1.5);
    const bookmarkBoost = Math.min(4, stat.bookmarks);
    const priorityScore = Math.round(accuracyPenalty + recencyPenalty + recentWrongPenalty + lowAttemptPenalty + skippedPenalty - bookmarkBoost);

    const reasonParts = [];
    if (attempted === 0) {
      reasonParts.push('no attempted questions yet');
    } else {
      reasonParts.push(`${accuracy}% accuracy`);
    }
    if (stat.recentWrong7d > 0) {
      reasonParts.push(`${stat.recentWrong7d} recent wrong`);
    }
    if (stat.practiceSessions > 0) {
      reasonParts.push(`${stat.practiceSessions} practice session${stat.practiceSessions === 1 ? '' : 's'}`);
    }
    if (daysSinceLastPractice !== null) {
      reasonParts.push(`${daysSinceLastPractice} day${daysSinceLastPractice === 1 ? '' : 's'} since practice`);
    }

    return {
      ...stat,
      accuracy,
      attempted,
      daysSinceLastPractice,
      daysSinceLastWrong,
      priorityScore,
      reasonParts
    };
  }).sort((left, right) => {
    if (right.priorityScore !== left.priorityScore) return right.priorityScore - left.priorityScore;
    if (left.accuracy !== right.accuracy) return left.accuracy - right.accuracy;
    return left.topic.localeCompare(right.topic);
  });

  const overallAttempted = topicRows.reduce((sum, stat) => sum + stat.attempted, 0);
  const overallCorrect = topicRows.reduce((sum, stat) => sum + stat.correct, 0);
  const overallAccuracy = overallAttempted > 0 ? Math.round((overallCorrect / overallAttempted) * 100) : 0;

  return {
    topicRows,
    overallAttempted,
    overallCorrect,
    overallAccuracy,
    topicStats
  };
}

function scoreQuizForTopic(quiz, topic) {
  const normalizedTopic = normalizeTopic(topic);
  let score = 0;
  const quizTopic = normalizeTopic(quiz.topic);
  if (quizTopic === normalizedTopic) score += 10;
  if (String(quiz.mode || '').toLowerCase() === 'topic') score += 4;

  for (const question of quiz.questions || []) {
    if (normalizeTopic(question.topic || quizTopic) === normalizedTopic) score += 2;
  }

  return score;
}

function selectPracticeQuiz(topic, quizzes = []) {
  const publicQuizzes = quizzes.filter((quiz) => !quiz.isDeleted && quiz.isPublished);
  const scored = publicQuizzes
    .map((quiz) => ({ quiz, score: scoreQuizForTopic(quiz, topic) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const leftMode = String(left.quiz.mode || '').toLowerCase();
      const rightMode = String(right.quiz.mode || '').toLowerCase();
      const modePriority = (mode) => {
        if (mode === 'topic') return 3;
        if (mode === 'daily') return 2;
        if (mode === 'mock') return 1;
        return 0;
      };
      if (modePriority(rightMode) !== modePriority(leftMode)) return modePriority(rightMode) - modePriority(leftMode);
      const leftQuestions = Array.isArray(left.quiz.questions) ? left.quiz.questions.length : 0;
      const rightQuestions = Array.isArray(right.quiz.questions) ? right.quiz.questions.length : 0;
      if (rightQuestions !== leftQuestions) return rightQuestions - leftQuestions;
      return String(left.quiz.title || '').localeCompare(String(right.quiz.title || ''));
    });

  return scored[0]?.quiz || null;
}

function selectMockQuiz(quizzes = []) {
  return quizzes
    .filter((quiz) => !quiz.isDeleted && quiz.isPublished && String(quiz.mode || '').toLowerCase() === 'mock')
    .sort((left, right) => {
      const leftQuestions = Array.isArray(left.questions) ? left.questions.length : 0;
      const rightQuestions = Array.isArray(right.questions) ? right.questions.length : 0;
      if (rightQuestions !== leftQuestions) return rightQuestions - leftQuestions;
      return String(left.title || '').localeCompare(String(right.title || ''));
    })[0] || null;
}

function getAttemptedQuizIds(attempts = [], userId) {
  return new Set(
    attempts
      .filter((attempt) => String(attempt.userId) === String(userId) && ['completed', 'expired'].includes(attempt.status))
      .map((attempt) => String(attempt.quizId || '').trim())
      .filter(Boolean)
  );
}

function selectFallbackQuiz(topic, quizzes = [], excludeQuizId = null) {
  const publicQuizzes = quizzes.filter((quiz) => 
    !quiz.isDeleted && 
    quiz.isPublished && 
    String(quiz.id) !== String(excludeQuizId)
  );
  
  // Prefer topic tests or mock tests as fallback
  const alternativeQuizzes = publicQuizzes
    .filter((quiz) => {
      const mode = String(quiz.mode || '').toLowerCase();
      return mode === 'topic' || mode === 'mock';
    })
    .map((quiz) => ({ quiz, score: scoreQuizForTopic(quiz, topic) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const leftMode = String(left.quiz.mode || '').toLowerCase();
      const rightMode = String(right.quiz.mode || '').toLowerCase();
      const modePriority = (mode) => {
        if (mode === 'topic') return 2;
        if (mode === 'mock') return 1;
        return 0;
      };
      if (modePriority(rightMode) !== modePriority(leftMode)) return modePriority(rightMode) - modePriority(leftMode);
      return String(left.quiz.title || '').localeCompare(String(right.quiz.title || ''));
    });
  
  return alternativeQuizzes[0]?.quiz || null;
}

function buildRevisionRecommendation(topicRows, quizzes, currentSummary = null) {
  const topTopic = topicRows[0] || null;
  if (!topTopic) return null;

  // Must have pending revision items; if none, don't recommend revision
  if (topTopic.revisionWrongCount === 0) return null;

  const hasCurrentSummary = Boolean(currentSummary && typeof currentSummary === 'object');
  const currentAccuracy = hasCurrentSummary ? (Number(currentSummary?.accuracy) || 0) : null;
  const currentIncorrect = hasCurrentSummary ? (Number(currentSummary?.incorrectAnswers) || 0) : 0;
  const currentUnattempted = hasCurrentSummary ? (Number(currentSummary?.unattemptedQuestions) || 0) : 0;
  const hasPendingRevisionGaps = topTopic.revisionWrongCount > 0;
  const hasCurrentAttemptGaps = hasCurrentSummary && (currentIncorrect > 0 || currentUnattempted > 0);
  const shouldRevise =
    (hasPendingRevisionGaps || hasCurrentAttemptGaps) && (
      topTopic.accuracy < 65 ||
      topTopic.recentWrong7d >= 2 ||
      (hasCurrentSummary && currentAccuracy < 60) ||
      (hasCurrentSummary && currentIncorrect >= 1) ||
      (hasCurrentSummary && currentUnattempted >= 1) ||
      (topTopic.daysSinceLastPractice !== null && topTopic.daysSinceLastPractice >= 7 && topTopic.accuracy < 75)
    );

  if (!shouldRevise) return null;

  const revisionSetType = topTopic.skipped > topTopic.wrong && topTopic.skipped > 0
    ? 'retryUnattempted'
    : topTopic.recentWrong7d >= 2
      ? 'lastWrong'
      : topTopic.accuracy < 55
        ? 'weakTopic'
        : 'retryWrong';

  const estimatedMinutes = Math.max(5, Math.min(20, Math.ceil((topTopic.attempted || topTopic.questionSeen || 10) / 2)));
  const actionLabel = 'Revise first';
  const title = `Revise ${topTopic.topic}`;
  const reason = topTopic.attempted === 0
    ? `${topTopic.topic} has not been practiced yet, so revision will build a baseline.`
    : `${topTopic.topic} is at ${topTopic.accuracy}% accuracy with ${topTopic.recentWrong7d} recent wrong answer${topTopic.recentWrong7d === 1 ? '' : 's'}.`;

  return {
    action: 'revise',
    actionLabel,
     ctaLabel: 'Open revision',
    title,
    topic: topTopic.topic,
    reason,
    estimatedMinutes,
    estimatedTimeLabel: `${estimatedMinutes} min`,
    revisionSetType,
    quizId: null,
    quizTitle: null,
    quizMode: null,
    url: '/quizzes.html?mode=all',
    priorityScore: topTopic.priorityScore,
    mockReadinessHint: currentAccuracy >= 75 && topTopic.accuracy >= 70
      ? 'You are close to mock-ready. Finish this revision, then take a mock test.'
      : 'Revise this topic before moving back to new practice.'
  };
}

  function buildPracticeRecommendation(topTopic, quizzes, currentSummary = null, topicRows = [], attempts = [], userId = null) {
    const selectedQuiz = selectPracticeQuiz(topTopic.topic, quizzes);
    const currentAccuracy = Number(currentSummary?.accuracy) || 0;
    const overallReadyForMock = currentAccuracy >= 80 && topTopic.accuracy >= 75 && topTopic.practiceSessions >= 2;
      const attemptedQuizIds = userId ? getAttemptedQuizIds(attempts, userId) : new Set();
  
      // If selected quiz is already attempted, suggest a fallback alternative (topic test or mock test)
      let finalQuiz = selectedQuiz;
      if (finalQuiz && attemptedQuizIds.has(String(finalQuiz.id))) {
        const fallbackQuiz = selectFallbackQuiz(topTopic.topic, quizzes, finalQuiz.id);
        if (fallbackQuiz) {
          finalQuiz = fallbackQuiz;
        }
        // If no fallback found, use the original selected quiz anyway
      }
  
    const estimatedMinutes = finalQuiz
      ? Math.max(5, Number(finalQuiz.timeLimit) || 15)
      : Math.max(8, Math.min(25, Math.ceil((topTopic.questionSeen || 10) / 2)));

    const reason = finalQuiz
      ? `${finalQuiz.title} best matches your highest-priority topic, ${topTopic.topic}.`
      : `Continue with new practice on ${topTopic.topic} to improve its ${topTopic.accuracy}% accuracy.`;

    const recommendation = {
      action: 'practice',
      actionLabel: 'Continue practice',
      ctaLabel: finalQuiz ? 'Open quiz' : 'Continue practice',
      title: finalQuiz ? finalQuiz.title : `Practice ${topTopic.topic}`,
      topic: topTopic.topic,
      reason,
      estimatedMinutes,
      estimatedTimeLabel: `${estimatedMinutes} min`,
      revisionSetType: null,
      quizId: finalQuiz?.id || null,
      quizTitle: finalQuiz?.title || null,
      quizMode: finalQuiz?.mode || null,
      url: finalQuiz ? `/quizzes.html?quizId=${encodeURIComponent(finalQuiz.id)}` : '/quizzes.html?mode=topic',
      priorityScore: topTopic.priorityScore,
      mockReadinessHint: overallReadyForMock
        ? 'You are mock-ready. Take a full mock test next to validate exam stamina.'
        : `Finish one more practice cycle on ${topTopic.topic} before moving to a mock.`
    };

    if (topTopic.accuracy < 72 && currentAccuracy < 70) {
      recommendation.mockReadinessHint = 'Build accuracy on this topic before trying a mock test.';
    }

    return recommendation;
  }

function buildMockRecommendation(topTopic, quizzes = [], overallAccuracy = 0) {
  const mockQuiz = selectMockQuiz(quizzes);
  if (!mockQuiz) return null;

  const estimatedMinutes = Math.max(10, Number(mockQuiz.timeLimit) || 20);
  return {
    action: 'mock',
    actionLabel: 'Take a mock test',
    ctaLabel: 'Start mock test',
    title: mockQuiz.title || 'Take a full mock test',
    topic: topTopic?.topic || 'Mixed',
    reason: `Your current accuracy is ${overallAccuracy}% and weak-topic risk is controlled. Validate exam stamina with a mock test.`,
    estimatedMinutes,
    estimatedTimeLabel: `${estimatedMinutes} min`,
    revisionSetType: null,
    quizId: mockQuiz.id,
    quizTitle: mockQuiz.title || null,
    quizMode: mockQuiz.mode || 'mock',
    url: `/quizzes.html?quizId=${encodeURIComponent(mockQuiz.id)}`,
    priorityScore: topTopic?.priorityScore || 0,
    mockReadinessHint: 'You are mock-ready. Attempt a full mock, then review mistakes from the result page.'
  };
}

function buildAdaptiveRecommendation({
  userId,
  user = null,
  attempts = [],
  quizzes = [],
  wrongQuestions = [],
  bookmarks = [],
  currentSummary = null,
  now = Date.now()
} = {}) {
  const stats = buildTopicStats({
    userId,
    attempts,
    quizzes,
    wrongQuestions,
    bookmarks,
    now
  });

  const topicRows = stats.topicRows;
  const topTopic = topicRows[0] || null;

  const overallAttempted = stats.overallAttempted;
  const overallAccuracy = stats.overallAccuracy;
  const completedQuizCount = user ? Number(user.completedQuizCount) || 0 : 0;
  const userAccuracy = user ? Number(user.accuracyPercent) || overallAccuracy : overallAccuracy;
  const needsBaselinePractice = topicRows.length === 0 || overallAttempted === 0;

  let recommendation = null;

  if (needsBaselinePractice) {
    const defaultQuiz = quizzes
      .filter((quiz) => !quiz.isDeleted && quiz.isPublished)
      .sort((left, right) => {
        const leftMode = String(left.mode || '').toLowerCase();
        const rightMode = String(right.mode || '').toLowerCase();
        const modeOrder = { daily: 3, topic: 2, mock: 1 };
        if ((modeOrder[rightMode] || 0) !== (modeOrder[leftMode] || 0)) {
          return (modeOrder[rightMode] || 0) - (modeOrder[leftMode] || 0);
        }
        return String(left.title || '').localeCompare(String(right.title || ''));
      })[0] || null;

    recommendation = {
      action: 'practice',
      actionLabel: 'Start practice',
      title: defaultQuiz ? defaultQuiz.title : 'Start with a quiz',
      topic: defaultQuiz ? normalizeTopic(defaultQuiz.topic || defaultQuiz.mode || 'General') : 'General',
      reason: 'No practice history yet. Start with a baseline quiz to unlock topic priority guidance.',
      estimatedMinutes: defaultQuiz ? Math.max(5, Number(defaultQuiz.timeLimit) || 15) : 10,
      estimatedTimeLabel: `${defaultQuiz ? Math.max(5, Number(defaultQuiz.timeLimit) || 15) : 10} min`,
      revisionSetType: null,
      quizId: defaultQuiz?.id || null,
      quizTitle: defaultQuiz?.title || null,
      quizMode: defaultQuiz?.mode || null,
      url: defaultQuiz ? `/quizzes.html?quizId=${encodeURIComponent(defaultQuiz.id)}` : '/quizzes.html?mode=topic',
      priorityScore: 0,
      mockReadinessHint: 'Complete a few topic tests before attempting a mock test.'
    };
  } else {
    const hasPendingRevision = Array.isArray(wrongQuestions) && wrongQuestions.length > 0;
    
    let revisionRecommendation = null;
    if (hasPendingRevision) {
      revisionRecommendation = buildRevisionRecommendation(topicRows, quizzes, currentSummary);
    }
    
    const shouldTakeMock = Boolean(
      topTopic &&
      stats.overallAttempted >= 25 &&
      overallAccuracy >= 78 &&
      topTopic.accuracy >= 72 &&
      topTopic.recentWrong7d <= 1 &&
      topTopic.priorityScore <= 52
    );

    if (revisionRecommendation) {
      recommendation = revisionRecommendation;
    } else if (shouldTakeMock) {
      recommendation = buildMockRecommendation(topTopic, quizzes, overallAccuracy);
    } else if (topTopic) {
        recommendation = buildPracticeRecommendation(topTopic, quizzes, currentSummary, topicRows, attempts, userId);
    }
  }

  const priorityTopics = topicRows.slice(0, 5).map((stat, index) => ({
    rank: index + 1,
    topic: stat.topic,
    accuracy: stat.accuracy,
    priorityScore: stat.priorityScore,
    practiceSessions: stat.practiceSessions,
    recentWrong7d: stat.recentWrong7d,
    daysSinceLastPractice: stat.daysSinceLastPractice,
    reason: stat.reasonParts.join(' · ')
  }));

  return {
    recommendation,
    priorityTopics,
    summary: {
      overallAttempted,
      overallAccuracy,
      completedQuizCount,
      userAccuracy,
      weakTopic: topTopic ? topTopic.topic : null
    }
  };
}

module.exports = {
  buildAdaptiveRecommendation,
  buildTopicStats,
  normalizeTopic,
  getQuestionTopic,
  daysSince,
  selectPracticeQuiz
};
