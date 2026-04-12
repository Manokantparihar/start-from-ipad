const db = require('./db');

const REVISION_SET_TYPES = ['lastWrong', 'weakTopic', 'retryWrong', 'retryUnattempted'];

function normalizeTopic(value) {
  return String(value || 'General').trim() || 'General';
}

function buildQuestionMap(quizzes = []) {
  const questionMap = new Map();
  quizzes.forEach((quiz) => {
    (quiz.questions || []).forEach((question) => {
      questionMap.set(String(question.id), {
        ...question,
        quizId: quiz.id,
        quizTitle: quiz.title
      });
    });
  });
  return questionMap;
}

function normalizePlayableQuestion(question = {}) {
  const options = Array.isArray(question.options)
    ? question.options.map((option) => String(option || '').trim()).filter(Boolean)
    : [];
  const uniqueOptions = Array.from(new Set(options));
  const correctAnswer = String(question.correctAnswer === undefined || question.correctAnswer === null ? '' : question.correctAnswer).trim();

  if (!question.questionId || !question.question || uniqueOptions.length !== 4 || !correctAnswer) {
    return null;
  }

  if (!uniqueOptions.includes(correctAnswer)) {
    return null;
  }

  return {
    ...question,
    options: uniqueOptions,
    correctAnswer
  };
}

function buildActiveQuizIdSet(attempts = [], userId) {
  return new Set(
    attempts
      .filter((attempt) => attempt.userId === userId && ['completed', 'expired'].includes(attempt.status))
      .map((attempt) => String(attempt.quizId || '').trim())
      .filter(Boolean)
  );
}

function hydrateWrongQuestion(entry = {}, questionMap = new Map()) {
  const questionId = String(entry.questionId || '').trim();
  const fullQuestion = questionMap.get(questionId) || null;
  const canonicalOptions = Array.isArray(fullQuestion?.options) ? fullQuestion.options : [];
  const canonicalCorrectAnswer = fullQuestion?.correctAnswer === undefined || fullQuestion?.correctAnswer === null
    ? ''
    : String(fullQuestion.correctAnswer).trim();
  const entryCorrectAnswer = entry.correctAnswer === undefined || entry.correctAnswer === null ? '' : String(entry.correctAnswer).trim();
  const resolvedCorrectAnswer = canonicalCorrectAnswer || entryCorrectAnswer;
  const resolvedOptions = canonicalOptions;

  const playableQuestion = normalizePlayableQuestion({
    questionId,
    question: String(fullQuestion?.question || fullQuestion?.text || '').trim(),
    options: resolvedOptions,
    correctAnswer: resolvedCorrectAnswer
  });

  if (!playableQuestion) {
    console.warn('[revisionSystem] Skipping corrupt revision question', {
      questionId,
      quizId: String(entry.quizId || fullQuestion?.quizId || '').trim(),
      hasCanonicalQuestion: Boolean(fullQuestion),
      canonicalOptionsCount: canonicalOptions.length,
      canonicalCorrectAnswer: canonicalCorrectAnswer || entryCorrectAnswer || ''
    });
    return null;
  }

  return {
    id: entry.id,
    questionId,
    quizId: String(entry.quizId || fullQuestion?.quizId || '').trim(),
    quizTitle: String(fullQuestion?.quizTitle || '').trim(),
    topic: normalizeTopic(entry.topic || fullQuestion?.topic),
    selectedAnswer: entry.selectedAnswer === undefined || entry.selectedAnswer === null ? '' : String(entry.selectedAnswer),
    correctAnswer: playableQuestion.correctAnswer,
    status: String(entry.status || (entry.selectedAnswer === undefined || entry.selectedAnswer === null || entry.selectedAnswer === '' ? 'unattempted' : 'wrong')).trim() || 'wrong',
    timesMissed: Number.isFinite(Number(entry.timesMissed)) ? Number(entry.timesMissed) : 1,
    timestamp: entry.timestamp || new Date().toISOString(),
    lastSeenAt: entry.timestamp || new Date().toISOString(),
    savedAt: entry.timestamp || new Date().toISOString(),
    question: playableQuestion.question,
    options: playableQuestion.options,
    explanation: fullQuestion?.explanation || '',
    subtopic: fullQuestion?.subtopic || '',
    difficulty: fullQuestion?.difficulty || ''
  };
}

