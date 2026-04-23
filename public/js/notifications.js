/**
 * User notification center with iPad/mobile-friendly drawer.
 *
 * Supported containers:
 * - Navbar widget IDs: notifWidget, notifBell, notifBadge, notifDrawer, mobileNotifBadge
 * - Full-page list container: #notificationsPageList and optional filters
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
  let drawerOpen = false;
  let pageFilter = 'all';
  let selectionMode = false;
  let selectedIds = new Set();
  let navbarObserver = null;
  let drawerKeydownAttached = false;
  let drawerOutsideClickAttached = false;
  let boundBell = null;

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

  function formatRelativeTime(iso) {
    try {
      const then = new Date(iso).getTime();
      const now = Date.now();
      const diffMs = now - then;
      const diffMin = Math.floor(diffMs / 60000);
      const diffHour = Math.floor(diffMs / 3600000);
      const diffDay = Math.floor(diffMs / 86400000);

      if (diffMin < 1) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHour < 24) return `${diffHour}h ago`;
      if (diffDay < 7) return `${diffDay}d ago`;
      return fmtDate(iso);
    } catch {
      return fmtDate(iso);
    }
  }

  function toTypeLabel(type) {
    const normalized = String(type || 'general').replace(/_/g, ' ').trim();
    if (!normalized) return 'General';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  function getNotificationIcon(type) {
    const normalized = String(type || 'general').toLowerCase();
    if (normalized.includes('quiz')) return '📝';
    if (normalized.includes('revision') || normalized.includes('review')) return '📚';
    if (normalized.includes('achievement') || normalized.includes('badge')) return '🏆';
    if (normalized.includes('leaderboard') || normalized.includes('rank')) return '🎯';
    if (normalized.includes('resource')) return '📑';
    if (normalized.includes('announcement')) return '📢';
    return '✨';
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

  function getUnreadActiveCount(items = notifications) {
    return items.filter((item) => !item.read && !item.archived).length;
  }

  async function fetchNotifications() {
    const res = await fetch('/api/notifications', { credentials: 'include' });
    if (!res.ok) {
      throw new Error('Unable to load notifications');
    }

    const data = await res.json();
    notifications = Array.isArray(data.notifications) ? data.notifications : [];
    updateBadges(Number(data.unreadCount ?? getUnreadActiveCount(notifications)));
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

  async function archiveOne(id, archived = true) {
    await fetch(`/api/notifications/${encodeURIComponent(id)}/archive`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ archived })
    });
  }

  async function archiveSelected(ids, archived = true) {
    await fetch('/api/notifications/archive', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ids, archived })
    });
  }

  function sortUnreadFirstLatest(notifs = []) {
    return [...notifs].sort((left, right) => {
      const leftArchived = left && left.archived ? 1 : 0;
      const rightArchived = right && right.archived ? 1 : 0;
      if (leftArchived !== rightArchived) return leftArchived - rightArchived;

      const leftUnread = left && !left.read ? 1 : 0;
      const rightUnread = right && !right.read ? 1 : 0;
      if (rightUnread !== leftUnread) return rightUnread - leftUnread;
      return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
    });
  }

  function applyLocalMarkAllRead() {
    if (!Array.isArray(notifications) || notifications.length === 0) return;

    notifications = notifications.map((item) => {
      if (item.archived) return item;
      return {
        ...item,
        read: true
      };
    });

    updateBadges(getUnreadActiveCount());
    if (drawerOpen) {
      renderDrawer();
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

    updateBadges(getUnreadActiveCount());
    if (drawerOpen) {
      renderDrawer();
    }
    renderNotificationsPage();
  }

  function applyLocalArchive(ids, archived = true) {
    if (!Array.isArray(ids) || ids.length === 0) return;

    const idSet = new Set(ids);
    let changed = false;

    notifications = notifications.map((item) => {
      if (!idSet.has(item.id)) return item;
      if (!!item.archived === archived) return item;
      changed = true;
      return {
        ...item,
        archived
      };
    });

    if (!changed) return;

    ids.forEach((id) => selectedIds.delete(id));
    updateBadges(getUnreadActiveCount());
    if (drawerOpen) {
      renderDrawer();
    }
    renderNotificationsPage();
  }

  function getFilteredNotifications() {
    const sorted = sortUnreadFirstLatest(notifications);
    if (pageFilter === 'archive') {
      return sorted.filter((item) => !!item.archived);
    }
    if (pageFilter === 'unread') {
      return sorted.filter((item) => !item.read && !item.archived);
    }
    if (pageFilter === 'read') {
      return sorted.filter((item) => item.read && !item.archived);
    }
    return sorted.filter((item) => !item.archived);
  }

  function getFilterButtonsMarkup(prefix = 'drawer') {
    const filters = [
      { key: 'all', label: 'All' },
      { key: 'unread', label: 'Unread' },
      { key: 'read', label: 'Read' },
      { key: 'archive', label: 'Archive' }
    ];

    return filters
      .map((filter) => {
        const isActive = pageFilter === filter.key;
        const activeClass = isActive
          ? 'border-blue-200 bg-blue-50 text-blue-700'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50';
        const size = prefix === 'drawer'
          ? 'flex-1 rounded-lg px-3 py-2 text-xs'
          : 'rounded-full px-4 py-2 text-sm';

        return `<button data-filter="${filter.key}" class="notif-filter-btn ${size} border font-semibold ${activeClass}">${filter.label}</button>`;
      })
      .join('');
  }

  function notificationItemMarkup(item) {
    const action = resolveAction(item);
    const icon = getNotificationIcon(item.type);
    const relTime = formatRelativeTime(item.createdAt);
    const isSelected = selectedIds.has(item.id);
    const isArchived = !!item.archived;

    const containerClasses = isArchived
      ? 'bg-slate-50 border-slate-200 opacity-90'
      : item.read
        ? 'bg-white border-slate-100'
        : 'bg-blue-50 border-blue-100';

    const checkbox = selectionMode
      ? `<input type="checkbox" class="notif-checkbox" data-id="${escHtml(item.id)}" ${isSelected ? 'checked' : ''} aria-label="Select notification">`
      : '';

    const unreadDot = !item.read && !selectionMode && !isArchived
      ? '<span class="absolute left-0 top-0 h-1.5 w-1.5 rounded-full bg-blue-600"></span>'
      : '';

    const archiveAction = !selectionMode
      ? `<button type="button" class="notif-archive-btn mt-3 inline-flex rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors" data-id="${escHtml(item.id)}" data-archive="${isArchived ? 'false' : 'true'}">${isArchived ? 'Unarchive' : 'Archive'}</button>`
      : '';

    const actionMarkup = action && !selectionMode && !isArchived
      ? `<a href="${escHtml(action.href)}" class="notif-action mt-3 inline-flex rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors">${escHtml(action.label)}</a>`
      : '';

    return `
      <div class="notif-item flex items-start gap-3 rounded-lg border ${containerClasses} p-3 transition-colors sm:p-4 hover:bg-slate-50 cursor-pointer relative ${selectionMode ? 'pl-10' : 'pl-3'}" data-id="${escHtml(item.id)}" role="article">
        ${unreadDot}
        ${checkbox ? `<div class="absolute left-3 top-1/2 -translate-y-1/2">${checkbox}</div>` : ''}
        <div class="flex-shrink-0 text-2xl">${icon}</div>
        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1">
              <h3 class="text-sm font-semibold text-slate-900">${escHtml(item.title || 'Notification')}</h3>
              <p class="mt-0.5 text-xs text-slate-600">${escHtml(item.message || '')}</p>
            </div>
            <span class="flex-shrink-0 text-[11px] font-medium text-slate-400 whitespace-nowrap ml-2">${escHtml(relTime)}</span>
          </div>
          <div class="mt-2 flex items-center gap-2">
            <span class="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">${escHtml(toTypeLabel(item.type))}</span>
            ${!item.read && !selectionMode && !isArchived ? '<span class="inline-flex h-2 w-2 rounded-full bg-blue-600"></span>' : ''}
            ${isArchived ? '<span class="inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">Archived</span>' : ''}
          </div>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            ${actionMarkup}
            ${archiveAction}
          </div>
        </div>
      </div>`;
  }

  function attachNotificationHandlers(container) {
    // Checkbox selection
    container.querySelectorAll('.notif-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        event.stopPropagation();
        const id = checkbox.dataset.id;
        if (checkbox.checked) {
          selectedIds.add(id);
        } else {
          selectedIds.delete(id);
        }
        renderDrawer();
        renderNotificationsPage();
      });
    });

    // Item click
    container.querySelectorAll('.notif-item').forEach((item) => {
      item.addEventListener('click', async (event) => {
        const checkbox = item.querySelector('.notif-checkbox');
        const actionLink = event.target.closest('.notif-action');
        const archiveBtn = event.target.closest('.notif-archive-btn');
        const id = item.dataset.id;

        if (!id) return;

        const notif = notifications.find((n) => n.id === id);
        if (!notif) return;

        // In selection mode, toggle checkbox
        if (selectionMode) {
          event.preventDefault();
          if (checkbox) {
            checkbox.checked = !checkbox.checked;
            if (checkbox.checked) {
              selectedIds.add(id);
            } else {
              selectedIds.delete(id);
            }
            renderDrawer();
            renderNotificationsPage();
          }
          return;
        }

        if (archiveBtn) {
          event.preventDefault();
          event.stopPropagation();
          const shouldArchive = archiveBtn.dataset.archive !== 'false';
          applyLocalArchive([id], shouldArchive);
          await archiveOne(id, shouldArchive);
          await refreshAll();
          return;
        }

        // Mark as read if unread
        if (!notif.read && !notif.archived) {
          applyLocalMarkOneRead(id);
          await markOneRead(id);
        }

        // Navigate if action link
        if (actionLink) {
          event.preventDefault();
          window.location.href = actionLink.href;
        } else {
          // Otherwise navigate to default action
          const action = resolveAction(notif);
          if (action && !event.target.closest('.notif-checkbox')) {
            window.location.href = action.href;
          }
        }

        await refreshAll();
      });
    });
  }

  function renderDrawer() {
    const drawer = byId('notifDrawer');
    if (!drawer) return;

    const filtered = getFilteredNotifications();
    const unreadCount = getUnreadActiveCount();
    const selectedCount = selectedIds.size;
    const hasVisibleItems = filtered.length > 0;
    const allSelected = hasVisibleItems && selectedCount === filtered.length;
    const selectAllLabel = allSelected ? 'Unselect all' : 'Select all';

    // Drawer header
    const headerContent = selectionMode
      ? `
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-semibold text-slate-900">Select notifications</span>
          <div class="flex items-center gap-2">
            <button id="notifSelectAll" class="rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 ${hasVisibleItems ? '' : 'opacity-50 cursor-not-allowed'}" ${hasVisibleItems ? '' : 'disabled'}>${selectAllLabel}</button>
            <button id="notifDone" class="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Done</button>
          </div>
        </div>
      `
      : `
        <div class="flex items-center justify-between">
          <h1 class="text-lg font-semibold text-slate-900">Notifications</h1>
          <div class="flex items-center gap-2">
            ${unreadCount > 0 ? `<button id="notifMarkAllRead" class="rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50">Mark all read</button>` : ''}
            <button id="notifSelect" class="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">Select</button>
            <button id="notifDoneClose" class="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">Done</button>
          </div>
        </div>
      `;

    const selectionActionBar = selectionMode && selectedCount > 0
      ? `
        <div class="border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-semibold text-slate-700">${selectedCount} selected</span>
            <button id="notifBulkRead" class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Mark selected as read</button>
            <button id="notifBulkArchive" class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Archive selected</button>
          </div>
        </div>
      `
      : '';

    // Empty state
    if (filtered.length === 0) {
      drawer.innerHTML = `
        <div class="absolute inset-0 bg-slate-900/20 lg:hidden" id="notifDrawerBackdrop" aria-hidden="true"></div>
        <div class="relative ml-auto h-full w-full bg-white shadow-xl sm:max-w-md lg:h-auto lg:max-h-[80vh] lg:rounded-xl">
          <div class="border-b border-slate-200 bg-white px-4 py-3 sm:px-6 sticky top-0 z-30">
            ${headerContent}
          </div>
          ${selectionActionBar}
          <div class="flex h-[calc(100%-7.5rem)] items-center justify-center lg:h-[22rem]">
            <div class="text-center py-12 px-6">
              <div class="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-3xl">📭</div>
              <h2 class="text-lg font-semibold text-slate-900">No new notifications</h2>
              <p class="mt-2 text-sm text-slate-500">You are all caught up. New alerts will appear here.</p>
            </div>
          </div>
          <div class="border-t border-slate-200 bg-white px-4 py-3 sticky bottom-0 z-30 grid grid-cols-2 gap-2 sm:grid-cols-4">
            ${getFilterButtonsMarkup('drawer')}
          </div>
        </div>
      `;
    } else {
      // Notification list
      const notifList = filtered.map((item) => notificationItemMarkup(item)).join('');
      drawer.innerHTML = `
        <div class="absolute inset-0 bg-slate-900/20 lg:hidden" id="notifDrawerBackdrop" aria-hidden="true"></div>
        <div class="relative ml-auto h-full w-full bg-white shadow-xl sm:max-w-md lg:h-auto lg:max-h-[80vh] lg:rounded-xl">
          <div class="border-b border-slate-200 bg-white px-4 py-3 sm:px-6 sticky top-0 z-30">
            ${headerContent}
          </div>
          ${selectionActionBar}
          <div class="h-[calc(100%-7.5rem)] overflow-y-auto lg:h-[22rem]">
            <div class="space-y-2 p-3 sm:p-4">
              ${notifList}
            </div>
          </div>
          <div class="border-t border-slate-200 bg-white px-4 py-3 sticky bottom-0 z-30 grid grid-cols-2 gap-2 sm:grid-cols-4">
            ${getFilterButtonsMarkup('drawer')}
          </div>
        </div>
      `;
      attachNotificationHandlers(drawer);
    }

    // Bind handlers
    byId('notifSelect')?.addEventListener('click', () => {
      selectionMode = true;
      selectedIds.clear();
      renderDrawer();
    });

    byId('notifDone')?.addEventListener('click', () => {
      selectionMode = false;
      selectedIds.clear();
      renderDrawer();
    });

    byId('notifDoneClose')?.addEventListener('click', () => {
      closeDrawer();
    });

    byId('notifSelectAll')?.addEventListener('click', () => {
      const selectableItems = filtered.map((item) => item.id);
      if (selectedIds.size === selectableItems.length) {
        selectedIds.clear();
      } else {
        selectableItems.forEach((id) => selectedIds.add(id));
      }
      renderDrawer();
      renderNotificationsPage();
    });

    byId('notifMarkAllRead')?.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      applyLocalMarkAllRead();
      await markAllRead();
      await refreshAll();
    });

    byId('notifBulkRead')?.addEventListener('click', async () => {
      const selected = notifications.filter((item) => selectedIds.has(item.id) && !item.read && !item.archived);
      if (selected.length === 0) return;

      selected.forEach((item) => applyLocalMarkOneRead(item.id));
      await Promise.all(selected.map((item) => markOneRead(item.id)));
      await refreshAll();
    });

    byId('notifBulkArchive')?.addEventListener('click', async () => {
      const ids = [...selectedIds];
      if (ids.length === 0) return;

      applyLocalArchive(ids, true);
      await archiveSelected(ids, true);
      await refreshAll();
    });

    byId('notifDrawerBackdrop')?.addEventListener('click', () => {
      closeDrawer();
    });

    // Update filter buttons
    drawer.querySelectorAll('.notif-filter-btn').forEach((button) => {
      button.addEventListener('click', () => {
        pageFilter = button.dataset.filter || 'all';
        renderDrawer();
        renderNotificationsPage();
      });
    });
  }

  function renderNotificationsPage() {
    const list = byId('notificationsPageList');
    if (!list) return;

    const filtered = getFilteredNotifications();
    updateFilterButtons();
    renderPageToolbar();

    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="space-y-6 py-12 text-center">
          <div class="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-3xl">📭</div>
          <div>
            <h2 class="text-xl font-semibold text-slate-900">No new notifications</h2>
            <p class="mt-2 text-slate-600">You are all caught up. Check back later for updates.</p>
          </div>
        </div>
      `;
      return;
    }

    if (pageFilter === 'all') {
      const unread = filtered.filter((item) => !item.read);
      const read = filtered.filter((item) => item.read);

      const unreadSection = unread.length > 0
        ? `<section class="space-y-3"><h2 class="text-sm font-semibold text-blue-700 mb-3">Unread (${unread.length})</h2>${unread.map((item) => notificationItemMarkup(item)).join('')}</section>`
        : '';
      const readSection = read.length > 0
        ? `<section class="space-y-3 mt-6"><h2 class="text-sm font-semibold text-slate-500 mb-3">Read (${read.length})</h2>${read.map((item) => notificationItemMarkup(item)).join('')}</section>`
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
        ? 'notifications-filter-btn rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700'
        : 'notifications-filter-btn rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50';
    });
  }

  function renderPageToolbar() {
    const controls = byId('notificationsPageControls');
    if (!controls) return;

    const unreadCount = getUnreadActiveCount();

    controls.innerHTML = selectionMode
      ? `
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold text-slate-700">${selectedIds.size} selected</span>
          <button id="notificationsPageSelectAll" class="rounded-lg px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50">Select all</button>
          <button id="notificationsPageSelectedRead" class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Mark selected read</button>
          <button id="notificationsPageArchiveSelected" class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Archive selected</button>
          <button id="notificationsPageDone" class="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">Done</button>
        </div>
      `
      : `
        <div class="flex flex-wrap items-center gap-2">
          ${unreadCount > 0 ? '<button id="notificationsPageMarkAll" class="rounded-lg px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50">Mark all read</button>' : ''}
          <button id="notificationsPageSelect" class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">Select</button>
        </div>
      `;

    byId('notificationsPageSelect')?.addEventListener('click', () => {
      selectionMode = true;
      selectedIds.clear();
      renderNotificationsPage();
      if (drawerOpen) renderDrawer();
    });

    byId('notificationsPageDone')?.addEventListener('click', () => {
      selectionMode = false;
      selectedIds.clear();
      renderNotificationsPage();
      if (drawerOpen) renderDrawer();
    });

    byId('notificationsPageMarkAll')?.addEventListener('click', async () => {
      applyLocalMarkAllRead();
      await markAllRead();
      await refreshAll();
    });

    byId('notificationsPageSelectAll')?.addEventListener('click', () => {
      const filtered = getFilteredNotifications();
      if (selectedIds.size === filtered.length) {
        selectedIds.clear();
      } else {
        filtered.forEach((item) => selectedIds.add(item.id));
      }
      renderNotificationsPage();
      if (drawerOpen) renderDrawer();
    });

    byId('notificationsPageSelectedRead')?.addEventListener('click', async () => {
      const selected = notifications.filter((item) => selectedIds.has(item.id) && !item.read && !item.archived);
      if (selected.length === 0) return;

      selected.forEach((item) => applyLocalMarkOneRead(item.id));
      await Promise.all(selected.map((item) => markOneRead(item.id)));
      await refreshAll();
    });

    byId('notificationsPageArchiveSelected')?.addEventListener('click', async () => {
      const ids = [...selectedIds];
      if (ids.length === 0) return;

      applyLocalArchive(ids, true);
      await archiveSelected(ids, true);
      await refreshAll();
    });
  }

  function openDrawer() {
    if (drawerOpen) return;
    drawerOpen = true;
    const drawer = byId('notifDrawer');
    if (drawer) {
      drawer.classList.remove('hidden');
      drawer.classList.add('fixed', 'inset-0', 'z-50', 'lg:absolute', 'lg:right-0', 'lg:top-full', 'lg:mt-2', 'lg:w-auto', 'lg:inset-auto');
      document.body.style.overflow = 'hidden';
      renderDrawer();
    }
  }

  function closeDrawer() {
    if (!drawerOpen) return;
    drawerOpen = false;
    selectionMode = false;
    selectedIds.clear();
    const drawer = byId('notifDrawer');
    if (drawer) {
      drawer.classList.add('hidden');
      drawer.innerHTML = '';
      document.body.style.overflow = '';
    }
  }

  function attachDrawerHandlers(bellEl) {
    const bell = bellEl || byId('notifBell');
    if (!bell) return;

    if (boundBell !== bell) {
      boundBell = bell;
      bell.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (drawerOpen) {
          closeDrawer();
        } else {
          openDrawer();
        }
      });
    }

    if (!drawerKeydownAttached) {
      drawerKeydownAttached = true;
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && drawerOpen) {
          closeDrawer();
        }
      });
    }

    if (!drawerOutsideClickAttached) {
      drawerOutsideClickAttached = true;
      document.addEventListener('click', (event) => {
        if (!drawerOpen) return;

        const widget = byId('notifWidget');
        if (!widget) {
          closeDrawer();
          return;
        }

        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        const isInsideWidget = path.length > 0
          ? path.includes(widget)
          : widget.contains(event.target);

        if (!isInsideWidget) {
          closeDrawer();
        }
      });
    }
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

  async function ensureNavbarWidgetReady() {
    const widget = byId('notifWidget');
    const bell = byId('notifBell');
    const drawer = byId('notifDrawer');

    if (!widget || !bell || !drawer) return false;

    await ensureWidgetVisible(widget);
    attachDrawerHandlers(bell);
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
      if (drawerOpen) renderDrawer();
      renderNotificationsPage();
    } catch {
      // silent by design for navbar usage
    }
  }

  async function init() {
    observeNavbarWidgetMount();
    await ensureNavbarWidgetReady();

    document.querySelectorAll('.notifications-filter-btn').forEach((button) => {
      button.addEventListener('click', () => {
        pageFilter = button.dataset.filter || 'all';
        renderNotificationsPage();
        if (drawerOpen) renderDrawer();
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
