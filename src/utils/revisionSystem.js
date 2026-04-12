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

  return {
    id: entry.id,
    questionId,
    quizId: String(entry.quizId || fullQuestion?.quizId || '').trim(),
    quizTitle: String(fullQuestion?.quizTitle || '').trim(),
    topic: normalizeTopic(entry.topic || fullQuestion?.topic),
    selectedAnswer: entry.selectedAnswer === undefined || entry.selectedAnswer === null ? '' : String(entry.selectedAnswer),
    correctAnswer: entry.correctAnswer === undefined || entry.correctAnswer === null ? '' : String(entry.correctAnswer),
    timestamp: entry.timestamp || new Date().toISOString(),
    lastSeenAt: entry.timestamp || new Date().toISOString(),
    savedAt: entry.timestamp || new Date().toISOString(),
    question: String(fullQuestion?.question || fullQuestion?.text || '').trim(),
    options: Array.isArray(fullQuestion?.options) ? fullQuestion.options : [],
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

function buildSetsFromWrongQuestions(wrongQuestions = []) {
  const groupedByTopic = buildTopicGroups(wrongQuestions);
  const weakTopic = groupedByTopic[0]?.topic || null;

  return {
    groupedByTopic,
    weakTopic,
    lastWrongQuestions: [...wrongQuestions]
      .sort((a, b) => new Date(b.lastSeenAt || b.timestamp).getTime() - new Date(a.lastSeenAt || a.timestamp).getTime())
      .slice(0, 20),
    weakTopicQuestions: weakTopic
      ? wrongQuestions.filter((item) => item.topic === weakTopic).slice(0, 20)
      : [],
    retryWrongQuestions: [...wrongQuestions]
      .sort((a, b) => new Date(b.lastSeenAt || b.timestamp).getTime() - new Date(a.lastSeenAt || a.timestamp).getTime())
      .slice(0, 20),
    retryUnattemptedQuestions: [...wrongQuestions]
      .filter((item) => !item.selectedAnswer || !item.selectedAnswer.trim())
      .sort((a, b) => new Date(b.lastSeenAt || b.timestamp).getTime() - new Date(a.lastSeenAt || a.timestamp).getTime())
      .slice(0, 20)
  };
}

async function getUnifiedRevisionState(userId) {
  await db.migrateLegacyRevisionState(userId);

  const [wrongQuestionsRaw, bookmarksRaw, quizzes, attempts] = await Promise.all([
    db.getWrongQuestions(userId),
    db.getBookmarks(userId),
    db.getQuizzes({ includeDeleted: false, includeUnpublished: false }),
    db.getAttempts()
  ]);

  const questionMap = buildQuestionMap(quizzes);
  const activeQuizIds = buildActiveQuizIdSet(attempts, userId);

  const wrongQuestions = activeQuizIds.size > 0
    ? wrongQuestionsRaw
      .filter((entry) => activeQuizIds.has(String(entry.quizId || '').trim()))
      .map((entry) => hydrateWrongQuestion(entry, questionMap))
    : [];

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

async function reconcileRevisionProgress(userId, reviewItems = [], contextQuizId = '') {
  const currentWrongRows = await db.getWrongQuestions(userId);
  const solvedQuestionIds = new Set();
  const stillWrongMap = new Map();

  reviewItems.forEach((item) => {
    const questionId = String(item?.questionId || '').trim();
    if (!questionId) return;

    const selected = item?.selected;
    const isAttempted = selected !== null && selected !== undefined && selected !== '';
    const isCorrect = Boolean(item?.isCorrect) || (isAttempted && selected === item?.correctAnswer);

    if (isCorrect) {
      solvedQuestionIds.add(questionId);
      return;
    }

    stillWrongMap.set(questionId, {
      questionId,
      quizId: String(item?.quizId || contextQuizId || '').trim(),
      topic: normalizeTopic(item?.topic),
      selectedAnswer: isAttempted ? String(selected) : '',
      correctAnswer: item?.correctAnswer === undefined || item?.correctAnswer === null ? '' : String(item.correctAnswer)
    });
  });

  const toRemoveIds = currentWrongRows
    .filter((row) => solvedQuestionIds.has(String(row.questionId || '').trim()) || stillWrongMap.has(String(row.questionId || '').trim()))
    .map((row) => row.id);

  for (const rowId of toRemoveIds) {
    await db.removeWrongQuestion(rowId);
  }

  for (const row of stillWrongMap.values()) {
    await db.addWrongQuestion(userId, row);
  }

  const latestWrongRows = await db.getWrongQuestions(userId);

  return {
    updated: true,
    resolvedCount: solvedQuestionIds.size,
    stillWrongCount: stillWrongMap.size,
    remainingWrongQuestions: latestWrongRows.length
  };
}

module.exports = {
  REVISION_SET_TYPES,
  getUnifiedRevisionState,
  getAttemptsRevisionPayload,
  reconcileRevisionProgress,
  buildSetsFromWrongQuestions
};
