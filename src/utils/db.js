const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');

// Generic read
async function readFile(filename) {
  try {
    const filePath = path.join(DATA_DIR, `${filename}.json`);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data || '[]');
  } catch (error) {
    return [];
  }
}

// Generic write
async function writeFile(filename, data) {
  const filePath = path.join(DATA_DIR, `${filename}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// USERS
const getUsers = () => readFile('users');
const saveUsers = (users) => writeFile('users', users);

// ATTEMPTS
const getAttempts = () => readFile('attempts');
const saveAttempts = (attempts) => writeFile('attempts', attempts);

// QUIZZES
const getQuizzes = () => readFile('quizzes');
const saveQuizzes = (quizzes) => writeFile('quizzes', quizzes);

module.exports = {
  getUsers,
  saveUsers,
  getAttempts,
  saveAttempts,
  getQuizzes,
  saveQuizzes
};