/**
 * Revision System Routes
 * Single source-of-truth: wrong-questions.json + bookmarks.json
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const auth = require('../middlewares/auth');
const {
  REVISION_SET_TYPES,
  getUnifiedRevisionState,
  buildSetsFromWrongQuestions
} = require('../utils/revisionSystem');

const router = express.Router();

router.use(auth);

function mapSetTypeToDashboardKey(setType) {
  const mapping = {
    lastWrong: 'lastWrongQuestions',
    weakTopic: 'weakTopicQuestions',
    retryWrong: 'retryWrongQuestions',
    retryUnattempted: 'retryUnattemptedQuestions'
  };
  return mapping[setType] || '';
}

function buildSetMetadata(setType, sets) {
  switch (setType) {
    case 'lastWrong':
      return { type: setType, description: `Last ${sets.lastWrongQuestions.length} incorrect questions` };
    case 'weakTopic':
      return {
        type: setType,
        description: sets.weakTopic
          ? `Practice ${sets.weakTopic}`
          : 'No weak questions yet'
      };
    case 'retryWrong':
      return { type: setType, description: `Retry ${sets.retryWrongQuestions.length} incorrect questions` };
    case 'retryUnattempted':
      return { type: setType, description: `Retry ${sets.retryUnattemptedQuestions.length} skipped questions` };
    default:
      throw new Error(`Unknown set type: ${setType}`);
  }
}

router.get('/sets', async (req, res) => {
  try {
    const { wrongQuestions, bookmarks } = await getUnifiedRevisionState(req.userId);
    const sets = buildSetsFromWrongQuestions(wrongQuestions);

    return res.json({
      sets: {
        lastWrong: {
          type: 'lastWrong',
          label: 'Last Wrong',
          description: 'Last 20 incorrect questions',
          count: sets.lastWrongQuestions.length,
          icon: '⏱️',
          color: 'blue'
        },
        weakTopic: {
          type: 'weakTopic',
          label: sets.weakTopic ? `Weak Topic: ${sets.weakTopic}` : 'No Weak Topics',
          description: sets.weakTopic ? `${sets.weakTopicQuestions.length} incorrect in this topic` : 'No wrong questions yet',
          count: sets.weakTopicQuestions.length,
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
          description: 'Questions you have not attempted',
          count: sets.retryUnattemptedQuestions.length,
          icon: '⏭️',
          color: 'purple'
        }
      },
      totals: {
        wrongQuestions: wrongQuestions.length,
        bookmarked: bookmarks.length,
        topicsCovered: sets.groupedByTopic.length
      }
    });
  } catch (err) {
    console.error('[GET /api/revision/sets]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/sets/:setType', async (req, res) => {
  try {
    const setType = String(req.params.setType || '').trim();
    if (!REVISION_SET_TYPES.includes(setType)) {
      return res.status(400).json({ error: 'Invalid set type' });
    }

    const { wrongQuestions } = await getUnifiedRevisionState(req.userId);
    const sets = buildSetsFromWrongQuestions(wrongQuestions);
    const setKey = mapSetTypeToDashboardKey(setType);
    const questions = sets[setKey] || [];
    const metadata = buildSetMetadata(setType, sets);

    return res.json({
      set: {
        ...metadata,
        count: questions.length
      },
      questions: questions.map((q) => ({
        id: q.id,
        questionId: q.questionId,
        topic: q.topic,
        selectedAnswer: q.selectedAnswer,
        correctAnswer: q.correctAnswer,
        timestamp: q.timestamp,
        fullQuestion: q.question
          ? {
              id: q.questionId,
              question: q.question,
              options: q.options,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation,
              topic: q.topic,
              difficulty: q.difficulty
            }
          : null
      }))
    });
  } catch (err) {
    console.error('[GET /api/revision/sets/:setType]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/bookmarks', async (req, res) => {
  try {
    const questionId = String(req.body?.questionId || '').trim();
    if (!questionId) {
      return res.status(400).json({ error: 'questionId is required' });
    }

    await db.migrateLegacyRevisionState(req.userId);
    const bookmark = await db.addBookmark(req.userId, {
      questionId,
      quizId: String(req.body?.quizId || '').trim(),
      topic: String(req.body?.topic || 'General').trim() || 'General'
    });

    return res.status(201).json({ bookmarked: true, bookmark });
  } catch (err) {
    console.error('[POST /api/revision/bookmarks]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/bookmarks/:questionId', async (req, res) => {
  try {
    const questionId = String(req.params.questionId || '').trim();
    if (!questionId) {
      return res.status(400).json({ error: 'questionId is required' });
    }

    await db.migrateLegacyRevisionState(req.userId);
    await db.removeBookmark(req.userId, questionId);
    return res.json({ removed: true });
  } catch (err) {
    console.error('[DELETE /api/revision/bookmarks/:questionId]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/bookmarks', async (req, res) => {
  try {
    const { bookmarks } = await getUnifiedRevisionState(req.userId);
    return res.json({ count: bookmarks.length, bookmarks });
  } catch (err) {
    console.error('[GET /api/revision/bookmarks]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/sets/:setType/start', async (req, res) => {
  try {
    const setType = String(req.params.setType || '').trim();
    if (!REVISION_SET_TYPES.includes(setType)) {
      return res.status(400).json({ error: 'Invalid set type' });
    }

    const { wrongQuestions } = await getUnifiedRevisionState(req.userId);
    const sets = buildSetsFromWrongQuestions(wrongQuestions);
    const setKey = mapSetTypeToDashboardKey(setType);
    const revisionQuestions = sets[setKey] || [];

    if (revisionQuestions.length === 0) {
      return res.status(400).json({ error: 'No questions available for this revision set' });
    }

    const metadata = buildSetMetadata(setType, sets);
    const timeLimit = Math.max(5, Math.ceil(revisionQuestions.length / 2));
    const now = Date.now();
    const expiresAt = now + (timeLimit * 60 * 1000);

    const attempt = {
      id: uuidv4(),
      userId: req.userId,
      quizId: `revision-${setType}`,
      quizTitle: `Revision: ${metadata.description}`,
      status: 'in-progress',
      startedAt: now,
      expiresAt,
      answers: [],
      revision: {
        setType,
        revisionQuestionIds: revisionQuestions.map((question) => question.questionId)
      },
      createdAt: now,
      updatedAt: now
    };

    const attempts = await db.getAttempts();
    attempts.push(attempt);
    await db.saveAttempts(attempts);

    return res.status(201).json({
      attempt: {
        id: attempt.id,
        quizId: attempt.quizId,
        quizTitle: attempt.quizTitle,
        timeLimit,
        startedAt: attempt.startedAt,
        expiresAt: attempt.expiresAt,
        revisionSetType: setType
      },
      questions: revisionQuestions.map((question) => ({
        id: question.questionId,
        text: question.question || 'Question',
        topic: question.topic,
        options: question.options || [],
        explanation: question.explanation || ''
      }))
    });
  } catch (err) {
    console.error('[POST /api/revision/sets/:setType/start]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

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
