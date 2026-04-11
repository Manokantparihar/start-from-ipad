# Revision System - Manual Testing Guide

## Setup & Prerequisites

- ✅ User logged in
- ✅ Browser DevTools available (F12)
- ✅ At least one quiz available
- ✅ Backend running on `http://localhost:3000`

---

## Test 1: Automatic Wrong Question Tracking

### Objective
Verify that wrong answers are automatically tracked when a quiz is submitted.

### Steps

1. **Start a quiz**
   ```bash
   POST /api/attempts
   Body: { "quizId": "quiz-001" }
   ```
   - Note the `attemptId`

2. **Submit wrong answers intentionally**
   ```bash
   POST /api/attempts/{attemptId}/submit
   Body: {
     "answers": [
       { "questionId": "q1", "selected": "Wrong Answer" },
       { "questionId": "q2", "selected": "Also Wrong" }
     ]
   }
   ```
   - Response should show `score` < `total`

3. **Check data/wrong-questions.json**
   ```bash
   # File should now contain entries:
   [
     {
       "userId": "your-user-uuid",
       "questionId": "q1",
       "selectedAnswer": "Wrong Answer",
       "correctAnswer": "...",
       "timestamp": "2026-04-11T..."
     }
   ]
   ```

### Expected Result
✅ Each wrong answer creates a new entry in `wrong-questions.json`
✅ Fields include: userId, questionId, selectedAnswer, correctAnswer, timestamp

---

## Test 2: Get Revision Sets Metadata

### Objective
Verify the revision dashboard shows correct metadata.

### Steps

1. **GET revision sets**
   ```
   GET /api/revision/sets
   ```
   Headers: 
   ```
   Authorization: Bearer {token}
   Content-Type: application/json
   Cookie: connect.sid={sessionid}
   ```

2. **Verify response structure**
   ```json
   {
     "sets": {
       "lastWrong": {
         "type": "lastWrong",
         "label": "Last Wrong",
         "description": "Last 20 incorrect questions",
         "count": 5,
         "icon": "⏱️",
         "color": "blue"
       },
       "weakTopic": {
         "type": "weakTopic",
         "label": "Weak Topic: GK",
         "count": 3,
         "icon": "📉",
         "color": "red"
       },
       "retryWrong": {
         "count": 5,
         "icon": "🔄",
         "color": "orange"
       },
       "retryUnattempted": {
         "count": 0,
         "icon": "⏭️",
         "color": "purple"
       }
     },
     "totals": {
       "wrongQuestions": 5,
       "bookmarked": 0,
       "topicsCovered": 1
     }
   }
   ```

### Expected Result
✅ Shows 4 revision set types (lastWrong, weakTopic, retryWrong, retryUnattempted)
✅ Counts match number of wrong questions
✅ Weak topic correctly identified

---

## Test 3: Get Last Wrong Questions Set

### Objective
Verify the Last Wrong revision set returns correct questions.

### Steps

1. **GET lastWrong set**
   ```
   GET /api/revision/sets/lastWrong
   ```

2. **Verify response**
   - Should return up to 20 questions
   - Sorted by timestamp (most recent first)
   - Include full question details

3. **Sample response**
   ```json
   {
     "set": {
       "type": "lastWrong",
       "description": "Last 20 incorrect questions",
       "count": 5
     },
     "questions": [
       {
         "id": "wrong-q-entry-id",
         "questionId": "q1",
         "topic": "GK",
         "selectedAnswer": "Wrong Answer",
         "correctAnswer": "Correct Answer",
         "timestamp": "2026-04-11T10:30:00.000Z",
         "fullQuestion": {
           "id": "q1",
           "question": "What is India's capital?",
           "options": ["Mumbai", "Delhi", "Jaipur", "Bangalore"],
           "correctAnswer": "Delhi",
           "explanation": "New Delhi is the capital of India",
           "topic": "GK",
           "difficulty": "easy"
         }
       }
     ]
   }
   ```

