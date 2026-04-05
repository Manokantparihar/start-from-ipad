// QuestionBank Module - Manages all question data and retrieval
const QuestionBank = (() => {
  let questions = [];
  let topics = [];

  const init = async () => {
    try {
      const response = await fetch('/data/questions.json');
      const data = await response.json();
      questions = data.questions || [];
      topics = data.topics || [];
      console.log('✓ Question bank loaded:', questions.length, 'questions');
    } catch (error) {
      console.error('✗ Failed to load question bank:', error);
    }
  };

  const getRandomQuestions = (count = 10, topicFilter = null) => {
    let filtered = questions;
    
    if (topicFilter) {
      filtered = questions.filter(q => q.topic === topicFilter);
    }

    if (filtered.length === 0) {
      console.warn('No questions found for topic:', topicFilter);
      return [];
    }

    // Fisher-Yates shuffle
    const shuffled = [...filtered];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, Math.min(count, filtered.length));
  };

  const getQuestionById = (id) => questions.find(q => q.id === id);

  const getQuestionsByTopic = (topic) => questions.filter(q => q.topic === topic);

  const getTopics = () => topics;

  const getAllQuestions = () => [...questions];

  const addQuestion = (question) => {
    // Validate required fields
    const required = ['id', 'question', 'options', 'correctAnswer', 'topic', 'subtopic', 'difficulty'];
    const valid = required.every(field => question[field] !== undefined);
    
    if (!valid) {
      throw new Error(`Missing required fields. Expected: ${required.join(', ')}`);
    }

    if (!Array.isArray(question.options) || question.options.length < 2) {
      throw new Error('Options must be an array with at least 2 items');
    }

    if (questions.some(q => q.id === question.id)) {
      throw new Error(`Question ID already exists: ${question.id}`);
    }

    questions.push(question);
    return question;
  };

  const updateQuestion = (id, updatedData) => {
    const index = questions.findIndex(q => q.id === id);
    if (index === -1) throw new Error(`Question not found: ${id}`);
    questions[index] = { ...questions[index], ...updatedData };
    return questions[index];
  };

  const deleteQuestion = (id) => {
    questions = questions.filter(q => q.id !== id);
  };

  return {
    init,
    getRandomQuestions,
    getQuestionById,
    getQuestionsByTopic,
    getTopics,
    getAllQuestions,
    addQuestion,
    updateQuestion,
    deleteQuestion
  };
})();
