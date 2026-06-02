// Injects the shared sidebar + topbar into every page.
// Each page calls LF.renderLayout({ active: 'dashboard' }) after DOM is ready.

window.LF = window.LF || {};

// Friendly label for a raw role value.
LF.roleLabel = function (role) {
  return role === 'admin' ? 'Admin' : role === 'team_leader' ? 'Team Leader' : 'Member';
};

// Apply the saved theme as early as possible (the inline <head> script in each
// page is the primary no-flash guard; this is a fallback).
try { if (localStorage.getItem('lf-theme') === 'dark') document.documentElement.classList.add('dark'); } catch (e) {}

const NAV_ITEMS = [
  { id: 'dashboard',    label: 'Dashboard',    icon: 'layout-dashboard', href: 'index.html' },
  { id: 'leads',        label: 'Leads',        icon: 'users',            href: 'leads.html' },
  { id: 'closed',       label: 'Previously Closed', icon: 'archive',     href: 'closed.html' },
  { id: 'contacts',     label: 'Contacts',     icon: 'contact',          href: 'contacts.html' },
  { id: 'tasks',        label: 'Tasks',        icon: 'check-square',     href: 'tasks.html' },
  { id: 'calendar',     label: 'Calendar',     icon: 'calendar',         href: 'calendar.html' },
  { id: 'calls',        label: 'Calls',        icon: 'phone',            href: 'calls.html', chevron: true },
  { id: 'messages',     label: 'Messages',     icon: 'message-square',   href: 'messages.html', chevron: true },
  { id: 'campaigns',    label: 'Campaigns',    icon: 'megaphone',        href: 'campaigns.html' },
  { id: 'reports',      label: 'Reports',      icon: 'bar-chart-3',      href: 'reports.html', chevron: true },
  { id: 'settings',     label: 'Settings',     icon: 'settings',         href: 'settings.html' }
];

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || (parts[0]?.[0] || '?').toUpperCase();
}

