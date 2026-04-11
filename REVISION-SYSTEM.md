# Revision System - Backend Implementation

## Overview

The revision system tracks incorrect quiz answers and allows students to review and practice weak areas. The system provides:

1. **Wrong Questions Tracking** - Stores incorrect answers per user
2. **Bookmark System** - Users can bookmark questions for review
3. **Topic Tracking** - Tracks accuracy per topic
4. **Revision Sets** - Pre-built question sets for targeted practice
5. **Revision Sessions** - Start quiz sessions from revision sets

---

## Data Structure

### 1. Wrong Questions (`data/wrong-questions.json`)

```json
[
  {
    "id": "uuid",
    "userId": "user-uuid",
    "questionId": "q-uuid",
    "quizId": "quiz-uuid",
    "topic": "Mathematics",
    "selectedAnswer": "Option B",
    "correctAnswer": "Option A",
    "timestamp": "2026-04-11T10:30:00.000Z"
  }
]
```

**Fields:**
- `id`: Unique identifier for this wrong question entry
- `userId`: User who answered incorrectly
- `questionId`: The question that was answered wrong
- `quizId`: Quiz where the wrong answer was submitted
- `topic`: Topic of the question (from question or quiz)
- `selectedAnswer`: What the user selected (empty string if unattempted)
- `correctAnswer`: The correct answer
- `timestamp`: When the wrong answer was recorded

### 2. Bookmarks (`data/bookmarks.json`)

```json
[
  {
    "id": "uuid",
    "userId": "user-uuid",
    "questionId": "q-uuid",
    "quizId": "quiz-uuid",
    "topic": "Science",
    "timestamp": "2026-04-11T10:30:00.000Z"
  }
]
```

**Fields:**
- `id`: Unique bookmark identifier
- `userId`: User who bookmarked
- `questionId`: Bookmarked question ID
- `quizId`: Quiz containing this question
- `topic`: Topic for quick reference
- `timestamp`: When bookmarked

---

## Backend Implementation

### Database Utilities (`src/utils/db.js`)

New functions added to db.js:

```javascript
// Wrong Questions
getWrongQuestions(userId)          // Get all wrong questions for user
addWrongQuestion(userId, data)     // Add a wrong question entry
removeWrongQuestion(id)            // Remove a wrong question entry

// Bookmarks
getBookmarks(userId)               // Get all bookmarks for user
addBookmark(userId, data)          // Add a bookmark
removeBookmark(userId, questionId) // Remove a bookmark
isQuestionBookmarked(userId, questionId) // Check if bookmarked
```

### Revision Routes (`src/routes/revision.js`)

#### GET `/api/revision/sets`
Get metadata for all available revision sets

**Response:**
```json
{
  "sets": {
    "lastWrong": {
      "type": "lastWrong",
      "label": "Last Wrong",
      "description": "Last 20 incorrect questions",
      "count": 15,
      "icon": "⏱️",
      "color": "blue"
    },
    "weakTopic": {
      "type": "weakTopic",
      "label": "Weak Topic: Mathematics",
      "description": "8 incorrect in this topic",
      "count": 8,
      "icon": "📉",
      "color": "red"
    },
    "retryWrong": {
      "type": "retryWrong",
      "label": "Retry Wrong",
      "description": "All 50 incorrect questions",
      "count": 50,
      "icon": "🔄",
      "color": "orange"
    },
    "retryUnattempted": {
      "type": "retryUnattempted",
      "label": "Retry Skipped",
      "description": "Questions you haven't attempted",
      "count": 12,
      "icon": "⏭️",
      "color": "purple"
    }
  },
  "totals": {
    "wrongQuestions": 50,
    "bookmarked": 8,
    "topicsCovered": 5
  }
}
```

#### GET `/api/revision/sets/:setType`
Get questions in a revision set

**Parameters:**
- `setType`: `lastWrong | weakTopic | retryWrong | retryUnattempted`

**Response:**
```json
{
  "set": {
    "type": "lastWrong",
    "description": "Last 20 incorrect questions",
    "count": 15
  },
  "questions": [
    {
      "id": "wrong-question-id-123",
      "questionId": "q-uuid",
      "topic": "Mathematics",
      "selectedAnswer": "Option B",
      "correctAnswer": "Option A",
      "timestamp": "2026-04-11T10:30:00.000Z",
      "fullQuestion": {
        "id": "q-uuid",
        "question": "What is 2 + 2?",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctAnswer": "Option A",
        "explanation": "2 + 2 = 4",
        "topic": "Mathematics",
        "difficulty": "easy"
      }
    }
  ]
}
```

