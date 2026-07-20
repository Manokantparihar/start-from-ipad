const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');

const defaultJsonFiles = {
  'attempts.json': [],
  'bookmarks.json': [],
  'content.json': {
    resources: [],
    maths: [],
    updates: [],
    guides: []
  },
  'courses.json': [],
  'events.json': [],
  'gamification-config.json': [],
  'groups.json': [],
  'lessons.json': [],
  'notification-logs.json': [],
  'notifications.json': [],
  'questions.json': [],
  'quizzes.json': [],
  'resources.json': [],
  'rewards.json': [],
  'users.json': [],
  'wrong-questions.json': []
};

fs.mkdirSync(dataDir, { recursive: true });

for (const [fileName, defaultValue] of Object.entries(defaultJsonFiles)) {
  const filePath = path.join(dataDir, fileName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${JSON.stringify(defaultValue, null, 2)}\n`, 'utf8');
  }
}

console.log('Local data files initialized.');
