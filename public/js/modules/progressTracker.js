// ProgressTracker Module - Stores and retrieves quiz history and performance data
const ProgressTracker = (() => {
  const PROGRESS_KEY = 'rpsc_progress';

  const defaultProgress = {
    quizzes: [],
    stats: {
      totalAttempts: 0,
      totalScore: 0,
      averageScore: 0,
      topicPerformance: {}
    }
  };

  const getProgress = () => {
    const stored = localStorage.getItem(PROGRESS_KEY);
    try {
      return stored ? JSON.parse(stored) : { ...defaultProgress };
    } catch {
      return { ...defaultProgress };
    }
  };

  const recordQuiz = (quizData) => {
    const progress = getProgress();
    const quiz = {
      id: `quiz_${Date.now()}`,
      date: new Date().toISOString(),
      type: quizData.type, // 'daily', 'topicwise', 'mock'
      topic: quizData.topic || null,
      totalQuestions: quizData.totalQuestions,
      correctAnswers: quizData.correctAnswers,
      score: quizData.score, // percentage
      timeSpent: quizData.timeSpent, // in seconds
      answers: quizData.answers, // array of answer objects
      incorrectQuestions: quizData.incorrectQuestions // array of question ids
    };

    progress.quizzes.push(quiz);
    updateStats(progress);
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));

    console.log('✓ Quiz recorded:', quiz.id);
    return quiz;
  };

  const updateStats = (progress) => {
    if (progress.quizzes.length === 0) {
      progress.stats = { ...defaultProgress.stats };
      return;
    }

    progress.stats.totalAttempts = progress.quizzes.length;
    progress.stats.totalScore = progress.quizzes.reduce((sum, q) => sum + q.score, 0);
    progress.stats.averageScore = Math.round(progress.stats.totalScore / progress.quizzes.length);

    // Topic-wise performance
    progress.stats.topicPerformance = {};
    progress.quizzes.forEach(quiz => {
      if (quiz.topic) {
        if (!progress.stats.topicPerformance[quiz.topic]) {
          progress.stats.topicPerformance[quiz.topic] = { attempts: 0, totalScore: 0, avgScore: 0 };
        }
        progress.stats.topicPerformance[quiz.topic].attempts += 1;
        progress.stats.topicPerformance[quiz.topic].totalScore += quiz.score;
        progress.stats.topicPerformance[quiz.topic].avgScore = 
          Math.round(progress.stats.topicPerformance[quiz.topic].totalScore / progress.stats.topicPerformance[quiz.topic].attempts);
      }
    });
  };

  const getStats = () => {
    return getProgress().stats;
  };

  const getQuizHistory = (limit = null) => {
    const progress = getProgress();
    let quizzes = progress.quizzes.sort((a, b) => new Date(b.date) - new Date(a.date));
    return limit ? quizzes.slice(0, limit) : quizzes;
  };

  const getWeakTopics = (topN = 3) => {
    const stats = getStats();
    const topics = Object.entries(stats.topicPerformance)
      .sort((a, b) => a[1].avgScore - b[1].avgScore)
      .slice(0, topN);
    return topics;
  };

  const getIncorrectQuestions = (quizId) => {
    const progress = getProgress();
    const quiz = progress.quizzes.find(q => q.id === quizId);
    return quiz ? quiz.incorrectQuestions : [];
  };

  const clearAllProgress = () => {
    localStorage.removeItem(PROGRESS_KEY);
    console.log('✓ All progress cleared');
  };

  return {
    getProgress,
    recordQuiz,
    getStats,
    getQuizHistory,
    getWeakTopics,
    getIncorrectQuestions,
    clearAllProgress
  };
})();