LF.renderLayout = async function ({ active }) {
  const root = document.getElementById('app');
  if (!root) return;

  // Fetch current user; on 401 the server middleware would have already
  // redirected the HTML request, but this guards against a stale tab.
  let user;
  try {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    if (!res.ok) { window.location.href = '/login.html'; return; }
    user = await res.json();
  } catch (e) {
    window.location.href = '/login.html';
    return;
  }

  // Make user available to the rest of the app.
  LF_DATA.user = {
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    title: user.title || '',
    bio:   user.bio   || '',
    rawRole: user.role || 'user',
    role:  LF.roleLabel(user.role),
    leaderId: user.leaderId || null,
    leaderName: user.leaderName || '',
    photo: user.photo || '',
    initials: getInitials(user.name)
  };

  const pageContent = root.innerHTML;
  const collapsed = localStorage.getItem('lf-sidebar-collapsed') === '1';

  const nav = NAV_ITEMS.map(item => `
    <a href="${item.href}" class="nav-item ${active === item.id ? 'active' : ''}" title="${item.label}">
      <i data-lucide="${item.icon}"></i>
      <span class="nav-label">${item.label}</span>
      ${item.badge ? `<span class="badge">${item.badge}</span>` : ''}
      ${item.chevron ? `<i data-lucide="chevron-down" class="nav-chevron" style="margin-left:auto;width:14px;height:14px;opacity:.6;"></i>` : ''}
    </a>
  `).join('');

  root.innerHTML = `
    <div class="flex" style="height:100vh;overflow:hidden;">
      <!-- Sidebar (fixed to viewport height) -->
      <aside id="lf-sidebar" class="sidebar flex-shrink-0 flex flex-col ${collapsed ? 'collapsed' : ''}" style="height:100vh;">
        <div class="px-5 pt-5 pb-3 flex items-center gap-3 flex-shrink-0">
          <div class="brand-logo">
            <i data-lucide="zap" style="color:white;width:18px;height:18px;"></i>
          </div>
          <span class="brand-text text-white text-[17px] font-bold tracking-tight">LeadFlow</span>
        </div>
        <nav class="px-3 mt-2 flex-1 flex flex-col gap-1 overflow-y-auto min-h-0">
          ${nav}
        </nav>

        <div class="px-4 pb-4 mt-4 flex-shrink-0">
          <button id="lf-collapse-btn" class="sidebar-collapse-btn" title="${collapsed ? 'Expand sidebar' : 'Collapse sidebar'}">
            <i data-lucide="${collapsed ? 'chevrons-right' : 'chevrons-left'}"></i>
          </button>
        </div>
      </aside>

      <!-- Main area (its own scroll context) -->
      <div class="flex-1 flex flex-col min-w-0" style="height:100vh;">
        <!-- Topbar -->
        <header class="topbar h-[60px] flex-shrink-0 flex items-center px-6 gap-4">
          ${active === 'leads' ? `
            <div class="relative flex-1 max-w-[420px]">
              <i data-lucide="search" style="width:16px;height:16px;color:#8A8AA0;position:absolute;left:14px;top:50%;transform:translateY(-50%);"></i>
              <input id="topbar-search" class="input pl-10" style="background:var(--surface-3);border-color:var(--chip);" placeholder="Search leads, phone, email, notes..." />
            </div>
          ` : ''}
          <div class="flex-1"></div>
          <button id="lf-theme-toggle" class="theme-toggle" title="Toggle dark mode">
            <i data-lucide="${document.documentElement.classList.contains('dark') ? 'sun' : 'moon'}" style="width:16px;height:16px;color:var(--text-muted);"></i>
          </button>
          <div class="relative" id="lf-notif-menu">
            <button id="lf-notif-btn" class="btn-icon relative" title="Notifications">
              <i data-lucide="bell" style="width:16px;height:16px;color:var(--text-muted);"></i>
              <span id="lf-notif-badge" class="absolute -top-1 -right-1 bg-[#E64B4B] text-white text-[10px] font-bold rounded-full hidden items-center justify-center" style="min-width:16px;height:16px;padding:0 3px;"></span>
            </button>
            <div id="lf-notif-dropdown" class="hidden absolute right-0 mt-2 panel" style="top:100%;width:340px;max-width:90vw;z-index:30;box-shadow:0 8px 28px var(--shadow);">
              <div class="flex items-center justify-between px-4 py-3" style="border-bottom:1px solid var(--border);">
                <span class="text-[13px] font-semibold">Notifications</span>
                <button id="lf-notif-readall" class="text-[12px] font-semibold" style="color:var(--accent);cursor:pointer;">Mark all read</button>
              </div>
              <div id="lf-notif-list" style="max-height:360px;overflow-y:auto;">
                <div class="px-4 py-8 text-center text-[12.5px] text-muted">Loading…</div>
              </div>
            </div>
          </div>
          <div class="relative" id="lf-user-menu">
            <button id="lf-user-btn" class="flex items-center gap-2 pl-2 pr-3 py-1 rounded-lg hover:bg-[#FAFAFC]" style="cursor:pointer;">
              <div id="lf-user-avatar" class="avatar">${LF_DATA.user.initials}</div>
              <div class="leading-tight text-left">
                <div id="lf-user-name" class="text-[13px] font-semibold">${LF_DATA.user.name}</div>
                <div class="text-[11px] text-soft">${LF_DATA.user.role}</div>
              </div>
              <i data-lucide="chevron-down" style="width:14px;height:14px;color:var(--text-muted);margin-left:2px;"></i>
            </button>
            <div id="lf-user-dropdown" class="hidden absolute right-0 mt-2 panel" style="top:100%;min-width:200px;z-index:30;box-shadow:0 8px 28px rgba(0,0,0,.10);">
              <div class="px-4 py-3" style="border-bottom:1px solid var(--border);">
                <div class="text-[11.5px] text-muted">Signed in as</div>
                <div class="text-[13px] font-semibold truncate">${LF_DATA.user.email}</div>
              </div>
              <button id="lf-logout-btn" class="w-full text-left px-4 py-3 hover:bg-[#FAFAFC] text-[13px] font-medium flex items-center gap-2" style="color:#D63333;">
                <i data-lucide="log-out" style="width:14px;height:14px;"></i> Log out
              </button>
            </div>
          </div>
        </header>

        <!-- Page content -->
        <main class="flex-1 p-6 overflow-y-auto min-h-0">
          ${pageContent}
        </main>
      </div>
    </div>
  `;

  // Wire up collapse toggle.
  const btn = document.getElementById('lf-collapse-btn');
  const sidebar = document.getElementById('lf-sidebar');
  btn.addEventListener('click', () => {
    const nowCollapsed = !sidebar.classList.contains('collapsed');
    sidebar.classList.toggle('collapsed', nowCollapsed);
    localStorage.setItem('lf-sidebar-collapsed', nowCollapsed ? '1' : '0');
    btn.setAttribute('title', nowCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
    btn.innerHTML = `<i data-lucide="${nowCollapsed ? 'chevrons-right' : 'chevrons-left'}"></i>`;
    if (window.lucide) lucide.createIcons();
  });

  // Theme toggle (light/dark).
  const themeBtn = document.getElementById('lf-theme-toggle');
  themeBtn.addEventListener('click', () => {
    const nowDark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', nowDark);
    localStorage.setItem('lf-theme', nowDark ? 'dark' : 'light');
    themeBtn.innerHTML = `<i data-lucide="${nowDark ? 'sun' : 'moon'}" style="width:16px;height:16px;color:var(--text-muted);"></i>`;
    if (window.lucide) lucide.createIcons();
  });

  // User menu (dropdown + logout).
  const userBtn = document.getElementById('lf-user-btn');
  const userDropdown = document.getElementById('lf-user-dropdown');
  const logoutBtn = document.getElementById('lf-logout-btn');
  userBtn.addEventListener('click', e => {
    e.stopPropagation();
    userDropdown.classList.toggle('hidden');
  });
  document.addEventListener('click', e => {
    if (!document.getElementById('lf-user-menu').contains(e.target)) {
      userDropdown.classList.add('hidden');
    }
  });
  logoutBtn.addEventListener('click', async () => {
    try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); } catch (e) {}
    window.location.href = '/login.html';
  });

  // Notifications menu (dropdown toggle + outside-click close).
  const notifBtn = document.getElementById('lf-notif-btn');
  const notifDropdown = document.getElementById('lf-notif-dropdown');
  notifBtn.addEventListener('click', e => {
    e.stopPropagation();
    notifDropdown.classList.toggle('hidden');
    userDropdown.classList.add('hidden');
  });
  document.addEventListener('click', e => {
    if (!document.getElementById('lf-notif-menu').contains(e.target)) {
      notifDropdown.classList.add('hidden');
    }
  });

  // Show the profile photo (or initials) in the topbar avatar.
  LF.applyAvatar(document.getElementById('lf-user-avatar'), LF_DATA.user);

  if (window.lucide) lucide.createIcons();

  // Populate notifications from real data (non-blocking).
  loadNotifications();
};

