/**
 * User notification center (navbar dropdown + optional full page list).
 *
 * Supported containers:
 * - Navbar widget IDs: notifWidget, notifBell, notifBadge, notifDropdown, mobileNotifBadge
 * - Full-page list container: #notificationsPageList and optional #notificationsPageMarkAll
 */

(function () {
  'use strict';

  const POLL_MS = 30_000;
  const ACTION_LINKS = {
    open_quiz: { href: 'quizzes.html?mode=all', label: 'Open Quiz' },
    open_review_revise: { href: 'dashboard.html#revise', label: 'Open Review & Revise' },
    open_dashboard: { href: 'dashboard.html', label: 'Open Dashboard' },
    open_resources: { href: 'resources.html', label: 'Open Resources' },
    open_leaderboard: { href: 'leaderboard.html', label: 'Open Leaderboard' },
    quiz: { href: 'quizzes.html?mode=all', label: 'Open Quiz' },
    revision: { href: 'dashboard.html#revise', label: 'Open Review & Revise' },
    dashboard: { href: 'dashboard.html', label: 'Open Dashboard' },
    resources: { href: 'resources.html', label: 'Open Resources' },
    leaderboard: { href: 'leaderboard.html', label: 'Open Leaderboard' }
  };

  let notifications = [];
  let dropdownOpen = false;
  let pageFilter = 'all';
  let globalClickHandlerBound = false;
  let navbarObserver = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return String(iso || '');
    }
  }

  function toTypeLabel(type) {
    const normalized = String(type || 'general').replace(/_/g, ' ').trim();
    if (!normalized) return 'General';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  function resolveAction(notification) {
    if (notification && notification.link) {
      return { href: notification.link, label: notification.actionLabel || 'View Details' };
    }

    const actionKey = String(notification?.action || '').trim();
    if (actionKey && ACTION_LINKS[actionKey]) {
      return ACTION_LINKS[actionKey];
    }

    const typeKey = String(notification?.type || '').trim();
    if (typeKey && ACTION_LINKS[typeKey]) {
      return ACTION_LINKS[typeKey];
    }

    return null;
  }

  function updateBadges(unreadCount) {
    const badge = byId('notifBadge');
    const mobileBadge = byId('mobileNotifBadge');
    const text = unreadCount > 99 ? '99+' : String(unreadCount);

    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = text;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    if (mobileBadge) {
      if (unreadCount > 0) {
        mobileBadge.textContent = text;
        mobileBadge.classList.remove('hidden');
      } else {
        mobileBadge.classList.add('hidden');
      }
    }
  }

  async function fetchNotifications() {
    const res = await fetch('/api/notifications', { credentials: 'include' });
    if (!res.ok) {
      throw new Error('Unable to load notifications');
    }

    const data = await res.json();
    notifications = Array.isArray(data.notifications) ? data.notifications : [];
    updateBadges(Number(data.unreadCount || 0));
    return notifications;
  }

  async function markOneRead(id) {
    await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
      credentials: 'include'
    });
  }

  async function markAllRead() {
    await fetch('/api/notifications/read-all', {
      method: 'PATCH',
      credentials: 'include'
    });
  }

  async function clearReadNotifications() {
    await fetch('/api/notifications/read', {
      method: 'DELETE',
      credentials: 'include'
    });
  }

  function sortUnreadFirstLatest(notifs = []) {
    return [...notifs].sort((left, right) => {
      const leftUnread = left && !left.read ? 1 : 0;
      const rightUnread = right && !right.read ? 1 : 0;
      if (rightUnread !== leftUnread) return rightUnread - leftUnread;
      return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
    });
  }

  function getDropdownItems() {
    return sortUnreadFirstLatest(notifications).slice(0, 5);
  }

  function getFilteredPageNotifications() {
    if (pageFilter === 'unread') {
      return notifications.filter((item) => !item.read);
    }
    if (pageFilter === 'read') {
      return notifications.filter((item) => item.read);
    }
    return [...notifications];
  }

  function applyLocalMarkAllRead() {
    if (!Array.isArray(notifications) || notifications.length === 0) return;

    notifications = notifications.map((item) => ({
      ...item,
      read: true
    }));

    updateBadges(0);
    if (dropdownOpen) {
      renderDropdown();
    }
    renderNotificationsPage();
  }

  function applyLocalMarkOneRead(id) {
    if (!id) return;

    let changed = false;
    notifications = notifications.map((item) => {
      if (item.id === id && !item.read) {
        changed = true;
        return {
          ...item,
          read: true
        };
      }
      return item;
    });

    if (!changed) return;

    const unreadCount = notifications.filter((item) => !item.read).length;
    updateBadges(unreadCount);
    if (dropdownOpen) {
      renderDropdown();
    }
    renderNotificationsPage();
  }

  function applyLocalClearRead() {
    const before = notifications.length;
    notifications = notifications.filter((item) => !item.read);
    if (notifications.length === before) return;

    const unreadCount = notifications.filter((item) => !item.read).length;
    updateBadges(unreadCount);
    if (dropdownOpen) {
      renderDropdown();
    }
    renderNotificationsPage();
  }

  function notificationItemMarkup(item, compact = false) {
    const action = resolveAction(item);
    const itemClasses = item.read
      ? 'bg-slate-50 border-slate-200 opacity-80'
      : 'bg-blue-50/70 border-blue-200';

    return `
      <article class="rounded-lg border border-slate-100 p-3 ${itemClasses}" data-id="${escHtml(item.id)}">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <div class="mb-1 flex items-center gap-2">
              <span class="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">${escHtml(toTypeLabel(item.type))}</span>
              <span class="text-[11px] text-slate-400">${escHtml(fmtDate(item.createdAt))}</span>
              ${item.read ? '<span class="text-[11px] text-slate-400">Read</span>' : '<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600"><span class="h-1.5 w-1.5 rounded-full bg-blue-500"></span>Unread</span>'}
            </div>
            <h4 class="text-sm font-semibold text-slate-800">${escHtml(item.title || 'Notification')}</h4>
            <p class="mt-0.5 text-xs text-slate-600">${escHtml(item.message || '')}</p>
            ${action ? `<a href="${escHtml(action.href)}" class="notif-action mt-2 inline-flex rounded-md border border-blue-200 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50">${escHtml(action.label)}</a>` : ''}
          </div>
          ${compact ? '' : `<button class="notif-mark-read rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 ${item.read ? 'hidden' : ''}" data-id="${escHtml(item.id)}">Mark read</button>`}
        </div>
      </article>`;
  }

  function attachNotificationHandlers(container, { compact = false } = {}) {
    container.querySelectorAll('.notif-mark-read').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = button.dataset.id;
        if (!id) return;
        applyLocalMarkOneRead(id);
        await markOneRead(id);
        await refreshAll();
      });
    });

    container.querySelectorAll('article[data-id]').forEach((card) => {
      card.addEventListener('click', async (event) => {
        const target = event.target;
        const link = target.closest('.notif-action');
        const id = card.dataset.id;
        if (!id) return;

        const selected = notifications.find((entry) => entry.id === id);
        if (selected && !selected.read) {
          applyLocalMarkOneRead(id);
          await markOneRead(id);
          await refreshAll();
        }

        if (!link && compact) {
          const action = resolveAction(selected);
          if (action) {
            window.location.href = action.href;
          }
        }
      });
    });
  }

  function renderDropdown() {
    const dropdown = byId('notifDropdown');
    if (!dropdown) return;

    const dropdownItems = getDropdownItems();
    if (dropdownItems.length === 0) {
      dropdown.innerHTML = '<div class="px-5 py-10 text-center"><p class="text-sm font-medium text-slate-500">No notifications yet</p><p class="mt-1 text-xs text-slate-400">You\'re all caught up.</p></div>';
      return;
    }

    const body = dropdownItems.map((item) => notificationItemMarkup(item, true)).join('');
    dropdown.innerHTML = `
      <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p class="text-sm font-semibold text-slate-800">Notifications</p>
        <button id="notifMarkAllRead" class="text-xs font-medium text-blue-700 hover:underline">Mark all as read</button>
      </div>
      <div class="max-h-[26rem] space-y-2 overflow-y-auto p-3">${body}</div>
      <a href="notifications.html" class="block border-t border-slate-100 px-4 py-2 text-center text-xs font-medium text-blue-700 hover:bg-blue-50">View all notifications</a>
    `;

    dropdown.querySelector('#notifMarkAllRead')?.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      applyLocalMarkAllRead();
      await markAllRead();
      await refreshAll();
    });

    attachNotificationHandlers(dropdown, { compact: true });
  }

  function renderNotificationsPage() {
    const list = byId('notificationsPageList');
    if (!list) return;

    const filtered = getFilteredPageNotifications();

    updateFilterButtons();

    if (filtered.length === 0) {
      list.innerHTML = '<div class="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center"><p class="text-base font-semibold text-slate-600">No notifications</p><p class="mt-1 text-sm text-slate-500">When admins share updates, they\'ll appear here.</p></div>';
      return;
    }

    if (pageFilter === 'all') {
      const unread = filtered.filter((item) => !item.read);
      const read = filtered.filter((item) => item.read);

      const unreadSection = unread.length > 0
        ? `<section class="space-y-3"><h2 class="text-sm font-semibold text-blue-700">Unread (${unread.length})</h2>${unread.map((item) => notificationItemMarkup(item)).join('')}</section>`
        : '';
      const readSection = read.length > 0
        ? `<section class="space-y-3"><h2 class="text-sm font-semibold text-slate-500">Read (${read.length})</h2>${read.map((item) => notificationItemMarkup(item)).join('')}</section>`
        : '';

      list.innerHTML = `<div class="space-y-5">${unreadSection}${readSection}</div>`;
    } else {
      list.innerHTML = `<div class="space-y-3">${filtered.map((item) => notificationItemMarkup(item)).join('')}</div>`;
    }

    attachNotificationHandlers(list);
  }

  function updateFilterButtons() {
    document.querySelectorAll('.notifications-filter-btn').forEach((button) => {
      const isActive = button.dataset.filter === pageFilter;
      button.className = isActive
        ? 'notifications-filter-btn rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700'
        : 'notifications-filter-btn rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50';
    });
  }

  async function ensureWidgetVisible(widget) {
    if (!widget) return;

    try {
      const meRes = await fetch('/api/auth/me', { credentials: 'include' });
      if (meRes.ok) {
        widget.classList.remove('hidden');
      }
    } catch {
      // ignore
    }
  }

  function bindDropdownInteractions(widget, bell, dropdown) {
    if (!widget || !bell || !dropdown) return;
    if (bell.dataset.notifBound === '1') return;

    bell.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropdownOpen = !dropdownOpen;
      if (dropdownOpen) {
        renderDropdown();
        dropdown.classList.remove('hidden');
      } else {
        dropdown.classList.add('hidden');
      }
    });

    bell.dataset.notifBound = '1';

    if (!globalClickHandlerBound) {
      document.addEventListener('click', (event) => {
        const currentWidget = byId('notifWidget');
        const currentDropdown = byId('notifDropdown');
        if (dropdownOpen && currentWidget && currentDropdown && !currentWidget.contains(event.target)) {
          dropdownOpen = false;
          currentDropdown.classList.add('hidden');
        }
      });

      globalClickHandlerBound = true;
    }
  }

  async function ensureNavbarWidgetReady() {
    const widget = byId('notifWidget');
    const bell = byId('notifBell');
    const dropdown = byId('notifDropdown');

    if (!widget || !bell || !dropdown) return false;

    await ensureWidgetVisible(widget);
    bindDropdownInteractions(widget, bell, dropdown);
    return true;
  }

  function observeNavbarWidgetMount() {
    if (navbarObserver || !document.body) return;

    navbarObserver = new MutationObserver(() => {
      ensureNavbarWidgetReady().catch(() => {
        // ignore
      });
    });

    navbarObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  async function refreshAll() {
    try {
      await ensureNavbarWidgetReady();
      await fetchNotifications();
      if (dropdownOpen) renderDropdown();
      renderNotificationsPage();
    } catch {
      // silent by design for navbar usage
    }
  }

  async function init() {
    observeNavbarWidgetMount();
    await ensureNavbarWidgetReady();

    byId('notificationsPageMarkAll')?.addEventListener('click', async () => {
      applyLocalMarkAllRead();
      await markAllRead();
      await refreshAll();
    });

    byId('notificationsPageClearRead')?.addEventListener('click', async () => {
      applyLocalClearRead();
      await clearReadNotifications();
      await refreshAll();
    });

    document.querySelectorAll('.notifications-filter-btn').forEach((button) => {
      button.addEventListener('click', () => {
        pageFilter = button.dataset.filter || 'all';
        renderNotificationsPage();
      });
    });

    await refreshAll();
    setInterval(refreshAll, POLL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