### Expected Result
✅ Returns questions sorted by recency
✅ Full question details included
✅ Users can see what they answered vs correct answer

---

## Test 4: Get Weak Topic Set

### Objective
Verify weak topic is correctly identified and returned.

### Steps

1. **GET weakTopic set**
   ```
   GET /api/revision/sets/weakTopic
   ```

2. **Analyze response**
   - Should show the topic with most wrong answers
   - Return only questions from that topic
   - Max 20 questions

3. **Expected behavior**
   - If user has 3 wrong in Math and 2 wrong in Science → weakTopic is Math
   - Returns 3 Math questions with full details

### Expected Result
✅ Correctly identifies topic with most errors
✅ Returns only questions from that topic
✅ Provides full question details for practice

---

## Test 5: Bookmark a Question

### Objective
Verify questions can be bookmarked for later review.

### Steps

1. **Bookmark a question**
   ```
   POST /api/revision/bookmarks
   Body: {
     "questionId": "q1",
     "quizId": "quiz-001",
     "topic": "GK"
   }
   ```

2. **Verify response**
   ```json
   {
     "bookmarked": true,
     "bookmark": {
       "id": "bookmark-uuid",
       "userId": "user-uuid",
       "questionId": "q1",
       "quizId": "quiz-001",
       "topic": "GK",
       "timestamp": "2026-04-11T10:30:00.000Z"
     }
   }
   ```

3. **Check data/bookmarks.json**
   ```bash
   # Should contain the new bookmark entry
   ```

4. **Try bookmarking the same question again**
   - Should return 200 (already bookmarked, no duplicate)

### Expected Result
✅ Question is bookmarked
✅ Duplicate bookmarks are prevented
✅ Entry created in bookmarks.json

---

## Test 6: Get All Bookmarks

### Objective
Verify user can retrieve all bookmarked questions.

### Steps

1. **Bookmark 2-3 questions**
   ```
   POST /api/revision/bookmarks
   Body: { "questionId": "q1", ... }
   POST /api/revision/bookmarks
   Body: { "questionId": "q2", ... }
   ```

2. **GET all bookmarks**
   ```
   GET /api/revision/bookmarks
   ```

3. **Verify response**
   ```json
   {
     "count": 2,
     "bookmarks": [
       {
         "id": "bookmark-uuid",
         "questionId": "q1",
         "topic": "GK",
         "bookmarkedAt": "2026-04-11T10:30:00.000Z",
         "fullQuestion": {
           "id": "q1",
           "question": "...",
           "options": [...],
           "correctAnswer": "...",
           "explanation": "...",
           "topic": "GK",
           "difficulty": "easy"
         }
       }
     ]
   }
   ```

### Expected Result
✅ All bookmarked questions are returned
✅ Full question details included
✅ Count is accurate

---

## Test 7: Remove Bookmark

### Objective
Verify bookmarks can be removed.

### Steps

1. **Remove a bookmark**
   ```
   DELETE /api/revision/bookmarks/q1
   ```

2. **Verify response**
   ```json
   { "removed": true }
   ```

3. **GET bookmarks again**
   - Removed question should not appear in list
   - Count should decrease

### Expected Result
✅ Bookmark is deleted from bookmarks.json
✅ GET /api/revision/bookmarks reflects the change
✅ Same question can be bookmarked again later

---

## Test 8: Check Bookmark Status

### Objective
Verify ability to check if a question is bookmarked.

### Steps

1. **Check if bookmarked (not bookmarked)**
   ```
   GET /api/revision/bookmarks/check/q1
   ```
   Response:
   ```json
   { "isBookmarked": false }
   ```

2. **Bookmark it**
   ```
   POST /api/revision/bookmarks
   Body: { "questionId": "q1", ... }
   ```

3. **Check again**
   ```
   GET /api/revision/bookmarks/check/q1
   ```
   Response:
   ```json
   { "isBookmarked": true }
   ```

### Expected Result
✅ Correctly returns bookmark status
✅ Updates after bookmark creation/deletion