// Render an .avatar element as a photo (if set) or fall back to initials.
LF.applyAvatar = function (el, user) {
  if (!el) return;
  if (user && user.photo) {
    el.textContent = '';
    el.style.backgroundImage = `url('${user.photo}')`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
  } else {
    el.style.backgroundImage = '';
    el.textContent = (user && user.initials) || '?';
  }
};
// Update the stored photo and refresh the topbar avatar.
LF.setUserPhoto = function (photo) {
  LF_DATA.user.photo = photo || '';
  LF.applyAvatar(document.getElementById('lf-user-avatar'), LF_DATA.user);
};

// ---------------------------------------------------------------------------
// Notifications: computed live from the user's real data (no stored events).
//   Tier 1 — overdue calls, calls due soon, tasks due/overdue, meetings soon
//   Tier 2 — hot leads (80+) with no call logged yet
// "Read" state is just a set of notification keys kept in localStorage, pruned
// to whatever currently exists so it can't grow unbounded.
// ---------------------------------------------------------------------------
const NOTIF_SOON_MIN = 60; // "due soon" / "starting soon" window, in minutes

function notifEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function notifTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function notifNowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
// "2:30 PM" -> minutes since midnight, or null.
function notifLabelMin(label) {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(label || '');
  if (!m) return null;
  let h = parseInt(m[1], 10) % 12;
  if (/PM/i.test(m[3])) h += 12;
  return h * 60 + parseInt(m[2], 10);
}
// "14:30" -> minutes; and a 12-hour display helper.
function notifHHMMtoMin(s) { const m = /(\d{1,2}):(\d{2})/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; }
function notifFmtMin(min) {
  let h = Math.floor(min / 60), m = min % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}
