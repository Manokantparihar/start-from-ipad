/**
 * Revision System Routes
 * Handles wrong questions tracking, bookmarks, and revision sets
 * 
 * Endpoints:
 * GET    /api/revision/sets           - Get all revision sets metadata
 * GET    /api/revision/sets/:setType  - Get specific revision set questions
 * POST   /api/revision/bookmarks      - Bookmark a question
 * DELETE /api/revision/bookmarks/:id  - Unbookmark a question
 * GET    /api/revision/bookmarks      - Get all bookmarked questions
 * POST   /api/revision/sets/:setType/start - Start a revision quiz session
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const auth = require('../middlewares/auth');

const router = express.Router();

// All routes require authentication
router.use(auth);

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Get all questions for a user from wrong questions data
 */
async function getUserWrongQuestions(userId) {
  return db.getWrongQuestions(userId);
}

/**
 * Get all bookmarked questions for a user
 */
async function getUserBookmarks(userId) {
  return db.getBookmarks(userId);
}

/**
 * Extract unique questions with full details from wrong questions
 */
async function buildRevisionSets(userId) {
  const [wrongQuestions, quizzes, attempts] = await Promise.all([
    getUserWrongQuestions(userId),
    db.getQuizzes({ includeDeleted: false, includeUnpublished: false }),
    db.getAttempts()
  ]);

  const activeQuizIds = new Set(
    attempts
      .filter((attempt) => attempt.userId === userId && ['completed', 'expired'].includes(attempt.status))
      .map((attempt) => String(attempt.quizId || '').trim())
      .filter(Boolean)
  );

  const filteredWrongQuestions = activeQuizIds.size > 0
    ? wrongQuestions.filter((entry) => activeQuizIds.has(String(entry.quizId || '').trim()))
    : [];

  // Build a map of questions from quizzes for full details
  const questionMap = new Map();
  quizzes.forEach(quiz => {
    (quiz.questions || []).forEach(q => {
      questionMap.set(q.id, { ...q, quizId: quiz.id, quizTitle: quiz.title });
    });
  });

  // Group wrong questions by topic
  const topicGroups = new Map();
  filteredWrongQuestions.forEach(wr => {
    const topic = wr.topic || 'General';
    if (!topicGroups.has(topic)) {
      topicGroups.set(topic, []);
    }
    topicGroups.get(topic).push(wr);
  });

  // Calculate topic accuracy
  const topicAccuracy = new Map();
  topicGroups.forEach((items, topic) => {
    topicAccuracy.set(topic, {
      topic,
      total: items.length,
      items
    });
  });

  // Find the topic with lowest accuracy (most errors)
  const weakestTopic = Array.from(topicAccuracy.values())
    .sort((a, b) => b.total - a.total)[0];

  return {
    wrongQuestions: filteredWrongQuestions,
    questionMap,
    topicGroups,
    weakestTopic
  };
}

/**
 * Build revision set based on type
 * Types: lastWrong, weakTopic, retryWrong, retryUnattempted
 */
async function getRevisionSet(userId, setType = 'lastWrong') {
  const { wrongQuestions, questionMap, topicGroups, weakestTopic } = await buildRevisionSets(userId);

  let questions = [];
  let metadata = {
    type: setType,
    description: '',
    count: 0
  };

  switch (setType) {
    case 'lastWrong': {
      // Last 20 incorrect questions sorted by timestamp (most recent first)
      questions = wrongQuestions
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 20)
        .map(wr => ({
          ...wr,
          fullQuestion: questionMap.get(wr.questionId) || null
        }));
      metadata.description = `Last ${questions.length} incorrect questions`;
      break;
    }

    case 'weakTopic': {
      // All incorrect questions from the topic with most errors
      if (weakestTopic) {
        questions = weakestTopic.items.slice(0, 20).map(wr => ({
          ...wr,
          fullQuestion: questionMap.get(wr.questionId) || null
        }));
        metadata.description = `Practice ${weakestTopic.topic} (${weakestTopic.total} incorrect)`;
      }
      break;
    }

    case 'retryWrong': {
      // All incorrect questions, sorted by frequency
      questions = wrongQuestions
        .slice(0, 20)
        .map(wr => ({
          ...wr,
          fullQuestion: questionMap.get(wr.questionId) || null
        }));
      metadata.description = `Retry all ${questions.length} incorrect questions`;
      break;
    }

    case 'retryUnattempted': {
      // Only show questions that were skipped/not attempted
      // These are tracked in wrong questions with empty selectedAnswer
      const unattempted = wrongQuestions
        .filter(wr => !wr.selectedAnswer || wr.selectedAnswer.trim() === '')
        .slice(0, 20)
        .map(wr => ({
          ...wr,
          fullQuestion: questionMap.get(wr.questionId) || null
        }));
      questions = unattempted;
      metadata.description = `Retry ${questions.length} skipped questions`;
      break;
    }

    default:
      throw new Error(`Unknown revision set type: ${setType}`);
  }

  metadata.count = questions.length;
  return { questions, metadata };
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