---

## Test 9: Start Revision Quiz - Last Wrong

### Objective
Verify revision quiz session can be created from Last Wrong set.

### Steps

1. **Start revision quiz**
   ```
   POST /api/revision/sets/lastWrong/start
   ```

2. **Verify response**
   ```json
   {
     "attempt": {
       "id": "new-attempt-uuid",
       "quizId": "revision-lastWrong",
       "quizTitle": "Revision: Last 20 incorrect questions",
       "timeLimit": 10,
       "startedAt": 1712900400000,
       "expiresAt": 1712901000000,
       "revisionSetType": "lastWrong"
     },
     "questions": [
       {
         "id": "q1",
         "text": "What is India's capital?",
         "topic": "GK",
         "options": ["Mumbai", "Delhi", "Jaipur", "Bangalore"],
         "explanation": "New Delhi is the capital of India"
       }
     ]
   }
   ```

3. **Verify in attempts.json**
   - New attempt created with status "in-progress"
   - Questions list includes revision questions
   - Attempt has time limit calculated (1 min per 2 questions, min 5 min)

4. **Use the attempt ID to submit**
   ```
   POST /api/attempts/{new-attempt-uuid}/submit
   Body: { "answers": [...] }
   ```
   - Should work like normal quiz submission
   - Wrong answers tracked again

### Expected Result
✅ Revision quiz session created successfully
✅ Correct questions from revision set included
✅ Time limit calculated appropriately
✅ Can be submitted and tracked normally

---

## Test 10: Start Revision Quiz - Weak Topic

### Objective
Verify weak topic revision quiz creation.

### Steps

1. **Start weakTopic revision**
   ```
   POST /api/revision/sets/weakTopic/start
   ```

2. **Verify only weak topic questions**
   - All returned questions should be from weakest topic
   - Questions limited to 20
   - Full details included

### Expected Result
✅ Contains only weak topic questions
✅ Cannot start if no weak topic identified
✅ Time limit appropriate for question count

---

## Test 11: Start Revision Quiz - All Invalid Types

### Objective
Verify error handling for invalid set types.

### Steps

1. **Try invalid set type**
   ```
   GET /api/revision/sets/invalidType
   ```
   Response: `400 Bad Request`

2. **Try invalid start**
   ```
   POST /api/revision/sets/fakeType/start
   ```
   Response: `400 Bad Request`

### Expected Result
✅ Returns 400 Bad Request for invalid types
✅ Returns helpful error message

---

## Test 12: Cannot Start Empty Set

### Objective
Verify error when trying to start revision with no questions.

### Steps

1. **Fresh user with no wrong answers**
2. **Try to start revision**
   ```
   POST /api/revision/sets/lastWrong/start
   ```
   Response: `400 Bad Request`
   ```json
   { "error": "No questions available for this revision set" }
   ```

### Expected Result
✅ Cannot start empty revision set
✅ Returns helpful error message

---

## Test 13: Topic Accuracy Calculation

### Objective
Verify topics are grouped correctly.

### Steps

1. **Create errors in multiple topics**
   - Answer 3 wrong in Topic A
   - Answer 2 wrong in Topic B
   - Answer 1 wrong in Topic C

2. **GET /api/revision/sets**
   - Verify weakTopic shows Topic A
   - Verify topicsCovered = 3

3. **GET /api/revision/sets/weakTopic**
   - Should return 3 questions from Topic A

### Expected Result
✅ Weak topic correctly identified
✅ Topics grouped accurately
✅ Counts match actual wrong answers

---

## Test 14: Unattempted Questions Tracking

### Objective
Verify questions that were skipped are tracked.

### Steps

1. **Start a quiz**
   ```
   POST /api/attempts
   ```

2. **Submit with skipped questions**
   ```
   POST /api/attempts/{attemptId}/submit
   Body: {
     "answers": [
       { "questionId": "q1", "selected": "Answer" },
       { "questionId": "q2", "selected": "" }  // Skipped
       // q3 not in answers array - also skipped
     ]
   }
   ```

