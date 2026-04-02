// UI Module - Common UI utilities and renderers
const UI = (() => {
  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const showNotification = (message, type = 'info', duration = 3000) => {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 px-6 py-3 rounded-lg text-white shadow-lg z-50 animation-fadeIn ${
      type === 'success' ? 'bg-green-500' :
      type === 'error' ? 'bg-red-500' :
      type === 'warning' ? 'bg-yellow-500' :
      'bg-blue-500'
    }`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, duration);
  };

  const showModal = ({ title, content, buttons = [] }) => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';

    const modalContent = document.createElement('div');
    modalContent.className = 'bg-white rounded-xl shadow-xl max-w-md w-full mx-4';

    let html = `
      <div class="p-6">
        <h2 class="text-2xl font-bold mb-4 text-gray-800">${title}</h2>
        <div class="text-gray-600 mb-6">${content}</div>
        <div class="flex gap-3 justify-end">
    `;

    buttons.forEach((btn, idx) => {
      const className = btn.primary ? 
        'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700' :
        'px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300';
      html += `<button class="${className}" data-btn-id="${idx}">${btn.label}</button>`;
    });

    html += `</div></div>`;
    modalContent.innerHTML = html;
    modal.appendChild(modalContent);

    return new Promise((resolve) => {
      modalContent.querySelectorAll('button').forEach((btn, idx) => {
        btn.addEventListener('click', () => {
          modal.remove();
          resolve(idx);
        });
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.remove();
          resolve(-1);
        }
      });
    });
  };

  const renderQuestionCard = (question, index, totalQuestions) => {
    const div = document.createElement('div');
    div.className = 'bg-white rounded-xl shadow-md p-8 mb-6';

    let optionsHtml = '';
    question.options.forEach((option, optIdx) => {
      optionsHtml += `
        <div class="mb-3">
          <label class="flex items-center p-3 border-2 border-gray-300 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors">
            <input type="radio" name="answer" value="${optIdx}" class="w-4 h-4 text-blue-600">
            <span class="ml-3 text-gray-700">${option}</span>
          </label>
        </div>
      `;
    });

    div.innerHTML = `
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-lg font-semibold text-gray-800">Question ${index + 1} of ${totalQuestions}</h2>
        <div class="w-full bg-gray-200 rounded-full h-2 ml-4" style="width: 200px">
          <div class="bg-blue-600 h-2 rounded-full" style="width: ${((index + 1) / totalQuestions) * 100}%"></div>
        </div>
      </div>
      <h3 class="text-xl font-bold text-gray-800 mb-6">${question.question}</h3>
      <div class="space-y-2">
        ${optionsHtml}
      </div>
    `;

    return div;
  };

  const renderResult = (result) => {
    const div = document.createElement('div');
    const percentage = result.score;
    const color = percentage >= 70 ? 'green' : percentage >= 50 ? 'yellow' : 'red';

    div.className = 'bg-white rounded-xl shadow-md p-8';
    div.innerHTML = `
      <div class="text-center">
        <h2 class="text-3xl font-bold text-gray-800 mb-8">Quiz Complete!</h2>
        
        <div class="mb-8">
          <div class="relative w-40 h-40 mx-auto mb-4">
            <svg class="w-40 h-40 transform -rotate-90">
              <circle cx="80" cy="80" r="70" fill="none" stroke="#e5e7eb" stroke-width="12"/>
              <circle cx="80" cy="80" r="70" fill="none" stroke="#${color === 'green' ? '22c55e' : color === 'yellow' ? 'eab308' : 'ef4444'}" stroke-width="12"
                stroke-dasharray="${(percentage / 100) * 440}" stroke-dashoffset="0" stroke-linecap="round"/>
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="text-center">
                <div class="text-4xl font-bold text-${color}-600">${percentage}%</div>
                <div class="text-sm text-gray-500">Score</div>
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-4 mb-8 text-center">
          <div class="bg-green-50 rounded-lg p-4">
            <div class="text-2xl font-bold text-green-600">${result.correctAnswers}</div>
            <div class="text-sm text-gray-600">Correct</div>
          </div>
          <div class="bg-red-50 rounded-lg p-4">
            <div class="text-2xl font-bold text-red-600">${result.totalQuestions - result.correctAnswers}</div>
            <div class="text-sm text-gray-600">Wrong</div>
          </div>
          <div class="bg-blue-50 rounded-lg p-4">
            <div class="text-2xl font-bold text-blue-600">${formatTime(result.timeSpent)}</div>
            <div class="text-sm text-gray-600">Time</div>
          </div>
        </div>
      </div>
    `;

    return div;
  };

  return {
    formatTime,
    formatDate,
    showNotification,
    showModal,
    renderQuestionCard,
    renderResult
  };
})();
