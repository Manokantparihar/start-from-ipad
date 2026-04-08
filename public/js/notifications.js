/**
 * notifications.js – shared client-side notification bell/dropdown widget.
 *
 * Usage: Include this script on any page that has a nav with id="notifBell".
 * The script auto-initialises on DOMContentLoaded.
 *
 * Required HTML in the page's <nav>:
 *
 *   <div id="notifWidget" class="relative hidden">
 *     <button id="notifBell" title="Notifications" class="relative p-1 rounded-full hover:bg-gray-100">
 *       🔔
 *       <span id="notifBadge" class="hidden absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none font-bold"></span>
 *     </button>
 *     <div id="notifDropdown" class="hidden absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 max-h-[420px] overflow-y-auto"></div>
 *   </div>
 */

(function () {
  'use strict';

  const POLL_MS = 30_000; // poll every 30 seconds

  let _notifications = [];
  let _dropdownOpen = false;

  // ── DOM helpers ─────────────────────────────────────────────────────────────

  function $(id) { return document.getElementById(id); }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return iso; }
  }

  // ── Fetch notifications from API ────────────────────────────────────────────

  async function fetchNotifications() {
    try {
      const res = await fetch('/api/notifications', { credentials: 'include' });
      if (!res.ok) return; // not logged in or server error – fail silently
      const data = await res.json();
      _notifications = data.notifications || [];
      updateBadge(data.unreadCount || 0);
    } catch { /* network error – ignore */ }
  }

  // ── Badge ───────────────────────────────────────────────────────────────────

  function updateBadge(count) {
    const badge = $('notifBadge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // ── Dropdown ─────────────────────────────────────────────────────────────────

  function renderDropdown() {
    const dd = $('notifDropdown');
    if (!dd) return;

    if (_notifications.length === 0) {
      dd.innerHTML = '<p class="px-4 py-6 text-center text-gray-400 text-sm">No notifications yet.</p>';
      return;
    }

    const actions = `
      <div class="flex items-center justify-between px-4 py-2 border-b border-gray-100 sticky top-0 bg-white">
        <span class="font-semibold text-sm text-gray-700">Notifications</span>
        <button id="notifMarkAllRead" class="text-xs text-blue-600 hover:underline">Mark all read</button>
      </div>`;

    const items = _notifications.map(n => {
      const unreadCls = n.read ? '' : 'bg-blue-50';
      const link = n.link
        ? `<a href="${escHtml(n.link)}" class="text-blue-600 text-xs hover:underline mt-1 block">View →</a>`
        : '';
      return `
        <div class="notif-item px-4 py-3 border-b border-gray-50 hover:bg-gray-50 ${unreadCls}" data-id="${escHtml(n.id)}">
          <div class="flex justify-between items-start gap-2">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-800 truncate">${escHtml(n.title)}</p>
              <p class="text-xs text-gray-500 mt-0.5 line-clamp-2">${escHtml(n.message)}</p>
              ${link}
              <p class="text-xs text-gray-400 mt-1">${fmtDate(n.createdAt)}</p>
            </div>
            <button class="notif-dismiss text-gray-300 hover:text-red-400 text-lg leading-none flex-shrink-0 ml-1" title="Dismiss" data-id="${escHtml(n.id)}">×</button>
          </div>
        </div>`;
    }).join('');

    dd.innerHTML = actions + items;

    // Mark-all-read
    const markAllBtn = dd.querySelector('#notifMarkAllRead');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch('/api/notifications/read-all', { method: 'PATCH', credentials: 'include' });
        await fetchNotifications();
        renderDropdown();
      });
    }

    // Click notification item → mark read
    dd.querySelectorAll('.notif-item').forEach(el => {
      el.addEventListener('click', async (e) => {
        if (e.target.classList.contains('notif-dismiss')) return;
        const id = el.dataset.id;
        if (!id) return;
        const n = _notifications.find(x => x.id === id);
        if (n && !n.read) {
          await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', credentials: 'include' });
          await fetchNotifications();
          renderDropdown();
        }
      });
    });

    // Dismiss buttons
    dd.querySelectorAll('.notif-dismiss').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (!id) return;
        await fetch(`/api/notifications/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
        await fetchNotifications();
        renderDropdown();
      });
    });
  }

  // ── Toggle dropdown ──────────────────────────────────────────────────────────

  function toggleDropdown() {
    const dd = $('notifDropdown');
    if (!dd) return;
    _dropdownOpen = !_dropdownOpen;
    if (_dropdownOpen) {
      renderDropdown();
      dd.classList.remove('hidden');
      // Mark all as read automatically when opened
      fetch('/api/notifications/read-all', { method: 'PATCH', credentials: 'include' })
        .then(() => fetchNotifications());
    } else {
      dd.classList.add('hidden');
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  async function init() {
    const widget = $('notifWidget');
    const bell = $('notifBell');
    const dd = $('notifDropdown');

    if (!bell || !dd || !widget) return;

    // Only show widget for logged-in users
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) return;
    } catch { return; }

    widget.classList.remove('hidden');

    // Initial fetch
    await fetchNotifications();

    // Bell click
    bell.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown();
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (_dropdownOpen && !widget.contains(e.target)) {
        _dropdownOpen = false;
        dd.classList.add('hidden');
      }
    });

    // Poll for new notifications
    setInterval(fetchNotifications, POLL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