3. **GET /api/revision/sets**
   - `retryUnattempted.count` should be > 0

4. **GET /api/revision/sets/retryUnattempted**
   - Should return only skipped questions
   - No selectedAnswer, just empty string or null

### Expected Result
✅ Skipped questions are identified
✅ Separated into retryUnattempted set
✅ Can practice answering them

---

## Test 15: Multiple Quizzes, Same Question

### Objective
Verify handling when same question appears in multiple quizzes.

### Steps

1. **Take Quiz A, answer q1 wrong**
2. **Later, take Quiz B that also has q1, answer wrong again**
3. **GET /api/revision/sets/lastWrong**
   - Should show q1 twice (two entries in wrong-questions.json)
   - OR group them (depending on implementation)

### Expected Result
✅ Multiple wrong instances are tracked
✅ Latest timestamp is used for sorting
✅ User can see pattern of repeated mistakes

---

## Browser DevTools Testing

### Open DevTools (F12) and test APIs directly:

```javascript
// Test 1: Get revision sets
fetch('/api/revision/sets', {
  credentials: 'include'
})
  .then(r => r.json())
  .then(data => console.log(data))

// Test 2: Bookmark a question
fetch('/api/revision/bookmarks', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    questionId: 'q1',
    quizId: 'quiz-001',
    topic: 'GK'
  })
})
  .then(r => r.json())
  .then(data => console.log(data))

// Test 3: Get weak topic
fetch('/api/revision/sets/weakTopic', {
  credentials: 'include'
})
  .then(r => r.json())
  .then(data => console.log('Questions:', data.questions.length))

// Test 4: Start revision quiz
fetch('/api/revision/sets/lastWrong/start', {
  method: 'POST',
  credentials: 'include'
})
  .then(r => r.json())
  .then(data => console.log('Attempt:', data.attempt.id, 'Questions:', data.questions.length))
```

---

## Database File Verification

### Check data/wrong-questions.json

```bash
# Should grow after each quiz submission with wrong answers
cat data/wrong-questions.json | jq '.[0]'

# Output example:
{
  "id": "uuid",
  "userId": "user-uuid",
  "questionId": "q1",
  "quizId": "quiz-001",
  "topic": "GK",
  "selectedAnswer": "Wrong",
  "correctAnswer": "Correct",
  "timestamp": "2026-04-11T10:30:00.000Z"
}
```

### Check data/bookmarks.json

```bash
# Should grow when bookmarks are added
cat data/bookmarks.json | jq 'length'
# Should return count of bookmarks
```

---

## Troubleshooting

### Issue: "No questions available"
- **Cause**: User has no wrong questions yet
- **Fix**: Take a quiz, answer some questions wrong, submit
- **Verify**: Check data/wrong-questions.json has entries

### Issue: Empty bookmarks displayed
- **Cause**: Bookmarks weren't added
- **Fix**: Use POST /api/revision/bookmarks first
- **Verify**: Check data/bookmarks.json has entries

### Issue: Wrong topic not identified
- **Cause**: Questions don't have topic field set
- **Fix**: Ensure questions in quizzes have `topic` property
- **Verify**: GET /api/revision/sets shows weakTopic with count > 0

### Issue: Questions missing full details
- **Cause**: Question is in wrong-questions.json but not in any quiz
- **Fix**: Question was deleted from quizzes
- **Workaround**: fullQuestion is null, show basic info from wrong-questions entry

---

## Success Criteria

All tests passed when:

✅ Wrong answers automatically tracked after quiz submission
✅ All 4 revision sets return appropriate questions
✅ Bookmarks can be added, removed, and listed
✅ Revision quiz sessions can be created and taken
✅ Topic accuracy is calculated correctly
✅ Unattempted questions are identified
✅ Data persists in JSON files
✅ No errors in browser console
✅ All API responses have proper structure
✅ Authentication is enforced on all endpoints