function hydrateBookmark(entry = {}, questionMap = new Map()) {
  const questionId = String(entry.questionId || '').trim();
  const fullQuestion = questionMap.get(questionId) || null;

  return {
    id: entry.id,
    questionId,
    quizId: String(entry.quizId || fullQuestion?.quizId || '').trim(),
    topic: normalizeTopic(entry.topic || fullQuestion?.topic),
    timestamp: entry.timestamp || new Date().toISOString(),
    bookmarkedAt: entry.timestamp || new Date().toISOString(),
    question: String(fullQuestion?.question || fullQuestion?.text || '').trim(),
    options: Array.isArray(fullQuestion?.options) ? fullQuestion.options : [],
    correctAnswer: fullQuestion?.correctAnswer === undefined || fullQuestion?.correctAnswer === null ? '' : String(fullQuestion.correctAnswer),
    explanation: fullQuestion?.explanation || '',
    subtopic: fullQuestion?.subtopic || '',
    difficulty: fullQuestion?.difficulty || '',
    fullQuestion: fullQuestion
      ? {
          id: fullQuestion.id,
          question: fullQuestion.question || fullQuestion.text,
          options: fullQuestion.options,
          correctAnswer: fullQuestion.correctAnswer,
          explanation: fullQuestion.explanation,
          topic: fullQuestion.topic,
          difficulty: fullQuestion.difficulty
        }
      : null
  };
}

function buildTopicGroups(items = []) {
  const groups = new Map();
  items.forEach((item) => {
    const topic = normalizeTopic(item.topic);
    if (!groups.has(topic)) {
      groups.set(topic, { topic, count: 0, questions: [] });
    }

    const bucket = groups.get(topic);
    bucket.count += 1;
    bucket.questions.push(item);
  });

  return Array.from(groups.values()).sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}

function buildWrongQuestionKey(questionId) {
  return String(questionId || '').trim();
}

function mergeWrongQuestionsByKey(wrongQuestions = []) {
  const merged = new Map();

  wrongQuestions.forEach((entry) => {
    const questionId = String(entry.questionId || '').trim();
    if (!questionId) return;

    const key = buildWrongQuestionKey(questionId);
    const normalized = {
      ...entry,
      questionId,
      quizId: String(entry.quizId || '').trim(),
      topic: normalizeTopic(entry.topic),
      selectedAnswer: entry.selectedAnswer === undefined || entry.selectedAnswer === null ? '' : String(entry.selectedAnswer),
      correctAnswer: entry.correctAnswer === undefined || entry.correctAnswer === null ? '' : String(entry.correctAnswer),
      status: String(entry.status || (entry.selectedAnswer === undefined || entry.selectedAnswer === null || entry.selectedAnswer === '' ? 'unattempted' : 'wrong')).trim() || 'wrong',
      timesMissed: Number.isFinite(Number(entry.timesMissed)) ? Number(entry.timesMissed) : 1,
      timestamp: entry.timestamp || entry.lastSeenAt || entry.savedAt || new Date().toISOString(),
      lastSeenAt: entry.lastSeenAt || entry.timestamp || entry.savedAt || new Date().toISOString(),
      savedAt: entry.savedAt || entry.timestamp || entry.lastSeenAt || new Date().toISOString(),
      updatedAt: entry.updatedAt || entry.lastSeenAt || entry.timestamp || entry.savedAt || new Date().toISOString(),
      lastOutcome: String(entry.lastOutcome || entry.status || (entry.selectedAnswer === undefined || entry.selectedAnswer === null || entry.selectedAnswer === '' ? 'unattempted' : 'wrong')).trim() || 'wrong'
    };

    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, normalized);
      return;
    }

    const existingTime = new Date(existing.lastSeenAt || existing.timestamp || existing.savedAt || 0).getTime();
    const candidateTime = new Date(normalized.lastSeenAt || normalized.timestamp || normalized.savedAt || 0).getTime();
    if (candidateTime >= existingTime) {
      merged.set(key, {
        ...existing,
        ...normalized,
        id: normalized.id || existing.id,
        timesMissed: Math.max(Number(existing.timesMissed) || 0, Number(normalized.timesMissed) || 0)
      });
    }
  });

  return Array.from(merged.values())
    .sort((a, b) => new Date(b.lastSeenAt || b.timestamp || b.savedAt).getTime() - new Date(a.lastSeenAt || a.timestamp || a.savedAt).getTime());
}

function buildSetsFromWrongQuestions(wrongQuestions = []) {
  const groupedByTopic = buildTopicGroups(wrongQuestions);
  const weakTopic = groupedByTopic[0]?.topic || null;

  return {
    groupedByTopic,
    weakTopic,
    lastWrongQuestions: [...wrongQuestions]
      .sort((a, b) => new Date(b.lastSeenAt || b.updatedAt || b.timestamp).getTime() - new Date(a.lastSeenAt || a.updatedAt || a.timestamp).getTime())
      .slice(0, 20),
    weakTopicQuestions: weakTopic
      ? wrongQuestions.filter((item) => item.topic === weakTopic).slice(0, 20)
      : [],
    retryWrongQuestions: [...wrongQuestions]
      .filter((item) => String(item.status || item.lastOutcome || '').trim() === 'wrong' || String(item.lastOutcome || '').trim() === 'wrong')
      .sort((a, b) => new Date(b.lastSeenAt || b.updatedAt || b.timestamp).getTime() - new Date(a.lastSeenAt || a.updatedAt || a.timestamp).getTime())
      .slice(0, 20),
    retryUnattemptedQuestions: [...wrongQuestions]
      .filter((item) => String(item.status || item.lastOutcome || '').trim() === 'unattempted' || (!item.selectedAnswer || !item.selectedAnswer.trim()))
      .sort((a, b) => new Date(b.lastSeenAt || b.updatedAt || b.timestamp).getTime() - new Date(a.lastSeenAt || a.updatedAt || a.timestamp).getTime())
      .slice(0, 20)
  };
}