function notifReadSet() {
  try { return new Set(JSON.parse(localStorage.getItem('lf-notifs-read') || '[]')); } catch (e) { return new Set(); }
}
// Notification category preference (Settings → Notifications). On unless turned off.
function notifPref(key) {
  try { const p = JSON.parse(localStorage.getItem('lf-notif-prefs') || '{}'); return p[key] !== false; }
  catch (e) { return true; }
}
function notifSaveRead(set) {
  try { localStorage.setItem('lf-notifs-read', JSON.stringify([...set])); } catch (e) {}
}

async function loadNotifications() {
  const get = async (u) => { try { const r = await fetch(u, { credentials: 'same-origin' }); return r.ok ? await r.json() : []; } catch (e) { return []; } };
  const [queue, tasks, events, leads, calls, invites, assignments, outcomes] = await Promise.all([
    get('/api/call-queue'), get('/api/tasks'), get('/api/events'), get('/api/leads'), get('/api/call-log'),
    get('/api/invites'), get('/api/assignments'), get('/api/assignments/outcomes')
  ]);

  const todayKey = notifTodayKey();
  const nowMin = notifNowMin();
  const items = [];

  // 0) Team invitations — actionable (Accept / Decline).
  invites.forEach(inv => {
    items.push({ key: `invite-${inv.id}`, sort: -2, type: 'invite', actionId: inv.id, icon: 'users', color: '#2255a3',
      text: `${notifEsc(inv.leaderName)} invited you to their team`, sub: 'Accept or decline below' });
  });

  // 0b) Incoming lead assignments — actionable (Accept / Decline).
  assignments.forEach(a => {
    items.push({ key: `assign-${a.id}`, sort: -1.5, type: 'assignment', actionId: a.id, icon: 'user-check', color: '#2B57D9',
      text: `${notifEsc(a.fromName)} assigned you a lead: ${notifEsc(a.leadName)}`, sub: 'Accept or decline below' });
  });

  // 0c) Assignment outcomes for a team leader (member accepted/declined).
  outcomes.forEach(o => {
    const acc = o.status === 'accepted';
    items.push({ key: `outcome-${o.id}`, sort: -1, type: 'outcome', actionId: o.id,
      icon: acc ? 'check-circle-2' : 'x-circle', color: acc ? '#138A4B' : '#D63333',
      text: `${notifEsc(o.memberName)} ${acc ? 'accepted' : 'declined'} the lead: ${notifEsc(o.leadName)}`, sub: '' });
  });

  // 1) Call queue — overdue + due soon (date-aware; future-dated calls are skipped).
  if (notifPref('bell.calls')) queue.forEach(c => {
    const t = notifLabelMin(c.time);
    if (t == null) return;
    const d = (c.date && c.date.trim()) || todayKey;
    if (d > todayKey) return; // scheduled for a future day
    const overdue = d < todayKey || t < nowMin;
    if (overdue) {
      items.push({ key: `call-overdue-${c.id}`, sort: 0, icon: 'phone-missed', color: '#D63333',
        text: `Overdue call: ${notifEsc(c.name)}`, sub: `Was due ${notifEsc(c.time)}${d < todayKey ? ' · ' + d : ''}`, href: 'calls.html' });
    } else if (d === todayKey && t - nowMin <= NOTIF_SOON_MIN) {
      items.push({ key: `call-soon-${c.id}`, sort: 2, icon: 'phone', color: '#2255a3',
        text: `Call ${notifEsc(c.name)} soon`, sub: `${notifEsc(c.time)} · in ${t - nowMin} min`, href: 'calls.html' });
    }
  });

  // 2) Tasks — due today or overdue, not done.
  if (notifPref('bell.tasks')) tasks.forEach(t => {
    if (t.status === 'done' || !t.due) return;
    if (t.due < todayKey) {
      items.push({ key: `task-${t.id}`, sort: 1, icon: 'check-square', color: '#D63333',
        text: notifEsc(t.title), sub: `Task overdue · was due ${notifEsc(t.due)}`, href: 'tasks.html' });
    } else if (t.due === todayKey) {
      items.push({ key: `task-${t.id}`, sort: 3, icon: 'check-square', color: '#B07A00',
        text: notifEsc(t.title), sub: 'Task due today', href: 'tasks.html' });
    }
  });

  // 3) Calendar — meetings starting within the next hour today.
  if (notifPref('bell.meetings')) events.forEach(ev => {
    if (ev.date !== todayKey) return;
    const s = notifHHMMtoMin(ev.start);
    if (s == null || s < nowMin || s - nowMin > NOTIF_SOON_MIN) return;
    items.push({ key: `event-${ev.id}`, sort: 4, icon: 'calendar', color: '#2B57D9',
      text: notifEsc(ev.title), sub: `${notifFmtMin(s)} · in ${s - nowMin} min`, href: 'calendar.html' });
  });

  // 4) Hot leads (80+) with no call logged yet.
  if (notifPref('bell.hot_leads')) {
    const calledNames = new Set(calls.map(c => (c.name || '').toLowerCase()));
    leads.filter(l => l.score >= 80 && !calledNames.has((l.name || '').toLowerCase()))
      .slice(0, 5)
      .forEach(l => {
        items.push({ key: `lead-hot-${l.id}`, sort: 5, icon: 'flame', color: '#E0721B',
          text: `Hot lead: ${notifEsc(l.name)}`, sub: `Score ${l.score} · no call logged yet`, href: 'leads.html' });
      });
  }

  items.sort((a, b) => a.sort - b.sort);

  // Prune the read set to current keys, then count unread.
  const currentKeys = new Set(items.map(i => i.key));
  let read = notifReadSet();
  read = new Set([...read].filter(k => currentKeys.has(k)));
  notifSaveRead(read);
  renderNotifications(items, read);
}