/**
 * GET /api/revision/sets
 * Get metadata for all revision sets available to user
 */
router.get('/sets', async (req, res) => {
  try {
    const { wrongQuestions, topicGroups, weakestTopic } = await buildRevisionSets(req.userId);
    const bookmarks = await getUserBookmarks(req.userId);

    const sets = {
      lastWrong: {
        type: 'lastWrong',
        label: 'Last Wrong',
        description: 'Last 20 incorrect questions',
        count: Math.min(20, wrongQuestions.length),
        icon: '⏱️',
        color: 'blue'
      },
      weakTopic: {
        type: 'weakTopic',
        label: weakestTopic ? `Weak Topic: ${weakestTopic.topic}` : 'No Weak Topics',
        description: weakestTopic ? `${weakestTopic.total} incorrect in this topic` : 'No wrong questions yet',
        count: weakestTopic ? Math.min(20, weakestTopic.items.length) : 0,
        icon: '📉',
        color: 'red'
      },
      retryWrong: {
        type: 'retryWrong',
        label: 'Retry Wrong',
        description: `All ${wrongQuestions.length} incorrect questions`,
        count: wrongQuestions.length,
        icon: '🔄',
        color: 'orange'
      },
      retryUnattempted: {
        type: 'retryUnattempted',
        label: 'Retry Skipped',
        description: 'Questions you haven\'t attempted',
        count: wrongQuestions.filter(w => !w.selectedAnswer || w.selectedAnswer.trim() === '').length,
        icon: '⏭️',
        color: 'purple'
      }
    };

    return res.json({
      sets,
      totals: {
        wrongQuestions: wrongQuestions.length,
        bookmarked: bookmarks.length,
        topicsCovered: topicGroups.size
      }
    });
  } catch (err) {
    console.error('[GET /api/revision/sets]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/revision/sets/:setType
 * Get questions for a specific revision set
 */
router.get('/sets/:setType', async (req, res) => {
  try {
    const validTypes = ['lastWrong', 'weakTopic', 'retryWrong', 'retryUnattempted'];
    if (!validTypes.includes(req.params.setType)) {
      return res.status(400).json({ error: 'Invalid set type' });
    }

    const { questions, metadata } = await getRevisionSet(req.userId, req.params.setType);

    return res.json({
      set: metadata,
      questions: questions.map(q => ({
        id: q.id,
        questionId: q.questionId,
        topic: q.topic,
        selectedAnswer: q.selectedAnswer,
        correctAnswer: q.correctAnswer,
        timestamp: q.timestamp,
        fullQuestion: q.fullQuestion ? {
          id: q.fullQuestion.id,
          question: q.fullQuestion.question || q.fullQuestion.text,
          options: q.fullQuestion.options,
          correctAnswer: q.fullQuestion.correctAnswer,
          explanation: q.fullQuestion.explanation,
          topic: q.fullQuestion.topic,
          difficulty: q.fullQuestion.difficulty
        } : null
      }))
    });
  } catch (err) {
    console.error(`[GET /api/revision/sets/:setType]`, err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/revision/bookmarks
 * Bookmark a question for later review
 */
router.post('/bookmarks', async (req, res) => {
  try {
    const { questionId, quizId, topic } = req.body;
    
    if (!questionId) {
      return res.status(400).json({ error: 'questionId is required' });
    }

    const bookmark = await db.addBookmark(req.userId, {
      questionId,
      quizId: quizId || '',
      topic: topic || 'General'
    });

    return res.status(201).json({
      bookmarked: true,
      bookmark
    });
  } catch (err) {
    console.error('[POST /api/revision/bookmarks]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /api/revision/bookmarks/:questionId
 * Remove a bookmark
 */
router.delete('/bookmarks/:questionId', async (req, res) => {
  try {
    const questionId = req.params.questionId;
    
    if (!questionId) {
      return res.status(400).json({ error: 'questionId is required' });
    }

    await db.removeBookmark(req.userId, questionId);

    return res.json({ removed: true });
  } catch (err) {
    console.error('[DELETE /api/revision/bookmarks/:questionId]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/revision/bookmarks
 * Get all bookmarked questions for user
 */
router.get('/bookmarks', async (req, res) => {
  try {
    const [bookmarks, quizzes] = await Promise.all([
      getUserBookmarks(req.userId),
      db.getQuizzes({ includeDeleted: false, includeUnpublished: false })
    ]);

    // Build question map
    const questionMap = new Map();
    quizzes.forEach(quiz => {
      (quiz.questions || []).forEach(q => {
        questionMap.set(q.id, { ...q, quizId: quiz.id, quizTitle: quiz.title });
      });
    });

    return res.json({
      count: bookmarks.length,
      bookmarks: bookmarks.map(b => ({
        id: b.id,
        questionId: b.questionId,
        topic: b.topic,
        bookmarkedAt: b.timestamp,
        fullQuestion: questionMap.get(b.questionId) ? {
          id: questionMap.get(b.questionId).id,
          question: questionMap.get(b.questionId).question || questionMap.get(b.questionId).text,
          options: questionMap.get(b.questionId).options,
          correctAnswer: questionMap.get(b.questionId).correctAnswer,
          explanation: questionMap.get(b.questionId).explanation,
          topic: questionMap.get(b.questionId).topic,
          difficulty: questionMap.get(b.questionId).difficulty
        } : null
      }))
    });
  } catch (err) {
    console.error('[GET /api/revision/bookmarks]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/revision/sets/:setType/start
 * Start a revision quiz session from a revision set
 * Creates a quiz attempt with questions from the revision set
 */
router.post('/sets/:setType/start', async (req, res) => {
  try {
    const validTypes = ['lastWrong', 'weakTopic', 'retryWrong', 'retryUnattempted'];
    if (!validTypes.includes(req.params.setType)) {
      return res.status(400).json({ error: 'Invalid set type' });
    }

    const { questions: revisionQuestions, metadata } = await getRevisionSet(req.userId, req.params.setType);

    if (revisionQuestions.length === 0) {
      return res.status(400).json({ error: 'No questions available for this revision set' });
    }

    // Create a revision quiz attempt
    // Determine time limit based on question count (1 minute per 2 questions, min 5 min)
    const timeLimit = Math.max(5, Math.ceil(revisionQuestions.length / 2));
    const now = Date.now();
    const expiresAt = now + (timeLimit * 60 * 1000);

    const attempt = {
      id: uuidv4(),
      userId: req.userId,
      quizId: `revision-${req.params.setType}`,
      quizTitle: `Revision: ${metadata.description}`,
      status: 'in-progress',
      startedAt: now,
      expiresAt,
      answers: [],
      // Store which revision set this came from
      revision: {
        setType: req.params.setType,
        revisionQuestionIds: revisionQuestions.map(q => q.questionId)
      },
      createdAt: now,
      updatedAt: now
    };

    const attempts = await db.getAttempts();
    attempts.push(attempt);
    await db.saveAttempts(attempts);

    // Return the attempt with questions (without correct answers)
    return res.status(201).json({
      attempt: {
        id: attempt.id,
        quizId: attempt.quizId,
        quizTitle: attempt.quizTitle,
        timeLimit,
        startedAt: attempt.startedAt,
        expiresAt: attempt.expiresAt,
        revisionSetType: req.params.setType
      },
      // Send questions without correct answers (for quiz taking)
      questions: revisionQuestions.map(rq => {
        const fullQuestion = rq.fullQuestion;
        return {
          id: fullQuestion?.id || rq.questionId,
          text: fullQuestion?.question || fullQuestion?.text || 'Question',
          topic: fullQuestion?.topic || rq.topic,
          options: fullQuestion?.options || [],
          explanation: fullQuestion?.explanation || ''
        };
      })
    });
  } catch (err) {
    console.error('[POST /api/revision/sets/:setType/start]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Check if a question is bookmarked (utility)  
 * GET /api/revision/bookmarks/check/:questionId
 */
router.get('/bookmarks/check/:questionId', async (req, res) => {
  try {
    const isBookmarked = await db.isQuestionBookmarked(req.userId, req.params.questionId);
    return res.json({ isBookmarked });
  } catch (err) {
    console.error('[GET /api/revision/bookmarks/check/:questionId]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
