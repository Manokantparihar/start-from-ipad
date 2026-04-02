// QuizEngine Module - Handles quiz logic, timer, and scoring
const QuizEngine = (() => {
  let currentQuiz = null;
  let currentQuestionIndex = 0;
  let userAnswers = [];
  let startTime = null;
  let timerInterval = null;

  const startQuiz = (questions, config = {}) => {
    currentQuiz = {
      questions: questions,
      type: config.type || 'topicwise',
      topic: config.topic || null,
      timeLimit: config.timeLimit || null, // in seconds
      title: config.title || 'Quiz'
    };

    currentQuestionIndex = 0;
    userAnswers = Array(questions.length).fill(null);
    startTime = Date.now();

    console.log('✓ Quiz started:', {
      type: currentQuiz.type,
      questionCount: questions.length,
      timeLimit: currentQuiz.timeLimit
    });

    return getCurrentQuestion();
  };

  const getCurrentQuestion = () => {
    if (!currentQuiz || currentQuestionIndex >= currentQuiz.questions.length) {
      return null;
    }
    return currentQuiz.questions[currentQuestionIndex];
  };

  const getCurrentQuestionIndex = () => currentQuestionIndex;

  const getTotalQuestions = () => currentQuiz ? currentQuiz.questions.length : 0;

  const recordAnswer = (optionIndex) => {
    if (!currentQuiz || currentQuestionIndex >= currentQuiz.questions.length) {
      return false;
    }
    userAnswers[currentQuestionIndex] = optionIndex;
    return true;
  };

  const nextQuestion = () => {
    if (!currentQuiz || currentQuestionIndex >= currentQuiz.questions.length - 1) {
      return false;
    }
    currentQuestionIndex++;
    return true;
  };

  const previousQuestion = () => {
    if (!currentQuiz || currentQuestionIndex <= 0) {
      return false;
    }
    currentQuestionIndex--;
    return true;
  };

  const goToQuestion = (index) => {
    if (!currentQuiz || index < 0 || index >= currentQuiz.questions.length) {
      return false;
    }
    currentQuestionIndex = index;
    return true;
  };

  const getProgress = () => {
    if (!currentQuiz) return { current: 0, total: 0, percentage: 0 };
    const answeredCount = userAnswers.filter(ans => ans !== null).length;
    return {
      current: currentQuestionIndex + 1,
      total: currentQuiz.questions.length,
      answered: answeredCount,
      percentage: Math.round((answeredCount / currentQuiz.questions.length) * 100)
    };
  };

  const endQuiz = () => {
    if (timerInterval) clearInterval(timerInterval);

    if (!currentQuiz) return null;

    const timeSpent = Math.floor((Date.now() - startTime) / 1000);
    const results = calculateResults();

    const quizResult = {
      type: currentQuiz.type,
      topic: currentQuiz.topic,
      totalQuestions: currentQuiz.questions.length,
      correctAnswers: results.correctCount,
      score: results.percentage,
      timeSpent: timeSpent,
      answers: buildAnswerDetails(),
      incorrectQuestions: results.incorrectQuestions
    };

    ProgressTracker.recordQuiz(quizResult);

    currentQuiz = null;
    currentQuestionIndex = 0;
    userAnswers = [];
    startTime = null;

    return quizResult;
  };

  const calculateResults = () => {
    if (!currentQuiz) return null;

    let correctCount = 0;
    const incorrectQuestions = [];

    currentQuiz.questions.forEach((question, index) => {
      const userAnswer = userAnswers[index];
      const isCorrect = userAnswer === question.correctAnswer;

      if (isCorrect) {
        correctCount++;
      } else if (userAnswer !== null) {
        incorrectQuestions.push(question.id);
      }
    });

    const percentage = Math.round((correctCount / currentQuiz.questions.length) * 100);

    return {
      correctCount,
      percentage,
      incorrectQuestions
    };
  };

  const buildAnswerDetails = () => {
    if (!currentQuiz) return [];

    return currentQuiz.questions.map((question, index) => ({
      questionId: question.id,
      userAnswer: userAnswers[index],
      correctAnswer: question.correctAnswer,
      isCorrect: userAnswers[index] === question.correctAnswer,
      question: question.question,
      explanation: question.explanation || ''
    }));
  };

  const startTimer = (callback) => {
    if (!currentQuiz || !currentQuiz.timeLimit) return;

    let remainingTime = currentQuiz.timeLimit;

    timerInterval = setInterval(() => {
      remainingTime--;

      if (callback) {
        callback(remainingTime);
      }

      if (remainingTime <= 0) {
        clearInterval(timerInterval);
        endQuiz();
        if (callback) callback(-1);
      }
    }, 1000);
  };

  const stopTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  };

  return {
    startQuiz,
    getCurrentQuestion,
    getCurrentQuestionIndex,
    getTotalQuestions,
    recordAnswer,
    nextQuestion,
    previousQuestion,
    goToQuestion,
    getProgress,
    endQuiz,
    calculateResults,
    buildAnswerDetails,
    startTimer,
    stopTimer
  };
})();
