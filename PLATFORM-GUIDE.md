# RPSC/REET Exam Preparation Platform

A modern, interactive test-based learning platform built with vanilla JavaScript and Tailwind CSS for RPSC/REET exam preparation.

## 🎯 Features

### 1. **Daily Quiz** (`daily-quiz.html`)
- 15 random questions from all topics
- No time limit – learn at your own pace
- Immediate answer feedback with explanations
- Progress tracking and score calculation
- Answer review after submission

### 2. **Topic-wise Tests** (`topic-tests.html`)
- Choose from available topics (भूगोल, इतिहास, etc.)
- Focused practice on specific subjects
- Adaptive question count based on topic availability
- Performance metrics for weak topic identification

### 3. **Full Mock Tests** (`mock-tests.html`)
- Complete exam simulations (50 questions, 3 hours)
- Quick tests (30 questions, 90 minutes)
- Real-time countdown timer
- Question navigator for quick jumping
- Detailed result analysis with answer key

### 4. **Progress Dashboard** (`dashboard.html`)
- User authentication with localStorage
- Performance statistics:
  - Total quizzes attempted
  - Average score
  - Total study time
  - Weak topics identification
- Recent quiz history

### 5. **Admin Panel** (`admin.html`)
- Add/Edit/Delete questions
- Bulk import/export via JSON
- Question validation
- Topic and difficulty management

## 📁 Project Structure

```
start-from-ipad/
├── data/
│   └── questions.json          # Question bank with 10+ sample questions
├── js/
│   └── modules/
│       ├── questionBank.js     # Question data management
│       ├── user.js             # User authentication (localStorage)
│       ├── progressTracker.js  # Quiz history & performance stats
│       ├── quizEngine.js       # Quiz logic & timer management
│       └── ui.js               # Common UI utilities & formatters
├── dashboard.html              # Main dashboard
├── daily-quiz.html             # Daily quiz interface
├── topic-tests.html            # Topic selection & testing
├── mock-tests.html             # Full mock test with timer
├── admin.html                  # Question management
├── index.html                  # Old homepage (still available)
├── package.json                # Updated with Tailwind CSS
├── server.js                   # Node.js server
└── README.md                   # This file
```

## 🚀 Quick Start

### Installation
```bash
npm install
```

### Run Development Server
```bash
npm run start
# or
npm run dev
```

Server runs on `http://localhost:5500`

### Access Points
- **Dashboard/Learning Hub:** `http://localhost:5500/dashboard.html`
- **Daily Quiz:** `http://localhost:5500/daily-quiz.html`
- **Topic Tests:** `http://localhost:5500/topic-tests.html`
- **Mock Tests:** `http://localhost:5500/mock-tests.html`
- **Admin Panel:** `http://localhost:5500/admin.html`

## 📊 Data Structure

### Question Object
```javascript
{
  "id": "q001",                    // Unique identifier
  "question": "प्रश्न का पाठ",     // Question text (supports Hindi)
  "options": [
    "विकल्प 1",
    "विकल्प 2",
    "विकल्प 3",
    "विकल्प 4"
  ],
  "correctAnswer": 0,               // Index of correct option (0-3)
  "topic": "भूगोल",                 // Topic name
  "subtopic": "राजस्थान के जिले",  // Subtopic
  "difficulty": "easy",             // "easy" | "medium" | "hard"
  "explanation": "सही उत्तर की व्याख्या"  // Optional
}
```

### User Object (localStorage: `rpsc_user`)
```javascript
{
  "id": "user_1704067200000",
  "name": "Raj Kumar",
  "email": "raj@example.com",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "lastLogin": "2024-01-02T10:30:00.000Z"
}
```

### Progress Record (localStorage: `rpsc_progress`)
```javascript
{
  "quizzes": [
    {
      "id": "quiz_1704067200000",
      "date": "2024-01-02T10:30:00.000Z",
      "type": "daily",              // "daily" | "topicwise" | "mock"
      "topic": "भूगोल",             // null for daily quizzes
      "totalQuestions": 15,
      "correctAnswers": 12,
      "score": 80,                  // Percentage
      "timeSpent": 600,             // Seconds
      "answers": [...],             // Answer details
      "incorrectQuestions": ["q003", "q005"]  // Failed question IDs
    }
  ],
  "stats": {
    "totalAttempts": 10,
    "totalScore": 750,
    "averageScore": 75,
    "topicPerformance": {
      "भूगोल": { "attempts": 5, "totalScore": 400, "avgScore": 80 },
      "इतिहास": { "attempts": 5, "totalScore": 350, "avgScore": 70 }
    }
  }
}
```

## 🧩 Module Documentation

### QuestionBank (`js/modules/questionBank.js`)
Manages all question data and provides filtering/retrieval methods.

**Key Methods:**
- `init()` – Load questions from `/data/questions.json`
- `getRandomQuestions(count, topicFilter)` – Fisher-Yates shuffled questions
- `getQuestionsByTopic(topic)` – Filter by topic
- `getTopics()` – Get all available topics
- `addQuestion(question)` – Add new question with validation
- `updateQuestion(id, data)` – Update existing question
- `deleteQuestion(id)` – Remove question

**Usage:**
```javascript
await QuestionBank.init();
const dailyQuestions = QuestionBank.getRandomQuestions(15);
const historyQuestions = QuestionBank.getQuestionsByTopic('इतिहास');
```

### User (`js/modules/user.js`)
Handles user authentication and profile management with localStorage.

**Key Methods:**
- `login(userData)` – Create/update user session
- `logout()` – Clear session
- `getUser()` – Get current user data
- `isLoggedIn()` – Check if user is authenticated
- `updateProfile(updates)` – Update user info