async function getUnifiedRevisionState(userId) {
  await db.migrateLegacyRevisionState(userId);

  const [wrongQuestionsRaw, bookmarksRaw, quizzes, attempts] = await Promise.all([
    db.getWrongQuestions(userId),
    db.getBookmarks(userId),
    db.getQuizzes({ includeDeleted: true, includeUnpublished: true }),
    db.getAttempts()
  ]);

  const questionMap = buildQuestionMap(quizzes);
  const wrongQuestions = mergeWrongQuestionsByKey(wrongQuestionsRaw)
    .map((entry) => hydrateWrongQuestion(entry, questionMap))
    .filter(Boolean);

  const bookmarks = bookmarksRaw.map((entry) => hydrateBookmark(entry, questionMap));

  return {
    wrongQuestions,
    bookmarks,
    questionMap
  };
}

async function getAttemptsRevisionPayload(userId) {
  const state = await getUnifiedRevisionState(userId);
  const sets = buildSetsFromWrongQuestions(state.wrongQuestions);

  return {
    totals: {
      wrongQuestions: state.wrongQuestions.length,
      bookmarkedQuestions: state.bookmarks.length,
      topicsInRevision: sets.groupedByTopic.length
    },
    groupedByTopic: sets.groupedByTopic,
    bookmarks: state.bookmarks,
    revisionSets: {
      lastWrongQuestions: sets.lastWrongQuestions,
      weakTopic: sets.weakTopic,
      weakTopicQuestions: sets.weakTopicQuestions,
      retryWrongQuestions: sets.retryWrongQuestions,
      retryUnattemptedQuestions: sets.retryUnattemptedQuestions
    }
  };
}

async function reconcileRevisionProgress(userId, reviewItems = [], context = {}) {
  const contextQuizId = String(context?.quizId || '').trim();
  const contextSetKey = String(context?.setKey || '').trim();
  const currentWrongRows = mergeWrongQuestionsByKey(await db.getWrongQuestions(userId));
  const nextWrongMap = new Map(currentWrongRows.map((row) => [buildWrongQuestionKey(row.questionId), row]));

  reviewItems.forEach((item) => {
    const questionId = String(item?.questionId || '').trim();
    if (!questionId) return;

    const quizId = String(item?.quizId || contextQuizId || '').trim();
    const key = buildWrongQuestionKey(questionId);
    const selected = item?.selected;
    const isAttempted = selected !== null && selected !== undefined && selected !== '';
    const isCorrect = Boolean(item?.isCorrect) || (isAttempted && selected === item?.correctAnswer);

    if (isCorrect) {
      nextWrongMap.delete(key);
      return;
    }

    const existing = nextWrongMap.get(key) || null;
    nextWrongMap.set(key, {
      id: existing?.id || item?.id || undefined,
      userId,
      questionId,
      quizId,
      topic: normalizeTopic(item?.topic),
      selectedAnswer: isAttempted ? String(selected) : '',
      correctAnswer: item?.correctAnswer === undefined || item?.correctAnswer === null ? '' : String(item.correctAnswer),
      status: isAttempted ? 'wrong' : 'unattempted',
      timesMissed: (Number(existing?.timesMissed) || 0) + 1,
      timestamp: existing?.timestamp || existing?.lastSeenAt || existing?.savedAt || new Date().toISOString(),
      firstSeenAt: existing?.firstSeenAt || existing?.timestamp || existing?.lastSeenAt || existing?.savedAt || new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      savedAt: existing?.savedAt || existing?.timestamp || existing?.lastSeenAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastOutcome: isAttempted ? 'wrong' : 'unattempted'
    });
  });

  const nextWrongRows = Array.from(nextWrongMap.values());
  await db.replaceWrongQuestionsForUser(userId, nextWrongRows);
  const refreshedRevision = await getAttemptsRevisionPayload(userId);

  return {
    updated: true,
    setKey: contextSetKey,
    resolvedCount: currentWrongRows.length - nextWrongRows.length,
    stillWrongCount: nextWrongRows.length,
    remainingWrongQuestions: nextWrongRows.length,
    revision: refreshedRevision
  };
}

module.exports = {
  REVISION_SET_TYPES,
  getUnifiedRevisionState,
  getAttemptsRevisionPayload,
  reconcileRevisionProgress,
  buildSetsFromWrongQuestions
};
