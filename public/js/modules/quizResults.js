// QuizResults Module - Renders production-style quiz result experiences
const QuizResults = (() => {
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTime(seconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  function clampPercentage(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  }

  function signedLabel(value, suffix = '') {
    const amount = Number(value) || 0;
    const sign = amount > 0 ? '+' : '';
    return `${sign}${amount}${suffix}`;
  }

  function formatScore(value, totalQuestions) {
    const score = Number(value) || 0;
    const total = Math.max(0, Number(totalQuestions) || 0);
    return total > 0 ? `${score}/${total}` : String(score);
  }

  function themeForPercentage(percentage) {
    if (percentage >= 80) {
      return {
        accent: 'from-emerald-500 via-emerald-600 to-teal-600',
        text: 'text-emerald-600',
        border: 'border-emerald-200',
        soft: 'bg-emerald-50'
      };
    }

    if (percentage >= 50) {
      return {
        accent: 'from-amber-500 via-yellow-500 to-orange-500',
        text: 'text-amber-600',
        border: 'border-amber-200',
        soft: 'bg-amber-50'
      };
    }

    return {
      accent: 'from-rose-500 via-red-500 to-orange-500',
      text: 'text-rose-600',
      border: 'border-rose-200',
      soft: 'bg-rose-50'
    };
  }

  function metricCard(label, value, sublabel, accentClass) {
    return `
      <div class="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
        <div class="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">${escapeHtml(label)}</div>
        <div class="mt-2 text-2xl font-black text-white ${accentClass || ''}">${escapeHtml(value)}</div>
        ${sublabel ? `<div class="mt-1 text-xs text-white/70">${escapeHtml(sublabel)}</div>` : ''}
      </div>
    `;
  }

  function deltaPill(value, suffix = '') {
    const amount = Number(value) || 0;
    const tone = amount > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : amount < 0 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-600 border-slate-200';
    return `<span class="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}">${escapeHtml(signedLabel(amount, suffix))}</span>`;
  }

  function renderTopicRow(topic) {
    const accuracy = clampPercentage(topic.accuracy);
    const ratio = Math.max(0, Math.min(100, accuracy));
    return `
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div class="text-sm font-semibold text-slate-900">${escapeHtml(topic.topic || 'General')}</div>
            <div class="mt-1 text-xs text-slate-500">${topic.questionCount || 0} question${Number(topic.questionCount || 0) === 1 ? '' : 's'}</div>
          </div>
          <div class="text-right">
            <div class="text-lg font-black text-slate-900">${accuracy}%</div>
            <div class="text-xs text-slate-500">Accuracy</div>
          </div>
        </div>
        <div class="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div class="h-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" style="width:${ratio}%"></div>
        </div>
        <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div class="rounded-lg bg-emerald-50 px-2 py-1.5 text-center text-emerald-700">${topic.correct || 0} correct</div>
          <div class="rounded-lg bg-rose-50 px-2 py-1.5 text-center text-rose-700">${topic.incorrect || 0} wrong</div>
          <div class="rounded-lg bg-slate-50 px-2 py-1.5 text-center text-slate-600">${topic.unattempted || 0} skipped</div>
        </div>
      </div>
    `;
  }

  function renderReviewItem(item, index) {
    const isCorrect = !!item.isCorrect;
    const borderTone = isCorrect ? 'border-emerald-200 bg-emerald-50/60' : 'border-rose-200 bg-rose-50/60';
    const statusTone = isCorrect ? 'text-emerald-700 bg-emerald-100 border-emerald-200' : 'text-rose-700 bg-rose-100 border-rose-200';
    const options = Array.isArray(item.options) ? item.options : [];
    const selectedText = item.isAttempted ? item.selectedText || item.selected || 'Not answered' : 'Not answered';
    const correctText = item.correctText || item.correctAnswer || '—';

    return `
      <article class="rounded-2xl border-2 ${borderTone} p-4 sm:p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Question ${index + 1}${item.topic ? ` • ${escapeHtml(item.topic)}` : ''}</div>
            <h4 class="mt-2 text-base font-semibold text-slate-900">${escapeHtml(item.question || '')}</h4>
          </div>
          <span class="inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusTone}">${isCorrect ? 'Correct' : item.isAttempted ? 'Wrong' : 'Unattempted'}</span>
        </div>

        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <div class="rounded-xl bg-white p-3 shadow-sm">
            <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Your answer</div>
            <div class="mt-1 text-sm font-medium text-slate-800">${escapeHtml(selectedText)}</div>
          </div>
          <div class="rounded-xl bg-white p-3 shadow-sm">
            <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Correct answer</div>
            <div class="mt-1 text-sm font-medium text-slate-800">${escapeHtml(correctText)}</div>
          </div>
        </div>

        ${item.explanation ? `<div class="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900"><span class="font-semibold">Explanation:</span> ${escapeHtml(item.explanation)}</div>` : ''}
        ${options.length > 0 ? `<div class="mt-4 flex flex-wrap gap-2">${options.map((option) => {
          const optionTone = option === item.correctAnswer
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : option === item.selectedText || option === item.selected
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-slate-200 bg-white text-slate-600';
          return `<span class="inline-flex rounded-full border px-3 py-1 text-xs font-medium ${optionTone}">${escapeHtml(option)}</span>`;
        }).join('')}</div>` : ''}
      </article>
    `;
  }

  function render(result, options = {}) {
    const totalQuestions = Math.max(0, Number(result.totalQuestions) || 0);
    const correctAnswers = Math.max(0, Number(result.correctAnswers) || 0);
    const incorrectAnswers = Math.max(0, Number(result.incorrectAnswers) || 0);
    const unattemptedQuestions = Math.max(0, Number(result.unattemptedQuestions) || 0);
    const score = Number(result.score) || 0;
    const percentage = clampPercentage(result.percentage ?? result.score ?? 0);
    const accuracy = clampPercentage(result.accuracy ?? percentage);
    const timeTakenSeconds = Math.max(0, Number(result.timeTakenSeconds ?? result.timeSpent) || 0);
    const averageTimePerQuestionSeconds = Math.max(0, Number(result.averageTimePerQuestionSeconds) || (totalQuestions > 0 ? Math.round(timeTakenSeconds / totalQuestions) : 0));
    const theme = themeForPercentage(percentage);
    const ranking = result.ranking || null;
    const comparison = result.comparison || null;
    const topicPerformance = Array.isArray(result.topicPerformance) ? result.topicPerformance : [];
    const reviewItems = Array.isArray(result.reviewItems) ? result.reviewItems : Array.isArray(result.answers) ? result.answers : [];
    const recommendedNextQuiz = result.recommendedNextQuiz || null;
    const hasWrongQuestions = reviewItems.some((item) => item && item.isCorrect === false);
    const requestedActions = options.actions || {
      review: true,
      retryWrong: true,
      retryFull: true,
      recommended: true
    };
    const canReview = requestedActions.review !== false;
    const canRetryWrong = requestedActions.retryWrong !== false;
    const canRetryFull = requestedActions.retryFull !== false;
    const canRecommended = requestedActions.recommended !== false && !!recommendedNextQuiz;

    const rankingCards = ranking ? `
      <section class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Quiz ranking</div>
          <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div class="rounded-2xl bg-slate-50 p-4">
              <div class="text-xs uppercase tracking-[0.18em] text-slate-500">Rank</div>
              <div class="mt-1 text-2xl font-black text-slate-900">#${escapeHtml(ranking.quizRank || '—')}</div>
            </div>
            <div class="rounded-2xl bg-slate-50 p-4">
              <div class="text-xs uppercase tracking-[0.18em] text-slate-500">Percentile</div>
              <div class="mt-1 text-2xl font-black text-slate-900">${escapeHtml(ranking.percentile || 0)}%</div>
            </div>
            <div class="rounded-2xl bg-slate-50 p-4">
              <div class="text-xs uppercase tracking-[0.18em] text-slate-500">Participants</div>
              <div class="mt-1 text-2xl font-black text-slate-900">${escapeHtml(ranking.totalParticipants || 0)}</div>
            </div>
            <div class="rounded-2xl bg-slate-50 p-4">
              <div class="text-xs uppercase tracking-[0.18em] text-slate-500">Top score</div>
              <div class="mt-1 text-lg font-black text-slate-900">${escapeHtml(formatScore(ranking.topScore?.score ?? 0, totalQuestions))}</div>
              <div class="text-xs text-slate-500">${escapeHtml(ranking.topScore?.percentage ?? 0)}%</div>
            </div>
          </div>
        </div>

        <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Score benchmark</div>
          <div class="mt-4 grid grid-cols-2 gap-3">
            <div class="rounded-2xl bg-blue-50 p-4">
              <div class="text-xs uppercase tracking-[0.18em] text-blue-600">Average score</div>
              <div class="mt-1 text-lg font-black text-blue-700">${escapeHtml(formatScore(ranking.averageScore?.score ?? 0, totalQuestions))}</div>
              <div class="text-xs text-blue-600/80">${escapeHtml(ranking.averageScore?.percentage ?? 0)}%</div>
            </div>
            <div class="rounded-2xl bg-indigo-50 p-4">
              <div class="text-xs uppercase tracking-[0.18em] text-indigo-600">Current score</div>
              <div class="mt-1 text-lg font-black text-indigo-700">${escapeHtml(formatScore(score, totalQuestions))}</div>
              <div class="text-xs text-indigo-600/80">${accuracy}% accuracy</div>
            </div>
          </div>
        </div>
      </section>
    ` : '';

    const comparisonCard = comparison ? `
      <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Compared with previous attempt</div>
        <div class="mt-4 grid gap-3 sm:grid-cols-3">
          <div class="rounded-2xl bg-slate-50 p-4">
            <div class="text-xs uppercase tracking-[0.18em] text-slate-500">Score change</div>
            <div class="mt-2 text-xl font-black ${comparison.scoreChange > 0 ? 'text-emerald-700' : comparison.scoreChange < 0 ? 'text-rose-700' : 'text-slate-900'}">${escapeHtml(signedLabel(comparison.scoreChange))}</div>
          </div>
          <div class="rounded-2xl bg-slate-50 p-4">
            <div class="text-xs uppercase tracking-[0.18em] text-slate-500">Rank change</div>
            <div class="mt-2 text-xl font-black ${comparison.rankChange > 0 ? 'text-emerald-700' : comparison.rankChange < 0 ? 'text-rose-700' : 'text-slate-900'}">${escapeHtml(signedLabel(comparison.rankChange))}</div>
          </div>
          <div class="rounded-2xl bg-slate-50 p-4">
            <div class="text-xs uppercase tracking-[0.18em] text-slate-500">Accuracy change</div>
            <div class="mt-2 text-xl font-black ${comparison.accuracyChange > 0 ? 'text-emerald-700' : comparison.accuracyChange < 0 ? 'text-rose-700' : 'text-slate-900'}">${escapeHtml(signedLabel(comparison.accuracyChange, '%'))}</div>
          </div>
        </div>
      </section>
    ` : '';

    const topicSection = topicPerformance.length > 0 ? `
      <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Topic-wise breakdown</div>
            <h3 class="mt-2 text-lg font-bold text-slate-900">Performance by topic</h3>
          </div>
          <div class="flex flex-wrap gap-2">
            ${result.strongestTopic ? `<span class="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Strongest: ${escapeHtml(result.strongestTopic.topic || 'General')}</span>` : ''}
            ${result.weakestTopic ? `<span class="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">Weakest: ${escapeHtml(result.weakestTopic.topic || 'General')}</span>` : ''}
          </div>
        </div>
        <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          ${topicPerformance.map(renderTopicRow).join('')}
        </div>
      </section>
    ` : '';

    const actions = [];
    if (canReview) {
      actions.push(`<button type="button" data-result-action="review" class="rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-200">Review answers</button>`);
    }
    if (canRetryWrong && hasWrongQuestions) {
      actions.push(`<button type="button" data-result-action="retry-wrong" class="rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-600">Retry wrong questions</button>`);
    }
    if (canRetryFull) {
      actions.push(`<button type="button" data-result-action="retry-full" class="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700">Retry full quiz</button>`);
    }
    if (canRecommended) {
      actions.push(`<button type="button" data-result-action="recommended" class="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700">${escapeHtml(recommendedNextQuiz.title || 'Recommended next quiz')}</button>`);
    }

    const reviewSection = reviewItems.length > 0 ? `
      <section id="quizReviewSection" class="hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Review answers</div>
            <h3 class="mt-2 text-lg font-bold text-slate-900">Question-by-question review</h3>
          </div>
          <div class="text-sm text-slate-500">${reviewItems.filter((item) => item.isCorrect).length}/${reviewItems.length} correct</div>
        </div>
        <div class="mt-4 space-y-3" id="quizReviewList">
          ${reviewItems.map(renderReviewItem).join('')}
        </div>
      </section>
    ` : '';

    const nextQuizSection = recommendedNextQuiz ? `
      <section class="rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-950 via-blue-950 to-indigo-900 p-5 text-white shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="text-xs font-semibold uppercase tracking-[0.22em] text-blue-200">Recommended next quiz</div>
            <h3 class="mt-2 text-xl font-black">${escapeHtml(recommendedNextQuiz.title || 'Next quiz')}</h3>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-blue-100">${escapeHtml(recommendedNextQuiz.reason || 'Continue momentum with the next best quiz.')}</p>
            <div class="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-white/90">
              <span class="rounded-full bg-white/10 px-3 py-1">Action: ${escapeHtml(recommendedNextQuiz.action === 'revise' ? 'Revise first' : 'Continue practice')}</span>
              ${recommendedNextQuiz.topic ? `<span class="rounded-full bg-white/10 px-3 py-1">Topic: ${escapeHtml(recommendedNextQuiz.topic)}</span>` : ''}
              ${recommendedNextQuiz.estimatedTimeLabel ? `<span class="rounded-full bg-white/10 px-3 py-1">Effort: ${escapeHtml(recommendedNextQuiz.estimatedTimeLabel)}</span>` : ''}
            </div>
            ${recommendedNextQuiz.mockReadinessHint ? `<p class="mt-3 max-w-2xl text-xs leading-5 text-blue-100/90">${escapeHtml(recommendedNextQuiz.mockReadinessHint)}</p>` : ''}
          </div>
          <button type="button" data-result-action="recommended" class="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-100">${escapeHtml(recommendedNextQuiz.ctaLabel || (recommendedNextQuiz.action === 'revise' ? 'Open revision' : 'Open quiz'))}</button>
        </div>
      </section>
    ` : `
      <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Next step</div>
            <h3 class="mt-2 text-lg font-black text-slate-900">Practice another quiz</h3>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Recommendation data is unavailable for this attempt. Continue with another quiz or open revision.</p>
          </div>
          <a href="/quizzes.html?mode=all" class="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">Open quizzes</a>
        </div>
      </section>
    `;

    return `
      <section class="space-y-6">
        <section class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
          <div class="bg-gradient-to-br ${theme.accent} px-5 py-6 text-white sm:px-7">
            <div class="flex flex-wrap items-end justify-between gap-4">
              <div class="min-w-0 flex-1">
                <p class="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">Result summary</p>
                <h2 class="mt-2 truncate text-2xl font-black sm:text-3xl">${escapeHtml(result.quizTitle || result.title || 'Quiz complete')}</h2>
                <p class="mt-2 max-w-3xl text-sm leading-6 text-white/80">Focus on accuracy, mastery, streak, and rank. Use the review tools below to turn this attempt into the next improvement cycle.</p>
              </div>
              <div class="text-right">
                <div class="text-5xl font-black sm:text-6xl">${percentage}%</div>
                <div class="mt-1 text-sm text-white/75">Score</div>
              </div>
            </div>

            <div class="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              ${metricCard('Score', formatScore(score, totalQuestions), `${correctAnswers} correct`, theme.text)}
              ${metricCard('Percentage', `${percentage}%`, `${totalQuestions} questions`, theme.text)}
              ${metricCard('Accuracy', `${accuracy}%`, `${correctAnswers}/${Math.max(correctAnswers + incorrectAnswers, 1)} attempted`, theme.text)}
              ${metricCard('Correct / Incorrect / Unattempted', `${correctAnswers} / ${incorrectAnswers} / ${unattemptedQuestions}`, 'Question split', '')}
              ${metricCard('Time taken', formatTime(timeTakenSeconds), 'Total duration', '')}
              ${metricCard('Average per question', `${formatTime(averageTimePerQuestionSeconds)}`, 'Tempo', '')}
            </div>
          </div>
        </section>

        <section class="grid gap-4 lg:grid-cols-2">
          <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Progression direction</div>
            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <div class="rounded-2xl bg-blue-50 p-4">
                <div class="text-xs uppercase tracking-[0.18em] text-blue-600">Accuracy</div>
                <div class="mt-1 text-2xl font-black text-blue-700">${accuracy}%</div>
              </div>
              <div class="rounded-2xl bg-violet-50 p-4">
                <div class="text-xs uppercase tracking-[0.18em] text-violet-600">Mastery</div>
                <div class="mt-1 text-2xl font-black text-violet-700">${percentage >= 80 ? 'Strong' : percentage >= 60 ? 'Building' : 'Developing'}</div>
              </div>
              <div class="rounded-2xl bg-emerald-50 p-4">
                <div class="text-xs uppercase tracking-[0.18em] text-emerald-600">Streak</div>
                <div class="mt-1 text-2xl font-black text-emerald-700">Keep going</div>
              </div>
              <div class="rounded-2xl bg-indigo-50 p-4">
                <div class="text-xs uppercase tracking-[0.18em] text-indigo-600">Rank</div>
                <div class="mt-1 text-2xl font-black text-indigo-700">Build momentum</div>
              </div>
            </div>
          </div>

          ${rankingCards || `<div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Ranking</div><div class="mt-3 text-sm text-slate-600">Ranking data is unavailable for this attempt.</div></div>`}
        </section>

        ${comparisonCard}
        ${topicSection}

        <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Actions</div>
              <h3 class="mt-2 text-lg font-bold text-slate-900">Choose the next step</h3>
            </div>
            <div class="text-sm text-slate-500">Precision first, then speed, then rank.</div>
          </div>
          <div class="mt-4 flex flex-wrap gap-3">
            ${actions.join('')}
          </div>
        </section>

        ${reviewSection}
        ${nextQuizSection}
      </section>
    `;
  }

  function bindActions(root, handlers = {}) {
    if (!root) return;

    const reviewButton = root.querySelector('[data-result-action="review"]');
    const retryWrongButton = root.querySelector('[data-result-action="retry-wrong"]');
    const retryFullButton = root.querySelector('[data-result-action="retry-full"]');
    const recommendedButtons = root.querySelectorAll('[data-result-action="recommended"]');

    reviewButton && reviewButton.addEventListener('click', () => {
      if (handlers.onReview) handlers.onReview();
    });

    retryWrongButton && retryWrongButton.addEventListener('click', () => {
      if (handlers.onRetryWrong) handlers.onRetryWrong();
    });

    retryFullButton && retryFullButton.addEventListener('click', () => {
      if (handlers.onRetryFull) handlers.onRetryFull();
    });

    recommendedButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (handlers.onRecommended) handlers.onRecommended();
      });
    });
  }

  return {
    render,
    bindActions,
    formatTime,
    escapeHtml
  };
})();
