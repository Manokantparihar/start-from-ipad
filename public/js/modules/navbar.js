// Reusable navbar component for public pages.
// Usage:
//   <div id="appNavbar"></div>
//   <script src="js/modules/navbar.js"></script>
//   <script>Navbar.mount('#appNavbar', { active: 'dashboard' });</script>

(function initNavbarModule(global) {
  const DEFAULT_LOGOUT_REDIRECT = 'index.html';

  function linkClass(isActive) {
    return isActive
      ? 'text-blue-600 font-semibold'
      : 'text-gray-700 hover:text-blue-600 font-medium';
  }

  function normalizeHref(href) {
    return String(href || '').replace(/^\//, '');
  }

  function getCurrentPath() {
    const path = window.location.pathname.split('/').pop() || 'index.html';
    return normalizeHref(path);
  }

  function inferActiveKey() {
    const path = getCurrentPath();
    if (path === 'index.html') return 'home';
    if (path === 'dashboard.html') return 'dashboard';
    if (path === 'achievements.html') return 'achievements';
    if (path === 'leaderboard.html') return 'leaderboard';
    if (path === 'resources.html') return 'resources';
    if (path === 'profile.html') return 'profile';
    if (path === 'quizzes.html') return 'practice';
    return 'home';
  }

  function getInitials(name) {
    const parts = String(name || 'Profile').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return 'PR';
  }

  function withCacheBuster(url, version) {
    if (!url) return '';
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${encodeURIComponent(version || Date.now())}`;
  }

  function toPublicAvatarUrl(profileImage, version) {
    if (!profileImage) return '';
    const raw = String(profileImage).trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return withCacheBuster(raw, version);
    const normalized = raw.startsWith('/') ? raw : `/${raw}`;
    return withCacheBuster(normalized, version);
  }

  function applyProfileIdentity(mountNode, user) {
    const label = mountNode.querySelector('#profileMenuLabel');
    const avatarImg = mountNode.querySelector('#profileMenuAvatarImg');
    const avatarFallback = mountNode.querySelector('#profileMenuAvatarFallback');

    if (label && user && user.name) {
      label.textContent = user.name;
    }

    if (!avatarImg || !avatarFallback) return;

    avatarFallback.textContent = getInitials(user && user.name ? user.name : 'Profile');
    const avatarUrl = toPublicAvatarUrl(user && user.profileImage, user && user.updatedAt);

    if (!avatarUrl) {
      avatarImg.classList.add('hidden');
        avatarImg.src = '';
      avatarFallback.classList.remove('hidden');
      return;
    }

      // Guard against race conditions: clear any previous src to force reload
      avatarImg.src = '';
    
      const showImage = () => {
        avatarImg.classList.remove('hidden');
        avatarFallback.classList.add('hidden');
      };

      const showFallback = () => {
        avatarImg.classList.add('hidden');
        avatarImg.src = '';
        avatarFallback.classList.remove('hidden');
      };

    avatarImg.onload = () => {
        showImage();
    };

    avatarImg.onerror = () => {
        showFallback();
    };

      // Set src to trigger load; also detect if already cached
    avatarImg.src = avatarUrl;
    
      // Handle case where image is already loaded from cache (complete property)
      if (avatarImg.complete && avatarImg.naturalHeight !== 0) {
        showImage();
      } else if (avatarImg.complete) {
        // Image failed to load previously
        showFallback();
      }
  }

  function buildMarkup(config) {
    const active = config.active || inferActiveKey();

    return `
<header class="bg-white border-b border-gray-200 sticky top-0 z-40">
  <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3" aria-label="Main navigation">
    <div class="flex items-center justify-between gap-4">
      <a href="index.html" class="text-xl sm:text-2xl font-bold text-blue-600 whitespace-nowrap">RPSC/REET</a>

      <button
        id="navHamburgerBtn"
        type="button"
        class="md:hidden inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-gray-700 hover:bg-gray-50"
        aria-expanded="false"
        aria-controls="navMobileMenu"
        aria-label="Toggle navigation"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div class="hidden md:flex flex-1 items-center justify-between gap-6">
        <div class="flex items-center gap-6">
          <a href="index.html" class="${linkClass(active === 'home')}">Home</a>
          <a href="dashboard.html" class="${linkClass(active === 'dashboard')}">Dashboard</a>
          <a href="achievements.html" class="${linkClass(active === 'achievements')}">Achievements</a>

          <div class="relative group" data-dropdown="practice">
            <button
              type="button"
              class="inline-flex items-center gap-1 ${linkClass(active === 'practice')}"
              aria-expanded="false"
              aria-haspopup="true"
            >
              Practice
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div class="invisible group-hover:visible opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto absolute left-0 mt-2 w-52 rounded-xl border border-gray-100 bg-white p-2 shadow-xl transition" role="menu">
              <a href="quizzes.html?mode=daily" class="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700" role="menuitem">Daily Quiz</a>
              <a href="quizzes.html?mode=topic" class="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700" role="menuitem">Topic Tests</a>
              <a href="quizzes.html?mode=mock" class="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700" role="menuitem">Mock Tests</a>
              <a href="quizzes.html" class="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700" role="menuitem">All Quizzes</a>
            </div>
          </div>

          <a href="leaderboard.html" class="${linkClass(active === 'leaderboard')}">Leaderboard</a>
          <a href="resources.html" class="${linkClass(active === 'resources')}">Resources</a>
        </div>

        <div class="relative" data-dropdown="profile">
          <button
            id="profileMenuBtn"
            type="button"
            class="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            aria-expanded="false"
            aria-haspopup="true"
          >
            <span class="relative inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                <img id="profileMenuAvatarImg" src="" alt="Profile" class="hidden h-8 w-8 rounded-full object-cover" />
              <span id="profileMenuAvatarFallback">PR</span>
            </span>
            <span id="profileMenuLabel" class="max-w-36 truncate">Profile</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div id="profileMenu" class="hidden absolute right-0 mt-2 w-56 rounded-xl border border-gray-100 bg-white p-2 shadow-xl" role="menu">
            <a href="profile.html" class="block rounded-lg px-3 py-2 text-sm ${active === 'profile' ? 'text-blue-700 bg-blue-50' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'}" role="menuitem">My Profile</a>
            <a id="profileAdminLink" href="/admin/" class="hidden rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700" role="menuitem">Admin Panel</a>
            <button id="profileLogoutBtn" type="button" class="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50" role="menuitem">Logout</button>
          </div>
        </div>
      </div>
    </div>

    <div id="navMobileMenu" class="hidden md:hidden mt-3 rounded-xl border border-gray-200 bg-white p-3">
      <div class="flex flex-col gap-1">
        <a href="index.html" class="rounded-lg px-3 py-2 text-sm ${active === 'home' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}">Home</a>
        <a href="dashboard.html" class="rounded-lg px-3 py-2 text-sm ${active === 'dashboard' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}">Dashboard</a>
        <a href="achievements.html" class="rounded-lg px-3 py-2 text-sm ${active === 'achievements' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}">Achievements</a>

        <button
          id="mobilePracticeToggle"
          type="button"
          class="mt-1 flex items-center justify-between rounded-lg px-3 py-2 text-sm ${active === 'practice' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}"
          aria-expanded="false"
        >
          <span>Practice</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div id="mobilePracticeMenu" class="hidden ml-3 border-l border-gray-200 pl-3">
          <a href="quizzes.html?mode=daily" class="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700">Daily Quiz</a>
          <a href="quizzes.html?mode=topic" class="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700">Topic Tests</a>
          <a href="quizzes.html?mode=mock" class="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700">Mock Tests</a>
          <a href="quizzes.html" class="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700">All Quizzes</a>
        </div>

        <a href="leaderboard.html" class="rounded-lg px-3 py-2 text-sm ${active === 'leaderboard' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}">Leaderboard</a>
        <a href="resources.html" class="rounded-lg px-3 py-2 text-sm ${active === 'resources' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}">Resources</a>

        <div class="mt-2 border-t border-gray-100 pt-2">
          <a href="profile.html" class="block rounded-lg px-3 py-2 text-sm ${active === 'profile' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}">My Profile</a>
          <a id="mobileProfileAdminLink" href="/admin/" class="hidden block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700">Admin Panel</a>
          <button id="mobileProfileLogoutBtn" type="button" class="w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">Logout</button>
        </div>
      </div>
    </div>
  </nav>
</header>
`;
  }

  async function resolveUser(providedUser) {
    if (providedUser) return providedUser;
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      return data.user || null;
    } catch {
      return null;
    }
  }

  async function logout(redirectTo) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } finally {
      window.location.href = redirectTo || DEFAULT_LOGOUT_REDIRECT;
    }
  }

  function closeProfileMenu(profileMenu, profileBtn) {
    if (!profileMenu || !profileBtn) return;
    profileMenu.classList.add('hidden');
    profileBtn.setAttribute('aria-expanded', 'false');
  }

  async function mount(target, options = {}) {
    const mountNode = typeof target === 'string' ? document.querySelector(target) : target;
    if (!mountNode) {
      throw new Error('Navbar mount target not found');
    }

    mountNode.innerHTML = buildMarkup(options);

    const user = await resolveUser(options.user);
    const isAdmin = user && user.role === 'admin';

    applyProfileIdentity(mountNode, user);

    const profileAdminLink = mountNode.querySelector('#profileAdminLink');
    const mobileProfileAdminLink = mountNode.querySelector('#mobileProfileAdminLink');
    if (isAdmin) {
      profileAdminLink && profileAdminLink.classList.remove('hidden');
      mobileProfileAdminLink && mobileProfileAdminLink.classList.remove('hidden');
    }

    const hamburgerBtn = mountNode.querySelector('#navHamburgerBtn');
    const mobileMenu = mountNode.querySelector('#navMobileMenu');
    const mobilePracticeToggle = mountNode.querySelector('#mobilePracticeToggle');
    const mobilePracticeMenu = mountNode.querySelector('#mobilePracticeMenu');

    hamburgerBtn && hamburgerBtn.addEventListener('click', () => {
      const isHidden = mobileMenu.classList.contains('hidden');
      mobileMenu.classList.toggle('hidden', !isHidden);
      hamburgerBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    });

    mobilePracticeToggle && mobilePracticeToggle.addEventListener('click', () => {
      const isHidden = mobilePracticeMenu.classList.contains('hidden');
      mobilePracticeMenu.classList.toggle('hidden', !isHidden);
      mobilePracticeToggle.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    });

    const profileBtn = mountNode.querySelector('#profileMenuBtn');
    const profileMenu = mountNode.querySelector('#profileMenu');

    profileBtn && profileBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const isClosed = profileMenu.classList.contains('hidden');
      profileMenu.classList.toggle('hidden', !isClosed);
      profileBtn.setAttribute('aria-expanded', isClosed ? 'true' : 'false');
    });

    document.addEventListener('click', (event) => {
      if (!profileMenu || !profileBtn) return;
      if (!profileMenu.contains(event.target) && !profileBtn.contains(event.target)) {
        closeProfileMenu(profileMenu, profileBtn);
      }
    });

    mountNode.querySelector('#profileLogoutBtn')?.addEventListener('click', () => {
      logout(options.logoutRedirect || DEFAULT_LOGOUT_REDIRECT);
    });

    mountNode.querySelector('#mobileProfileLogoutBtn')?.addEventListener('click', () => {
      logout(options.logoutRedirect || DEFAULT_LOGOUT_REDIRECT);
    });
  }

  global.Navbar = {
    mount
  };
})(window);