// Respond to a team invitation from the bell; reload on accept so the new
// role/team is reflected everywhere.
async function respondInvite(id, action, btn) {
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/invites/' + id + '/respond', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ action })
    });
    if (!res.ok) { if (btn) btn.disabled = false; window.alert('Could not respond to the invitation.'); return; }
  } catch (e) { if (btn) btn.disabled = false; window.alert('Network error.'); return; }
  if (action === 'accept') { window.location.reload(); return; }
  loadNotifications();
}

// Member responds to a lead assignment. On accept, reload the Leads page so the
// newly received lead shows up; otherwise just refresh the bell.
async function respondAssignment(id, action, btn) {
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/assignments/' + id + '/respond', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ action })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (btn) btn.disabled = false;
      window.alert(body.error || 'Could not respond to the assignment.');
      loadNotifications();
      return;
    }
  } catch (e) { if (btn) btn.disabled = false; window.alert('Network error.'); return; }
  if (action === 'accept' && /leads\.html$/.test(window.location.pathname)) { window.location.reload(); return; }
  loadNotifications();
}

// Leader dismisses an accept/decline outcome notification.
async function dismissOutcome(id, btn) {
  if (btn) btn.disabled = true;
  try { await fetch('/api/assignments/outcomes/' + id + '/seen', { method: 'POST', credentials: 'same-origin' }); } catch (e) {}
  loadNotifications();
}