**Usage:**
```javascript
User.login({ name: 'Raj', email: 'raj@example.com' });
if (User.isLoggedIn()) {
  const user = User.getUser();
  console.log(user.name);
}
```

### ProgressTracker (`js/modules/progressTracker.js`)
Records and analyzes quiz performance and generates insights.

**Key Methods:**
- `recordQuiz(quizData)` – Save quiz results
- `getStats()` – Get overall performance stats
- `getQuizHistory(limit)` – Get recent quizzes
- `getWeakTopics(topN)` – Get lowest-performing topics
- `getIncorrectQuestions(quizId)` – Get failed questions from a quiz
- `clearAllProgress()` – Reset all data

**Usage:**
```javascript
const result = { ... };
ProgressTracker.recordQuiz(result);

const stats = ProgressTracker.getStats();
console.log(stats.averageScore);  // 75

const weak = ProgressTracker.getWeakTopics(3);
// [['भूगोल', { avgScore: 65, ... }], ...]
```

### QuizEngine (`js/modules/quizEngine.js`)
Core quiz logic: question navigation, timer, scoring, and results.

**Key Methods:**
- `startQuiz(questions, config)` – Begin a quiz session
- `getCurrentQuestion()` – Get current question object
- `recordAnswer(optionIndex)` – Save user's answer
- `nextQuestion()` / `previousQuestion()` / `goToQuestion(index)` – Navigation
- `getProgress()` – Get quiz progress percentage
- `endQuiz()` – Submit quiz and calculate results
- `calculateResults()` – Get scoring breakdown
- `startTimer(callback)` – Start countdown
- `stopTimer()` – Stop countdown

**Usage:**
```javascript
QuizEngine.startQuiz(questions, { type: 'daily', timeLimit: null });

while (quiz not finished) {
  const q = QuizEngine.getCurrentQuestion();
  // Display question
  QuizEngine.recordAnswer(userChoice);
  QuizEngine.nextQuestion();
}

const result = QuizEngine.endQuiz();
// result = { score: 80, correctAnswers: 12, timeSpent: 600, ... }
```

### UI (`js/modules/ui.js`)
Common UI utilities, formatters, and component renderers.

**Key Methods:**
- `formatTime(seconds)` – Convert seconds to "MM:SS" or "HH:MM:SS"
- `formatDate(isoString)` – Format date to "Jan 1, 2024, 10:30 AM"
- `showNotification(message, type)` – Toast notification
- `showModal(config)` – Modal dialog
- `renderQuestionCard(question, index, total)` – Question UI component
- `renderResult(result)` – Result display with score circle

## 🔐 User Authentication

The platform uses **localStorage-based authentication** (suitable for development/internal use):

1. **First Visit:** User sees login modal on dashboard
2. **Login:** Name + Email stored in `localStorage['rpsc_user']`
3. **Session:** `sessionStorage` tracks active session
4. **Logout:** Clears session and localStorage

⚠️ **For Production:** Integrate with proper backend auth (Firebase, JWT, OAuth, etc.)

## 📝 Adding Questions

### Method 1: Admin Panel
1. Go to `http://localhost:5500/admin.html`
2. Click "Add Question" tab
3. Fill in all fields
4. Click "Add Question"

### Method 2: Bulk Import (JSON)
```json
{
  "questions": [
    {
      "id": "q011",
      "question": "Your question here",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": 0,
      "topic": "भूगोल",
      "subtopic": "Your subtopic",
      "difficulty": "medium",
      "explanation": "Why this is correct..."
    }
  ]
}
```

1. Prepare JSON file
2. Go to Admin Panel → "Import/Export"
3. Upload JSON file

### Method 3: Direct JSON Edit
Edit `/data/questions.json` and reload the app.

## 🎨 UI & Theming

### Colors Used
- **Primary:** Blue (`#2563eb`)
- **Success:** Green (`#16a34a`)
- **Danger:** Red (`#dc2626`)
- **Warning:** Yellow (`#ca8a04`)
- **Neutral:** Gray (`#6b7280`)

### Responsive Design
- Mobile-first approach
- Tailwind CSS utilities
- Breakpoints: `sm`, `md`, `lg`

### Accessibility
- Semantic HTML
- Proper label associations
- Keyboard navigation support
- ARIA attributes where needed

## 🚀 Performance Optimizations

1. **Lazy Module Loading** – Scripts load only when needed
2. **LocalStorage Caching** – User data stays local
3. **Fisher-Yates Shuffle** – O(n) random question selection
4. **Minimal Reflows** – Batch DOM updates

## 🐛 Troubleshooting

### Questions not loading
- Check `/data/questions.json` exists and has valid JSON
- Open browser console for errors
- Verify QuestionBank.init() is called

### Progress not saving
- Enable browser localStorage
- Check if user is logged in first
- Clear cache if stale data appears

### Timer not working
- Ensure QuizEngine.startTimer() is called
- Check if browser supports setInterval

## 📱 Browser Support
- Chrome/Chromium: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- Edge: ✅ Full support
- IE11: ❌ Not supported

## 🔄 Future Enhancements

- [ ] Previous year papers & solutions
- [ ] Video explanations
- [ ] Community discussion forum
- [ ] Peer comparison (anonymous)
- [ ] AI-powered question recommendations
- [ ] Export results as PDF
- [ ] Mobile app (React Native/Flutter)
- [ ] Backend integration for multi-device sync
- [ ] Teacher dashboard
- [ ] Certification tracks

## 📄 License
MIT License

## 🤝 Contributing
1. Fork repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

---

**Last Updated:** January 2, 2024  
**Platform Version:** 2.0 (Test-Based Learning Platform)
