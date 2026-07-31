const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');

const jsonDefaults = {
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
  'questions.json': {},
  'quizzes.json': [],
  'resources.json': [],
  'rewards.json': [],
  'users.json': [],
  'wrong-questions.json': []
};

const jsonlFiles = ['contact-submissions.jsonl'];

fs.mkdirSync(dataDir, { recursive: true });

for (const [fileName, initialValue] of Object.entries(jsonDefaults)) {
  const filePath = path.join(dataDir, fileName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${JSON.stringify(initialValue, null, 2)}\n`);
    console.log(`Created ${path.relative(rootDir, filePath)}`);
  }
}

for (const fileName of jsonlFiles) {
  const filePath = path.join(dataDir, fileName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '');
    console.log(`Created ${path.relative(rootDir, filePath)}`);
  }
}

console.log('Local data fallback initialization complete.');