#### POST `/api/revision/bookmarks`
Bookmark a question

**Request:**
```json
{
  "questionId": "q-uuid",
  "quizId": "quiz-uuid",
  "topic": "Science"
}
```

**Response:**
```json
{
  "bookmarked": true,
  "bookmark": {
    "id": "bookmark-uuid",
    "userId": "user-uuid",
    "questionId": "q-uuid",
    "quizId": "quiz-uuid",
    "topic": "Science",
    "timestamp": "2026-04-11T10:30:00.000Z"
  }
}
```

#### DELETE `/api/revision/bookmarks/:questionId`
Remove a bookmark

**Response:**
```json
{
  "removed": true
}
```

#### GET `/api/revision/bookmarks`
Get all bookmarked questions

**Response:**
```json
{
  "count": 8,
  "bookmarks": [
    {
      "id": "bookmark-uuid",
      "questionId": "q-uuid",
      "topic": "Science",
      "bookmarkedAt": "2026-04-11T10:30:00.000Z",
      "fullQuestion": {
        "id": "q-uuid",
        "question": "What is photosynthesis?",
        "options": [...],
        "correctAnswer": "...",
        "explanation": "...",
        "topic": "Science",
        "difficulty": "medium"
      }
    }
  ]
}
```

#### GET `/api/revision/bookmarks/check/:questionId`
Check if a question is bookmarked

**Response:**
```json
{
  "isBookmarked": true
}
```

#### POST `/api/revision/sets/:setType/start`
Start a revision quiz session from a revision set

**Creates** a new quiz attempt with questions from the specified revision set

**Parameters:**
- `setType`: `lastWrong | weakTopic | retryWrong | retryUnattempted`

**Response:**
```json
{
  "attempt": {
    "id": "attempt-uuid",
    "quizId": "revision-lastWrong",
    "quizTitle": "Revision: Last 20 incorrect questions",
    "timeLimit": 10,
    "startedAt": 1712900400000,
    "expiresAt": 1712901000000,
    "revisionSetType": "lastWrong"
  },
  "questions": [
    {
      "id": "q-uuid",
      "text": "What is 2 + 2?",
      "topic": "Mathematics",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "explanation": "2 + 2 = 4"
    }
  ]
}
```

---

## Automatic Tracking

### Quiz Submission Flow

When a user submits a quiz (`POST /api/attempts/:id/submit`):

1. ✅ Quiz is graded
2. ✅ Wrong answers are identified
3. ✅ Each wrong/unattempted question is added to `wrong-questions.json`
4. ✅ User's revision state in user record is also updated (legacy)
5. ✅ Gamification sync happens as usual

**Data tracked per wrong answer:**
- `questionId`: Which question was wrong
- `quizId`: Which quiz it was from
- `topic`: Topic of the question
- `selectedAnswer`: User's answer (empty if skipped)
- `correctAnswer`: The right answer
- `timestamp`: When it was recorded

---

## Revision Sets Logic

### 1. Last Wrong (`lastWrong`)
- **Source**: All wrong questions
- **Sort**: By timestamp (most recent first)
- **Limit**: Last 20
- **Purpose**: Quick review of recent mistakes
- **When to use**: After completing a quiz to review what you just got wrong

### 2. Weak Topic (`weakTopic`)
- **Source**: All wrong questions for the topic with most errors
- **Identify**: Topic with highest count of incorrect answers
- **Limit**: 20 questions from that topic
- **Purpose**: Focused practice on weakest topic
- **When to use**: To improve in a struggling subject

### 3. Retry Wrong (`retryWrong`)
- **Source**: All wrong questions
- **Sort**: By frequency, then recent
- **Limit**: Up to 20 questions
- **Purpose**: Comprehensive review of all mistakes
- **When to use**: Full revision session covering all weak areas

### 4. Retry Unattempted (`retryUnattempted`)
- **Source**: Questions in wrong-questions with empty selectedAnswer
- **Filter**: Only questions that were skipped
- **Limit**: Up to 20 questions
- **Purpose**: First attempt at questions you skipped
- **When to use**: Building confidence with questions you avoided

---

## Integration with Attempts