function renderNotifications(items, read) {
  const list = document.getElementById('lf-notif-list');
  const badge = document.getElementById('lf-notif-badge');
  const readAll = document.getElementById('lf-notif-readall');
  if (!list || !badge) return;

  const unread = items.filter(i => !read.has(i.key)).length;
  if (unread > 0) {
    badge.textContent = unread > 9 ? '9+' : String(unread);
    badge.classList.remove('hidden');
    badge.classList.add('flex');
  } else {
    badge.classList.add('hidden');
    badge.classList.remove('flex');
  }

  if (items.length === 0) {
    list.innerHTML = `<div class="px-4 py-10 text-center text-[12.5px] text-muted">You're all caught up. 🎉</div>`;
    if (readAll) readAll.style.visibility = 'hidden';
    return;
  }
  if (readAll) readAll.style.visibility = 'visible';

  const iconChip = (i) => `<span class="stat-icon flex-shrink-0" style="width:30px;height:30px;border-radius:8px;background:${i.color}1A;">
      <i data-lucide="${i.icon}" style="width:15px;height:15px;color:${i.color};"></i>
    </span>`;

  list.innerHTML = items.map(i => {
    const isUnread = !read.has(i.key);
    const bg = isUnread ? 'background:rgba(34,85,163,.05);' : '';
    // Actionable items (team invites / lead assignments) render with buttons.
    if (i.type === 'invite' || i.type === 'assignment') {
      const acc = i.type === 'invite' ? 'data-invite-accept' : 'data-assign-accept';
      const rej = i.type === 'invite' ? 'data-invite-reject' : 'data-assign-reject';
      return `
        <div class="px-4 py-3" style="border-bottom:1px solid var(--border-soft);${bg}">
          <div class="flex items-start gap-3">
            ${iconChip(i)}
            <div class="flex-1 min-w-0">
              <div class="text-[13px] font-medium leading-snug">${i.text}</div>
              <div class="text-[11.5px] text-muted mt-0.5">${i.sub}</div>
              <div class="flex items-center gap-2 mt-2">
                <button ${acc}="${i.actionId}" class="btn-primary" style="padding:5px 12px;font-size:12px;">Accept</button>
                <button ${rej}="${i.actionId}" class="btn-secondary" style="padding:5px 12px;font-size:12px;">Decline</button>
              </div>
            </div>
          </div>
        </div>`;
    }
    if (i.type === 'outcome') {
      return `
        <div class="px-4 py-3" style="border-bottom:1px solid var(--border-soft);${bg}">
          <div class="flex items-start gap-3">
            ${iconChip(i)}
            <div class="flex-1 min-w-0">
              <div class="text-[13px] font-medium leading-snug">${i.text}</div>
              <div class="mt-2"><button data-outcome-seen="${i.actionId}" class="btn-secondary" style="padding:5px 12px;font-size:12px;">Dismiss</button></div>
            </div>
          </div>
        </div>`;
    }
    return `
      <a href="${i.href}" data-notif-key="${i.key}" class="flex items-start gap-3 px-4 py-3 hover:bg-[#FAFAFC]"
         style="border-bottom:1px solid var(--border-soft);${bg}">
        ${iconChip(i)}
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-medium leading-snug">${i.text}</div>
          <div class="text-[11.5px] text-muted mt-0.5">${i.sub}</div>
        </div>
        ${isUnread ? '<span class="flex-shrink-0 rounded-full" style="width:7px;height:7px;background:#2255a3;margin-top:5px;"></span>' : ''}
      </a>`;
  }).join('');

  // Clicking a row marks just that one read (navigation proceeds via the <a>).
  list.querySelectorAll('[data-notif-key]').forEach(a => a.addEventListener('click', () => {
    const r = notifReadSet(); r.add(a.getAttribute('data-notif-key')); notifSaveRead(r);
  }));

  // Team-invite Accept / Decline.
  list.querySelectorAll('[data-invite-accept]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation(); respondInvite(b.getAttribute('data-invite-accept'), 'accept', b);
  }));
  list.querySelectorAll('[data-invite-reject]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation(); respondInvite(b.getAttribute('data-invite-reject'), 'reject', b);
  }));
  // Lead-assignment Accept / Decline.
  list.querySelectorAll('[data-assign-accept]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation(); respondAssignment(b.getAttribute('data-assign-accept'), 'accept', b);
  }));
  list.querySelectorAll('[data-assign-reject]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation(); respondAssignment(b.getAttribute('data-assign-reject'), 'reject', b);
  }));
  // Leader outcome dismiss.
  list.querySelectorAll('[data-outcome-seen]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation(); dismissOutcome(b.getAttribute('data-outcome-seen'), b);
  }));

  // Mark all read.
  if (readAll) readAll.onclick = () => {
    const r = notifReadSet(); items.forEach(i => r.add(i.key)); notifSaveRead(r);
    renderNotifications(items, r);
    if (window.lucide) lucide.createIcons();
  };

  if (window.lucide) lucide.createIcons();
}

// Tiny helper used by pages.
LF.fmtNum = (n) => n.toLocaleString('en-US');

// Build a tel: URI from a phone number (US default: prefix 1 for 10 digits).
// Returns '' when there are no digits, so callers can disable the button.
LF.telLink = function (phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) d = '1' + d;
  return d ? 'tel:+' + d : '';
};

// Parse CSV text into { headers, objects } (quoted fields/newlines safe).
LF.csvToObjects = function (text) {
  text = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const grid = [];
  let cur = [], field = '', inQuotes = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQuotes = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { cur.push(field); field = ''; i++; continue; }
    if (c === '\n') { cur.push(field); grid.push(cur); cur = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || cur.length > 0) { cur.push(field); grid.push(cur); }
  const rows = grid.filter(r => r.some(c => String(c).trim() !== ''));
  if (rows.length === 0) return { headers: [], objects: [] };
  const seen = {};
  const headers = rows[0].map(h => {
    let name = String(h).trim() || 'Column';
    if (seen[name] == null) { seen[name] = 0; return name; }
    seen[name]++; return `${name} (${seen[name]})`;
  });
  const objects = rows.slice(1).map(r => {
    const o = {};
    headers.forEach((h, idx) => { o[h] = r[idx] != null ? String(r[idx]).trim() : ''; });
    return o;
  });
  return { headers, objects };
};

// Refreshes the topbar avatar + name after profile changes save.
LF.refreshUserDisplay = function (user) {
  LF_DATA.user = Object.assign({}, LF_DATA.user, {
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    title: user.title || '',
    bio:   user.bio   || '',
    initials: getInitials(user.name)
  });
  const nameEl = document.getElementById('lf-user-name');
  if (nameEl) nameEl.textContent = LF_DATA.user.name;
  LF.applyAvatar(document.getElementById('lf-user-avatar'), LF_DATA.user);
};
LF.scorePill = (score) => {
  if (score >= 80) return 'pill-green';
  if (score >= 60) return 'pill-yellow';
  return 'pill-red';
};
LF.timelinePill = (t) => {
  if (t === 'Buying Immediately') return 'pill-green';
  if (t === '1-3 Months') return 'pill-yellow';
  if (t === '3-6 Months') return 'pill-red';
  if (t === '6+ Months') return 'pill-blue';
  return 'pill-gray';
};
LF.statusPill = (s) => {
  if (['Active','Connected','Online','Completed'].includes(s)) return 'pill-green';
  if (['Scheduled','Away','High'].includes(s)) return 'pill-yellow';
  if (['Paused','Offline','Not Connected','Low'].includes(s)) return 'pill-gray';
  if (['Missed', 'No Answer'].includes(s)) return 'pill-red';
  return 'pill-blue';
};