### Modified: `src/routes/attempts.js`

When a quiz is submitted, the following happens:

```javascript
// In POST /:id/submit endpoint:

1. Grade the quiz normally
2. Identify wrong answers (incorrect OR unattempted)
3. For each wrong answer:
   - Add to wrong-questions.json via db.addWrongQuestion()
   - Update user's revision state (legacy)
4. Save attempts
5. Sync gamification as usual
```

**New tracking code location:**
- File: `src/routes/attempts.js`
- Function: `router.post('/:id/submit', ...)`
- After: `await db.saveAttempts(attempts);`

---

## Server Integration

### Updated: `server.js`

The revision routes are mounted under `/api/revision`:

```javascript
const revisionRoutes = require('./src/routes/revision');

// Retrieve revision routes mount
app.use('/api/revision', authMiddleware, revisionRoutes);
```

**Protection**: All revision endpoints require authentication (`auth` middleware)

---

## Data Files Created

1. **`data/wrong-questions.json`** - Array of wrong question entries
2. **`data/bookmarks.json`** - Array of bookmark entries

Both files start as empty arrays and grow as users interact with the system.

---

## Usage Flow

### Student Flow

1. **Take Quiz** → `POST /api/attempts` → take quiz
2. **Submit Quiz** → `POST /api/attempts/:id/submit` → wrong answers are automatically tracked
3. **View Revision Dashboard** → `GET /api/revision/sets` → see available revision sets
4. **View Weak Topic** → `GET /api/revision/sets/weakTopic` → see detailed questions
5. **Bookmark Questions** → `POST /api/revision/bookmarks` → save for later
6. **Start Revision Quiz** → `POST /api/revision/sets/:setType/start` → create practice session
7. **Take Revision Quiz** → `POST /api/attempts` → use the returned attempt ID
8. **Submit Revision Quiz** → `POST /api/attempts/:id/submit` → wrong answers tracked again

### Developer Flow

```javascript
// Get user's weak areas
const response = await fetch('/api/revision/sets', {
  credentials: 'include'
});
const { sets, totals } = await response.json();
console.log(`User has ${totals.wrongQuestions} wrong questions`);
console.log(`Weakest topic has ${sets.weakTopic.count} errors`);

// Get questions for weak topic practice
const weakTopicResponse = await fetch('/api/revision/sets/weakTopic', {
  credentials: 'include'
});
const { questions, metadata } = await weakTopicResponse.json();

// Start a revision session
const startResponse = await fetch('/api/revision/sets/weakTopic/start', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' }
});
const { attempt, questions: quizQuestions } = await startResponse.json();
console.log(`Created revision quiz: ${attempt.quizTitle}`);
```

---

## Key Features

✅ **Automatic Tracking**: Wrong answers are automatically recorded on quiz submission
✅ **Scalable**: Uses separate JSON files for better performance with large datasets
✅ **Topic-Based**: Groups questions by topic for focused practice
✅ **Flexible Sets**: Four different revision strategies
✅ **Bookmarks**: Users can save important questions
✅ **Full Integration**: Works seamlessly with existing quiz system
✅ **Auth Protected**: All revision endpoints require authentication
✅ **No UI Changes**: Pure backend implementation

---

## Technical Notes

### Performance Considerations

- **Wrong questions queries**: Filtered by `userId` at database level
- **Revision sets**: Built dynamically on request (no pre-computation)
- **Large datasets**: If a user has 10,000+ wrong questions, consider pagination
- **Bookmarks**: Separate from wrong questions for faster queries

### Data Integrity

- Duplicate prevention**: `addBookmark()` checks if already bookmarked
- Entry IDs: Each entry has unique UUID
- Timestamps: ISO format for consistency
- Topic fallback: Defaults to 'General' if not provided

### Error Handling

- Wrong question tracking doesn't fail quiz submission if it errors
- Missing questions in quiz are safely handled (fullQuestion = null)
- Invalid set types return 400 Bad Request
- Missing user returns 404 Not Found

---

## Future Enhancements

1. **Pagination**: Add pagination to large revision sets
2. **Filters**: Filter revision sets by date range, difficulty
3. **Statistics**: Detailed accuracy metrics by topic
4. **Prioritization**: Smart algorithm to suggest which to revise first
5. **Progress Tracking**: Mark when a question is correctly answered in revision
6. **Export**: Download revision questions as PDF
