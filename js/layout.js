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
  // Home: dashboard, tasks, calendar, reports grouped together.
  { id: 'home',         label: 'Home',         icon: 'house', group: true, children: [
    { id: 'dashboard',  label: 'Dashboard',    icon: 'layout-dashboard', href: 'index.html' },
    { id: 'tasks',      label: 'Tasks',        icon: 'check-square',     href: 'tasks.html' },
    { id: 'calendar',   label: 'Calendar',     icon: 'calendar',         href: 'calendar.html' },
    { id: 'reports',    label: 'Reports',      icon: 'bar-chart-3',      href: 'reports.html' }
  ] },
  // People: leads, contacts, realtors, clients grouped together.
  { id: 'people',       label: 'People',       icon: 'users', group: true, children: [
    { id: 'leads',      label: 'Leads',        icon: 'user-plus',        href: 'leads.html' },
    { id: 'contacts',   label: 'All Contacts', icon: 'contact',          href: 'contacts.html' },
    { id: 'realtors',   label: 'Realtors',     icon: 'home',             href: 'realtors.html' },
    { id: 'clients',    label: 'Past Clients', icon: 'user-check',       href: 'clients.html' }
  ] },
  // Outreach channels grouped under a collapsible "Connect" section.
  { id: 'connect',      label: 'Connect',      icon: 'share-2', group: true, children: [
    { id: 'calls',      label: 'Calls',        icon: 'phone',            href: 'calls.html' },
    { id: 'messages',   label: 'Messages',     icon: 'message-square',   href: 'messages.html' },
    { id: 'campaigns',  label: 'Campaigns',    icon: 'megaphone',        href: 'campaigns.html' }
  ] },
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
    mustChangePassword: !!user.mustChangePassword,
    initials: getInitials(user.name)
  };

  const pageContent = root.innerHTML;
  const collapsed = localStorage.getItem('lf-sidebar-collapsed') === '1';

  const navLink = (item, isChild) => `
    <a href="${item.href}" class="nav-item ${isChild ? 'nav-subitem' : ''} ${active === item.id ? 'active' : ''}" title="${item.label}">
      <i data-lucide="${item.icon}"></i>
      <span class="nav-label">${item.label}</span>
      ${item.badge ? `<span class="badge">${item.badge}</span>` : ''}
    </a>`;
  // Builds the nav markup. When the sidebar is collapsed, groups flatten into
  // plain icons so every page stays reachable.
  function navHTML(isCollapsed) {
    return NAV_ITEMS.map(item => {
      if (!item.group) return navLink(item, false);
      if (isCollapsed) return item.children.map(c => navLink(c, false)).join('');
      const childActive = item.children.some(c => c.id === active);
      const open = childActive || localStorage.getItem('lf-nav-' + item.id) === '1';
      return `
        <div class="nav-group ${open ? 'open' : ''}" data-group="${item.id}">
          <div class="nav-item nav-group-header" data-group-toggle="${item.id}" title="${item.label}" role="button" tabindex="0">
            <i data-lucide="${item.icon}"></i>
            <span class="nav-label">${item.label}</span>
            <i data-lucide="chevron-down" class="nav-chevron" style="margin-left:auto;width:14px;height:14px;opacity:.6;transition:transform .15s;"></i>
          </div>
          <div class="nav-group-children" style="${open ? '' : 'display:none;'}">
            ${item.children.map(c => navLink(c, true)).join('')}
          </div>
        </div>`;
    }).join('');
  }
  const nav = navHTML(collapsed);

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
        <nav id="lf-nav" class="px-3 mt-2 flex-1 flex flex-col gap-1 overflow-y-auto min-h-0">
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
  // Expand/collapse a nav group (e.g. "Connect") and remember the state.
  function bindNavGroups() {
    document.querySelectorAll('#lf-nav [data-group-toggle]').forEach(header => {
      header.addEventListener('click', () => {
        const id = header.getAttribute('data-group-toggle');
        const group = header.closest('.nav-group');
        const children = group.querySelector('.nav-group-children');
        const chevron = header.querySelector('.nav-chevron');
        const willOpen = children.style.display === 'none';
        children.style.display = willOpen ? '' : 'none';
        group.classList.toggle('open', willOpen);
        if (chevron) chevron.style.transform = willOpen ? 'rotate(180deg)' : '';
        localStorage.setItem('lf-nav-' + id, willOpen ? '1' : '0');
      });
    });
    // Reflect the initial open state on chevrons.
    document.querySelectorAll('#lf-nav .nav-group.open .nav-chevron').forEach(c => { c.style.transform = 'rotate(180deg)'; });
  }
  bindNavGroups();

  const btn = document.getElementById('lf-collapse-btn');
  const sidebar = document.getElementById('lf-sidebar');
  btn.addEventListener('click', () => {
    const nowCollapsed = !sidebar.classList.contains('collapsed');
    sidebar.classList.toggle('collapsed', nowCollapsed);
    localStorage.setItem('lf-sidebar-collapsed', nowCollapsed ? '1' : '0');
    btn.setAttribute('title', nowCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
    btn.innerHTML = `<i data-lucide="${nowCollapsed ? 'chevrons-right' : 'chevrons-left'}"></i>`;
    // Re-render the nav so groups flatten (collapsed) or restore (expanded).
    const navEl = document.getElementById('lf-nav');
    if (navEl) { navEl.innerHTML = navHTML(nowCollapsed); }
    if (window.lucide) lucide.createIcons();
    bindNavGroups();
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

  // Floating "how the score is calculated" tooltip (set up once).
  LF.initScoreTips();
};

// Let pages re-run the notifications bell (e.g. after changing a password).
LF.refreshNotifications = function () { try { loadNotifications(); } catch (e) {} };

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

  // 0) Must change a temporary password — persistent until they set a new one.
  if (window.LF_DATA && LF_DATA.user && LF_DATA.user.mustChangePassword) {
    items.push({ key: 'must-change-password', sort: -3, type: 'security', persist: true,
      icon: 'key-round', color: '#D63333', text: 'Set a new password',
      sub: 'You’re using a temporary password — choose a secure one',
      href: 'settings.html#changepassword' });
  }

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

  // 4) Hot leads (5 stars) with no call logged yet.
  if (notifPref('bell.hot_leads')) {
    const calledNames = new Set(calls.map(c => (c.name || '').toLowerCase()));
    leads.filter(l => LF.scoreStars(l.score) === 5 && !calledNames.has((l.name || '').toLowerCase()))
      .slice(0, 5)
      .forEach(l => {
        items.push({ key: `lead-hot-${l.id}`, sort: 5, icon: 'flame', color: '#E0721B',
          text: `Hot lead: ${notifEsc(l.name)}`, sub: `${LF.scoreStars(l.score)}/5 stars · no call logged yet`, href: 'leads.html' });
      });
  }

  items.sort((a, b) => a.sort - b.sort);

  // Prune the read set to current keys, then count unread.
  const currentKeys = new Set(items.map(i => i.key));
  let read = notifReadSet();
  read = new Set([...read].filter(k => currentKeys.has(k)));

  // Auto-clear on a new day: computed alerts (overdue calls/tasks, due-soon,
  // hot leads) carried over from a previous day are marked read so they don't
  // keep nagging. Genuinely-pending actions (invites/assignments/outcomes) stay.
  let lastDay = null;
  try { lastDay = localStorage.getItem('lf-notifs-day'); } catch (e) {}
  if (lastDay !== todayKey) {
    items.forEach(i => { if (!i.persist && !['invite', 'assignment', 'outcome'].includes(i.type)) read.add(i.key); });
    try { localStorage.setItem('lf-notifs-day', todayKey); } catch (e) {}
  }

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

  // Only unread notifications are shown — once read (or cleared), they disappear.
  // Persistent items (e.g. "set a new password") always show until resolved.
  const shown = items.filter(i => i.persist || !read.has(i.key));
  const unread = shown.length;
  if (unread > 0) {
    badge.textContent = unread > 9 ? '9+' : String(unread);
    badge.classList.remove('hidden');
    badge.classList.add('flex');
  } else {
    badge.classList.add('hidden');
    badge.classList.remove('flex');
  }

  if (shown.length === 0) {
    list.innerHTML = `<div class="px-4 py-10 text-center text-[12.5px] text-muted">You're all caught up. 🎉</div>`;
    if (readAll) readAll.style.visibility = 'hidden';
    return;
  }
  if (readAll) readAll.style.visibility = 'visible';

  const iconChip = (i) => `<span class="stat-icon flex-shrink-0" style="width:30px;height:30px;border-radius:8px;background:${i.color}1A;">
      <i data-lucide="${i.icon}" style="width:15px;height:15px;color:${i.color};"></i>
    </span>`;

  list.innerHTML = shown.map(i => {
    const isUnread = true; // only unread items are rendered
    const bg = 'background:rgba(34,85,163,.05);';
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

  // Mark all read (persistent items stay — they're resolved by acting on them).
  if (readAll) readAll.onclick = () => {
    const r = notifReadSet(); items.forEach(i => { if (!i.persist) r.add(i.key); }); notifSaveRead(r);
    renderNotifications(items, r);
    if (window.lucide) lucide.createIcons();
  };

  if (window.lucide) lucide.createIcons();
}

// Tiny helper used by pages.
LF.fmtNum = (n) => n.toLocaleString('en-US');

// ----- Call timer -----
// Times a phone call: started the instant the user taps a "Call" action, read
// back when they submit the log-call form. Kept in sessionStorage so it survives
// the tab leaving for the dialer and coming back. m:ss is the call's duration.
LF.callTimer = {
  start() { try { sessionStorage.setItem('lf-call-start', String(Date.now())); } catch (e) {} },
  _get()  { try { const v = sessionStorage.getItem('lf-call-start'); return v ? Number(v) : null; } catch (e) { return null; } },
  active() { return this._get() != null; },
  elapsedSec() { const s = this._get(); return s ? Math.max(0, Math.round((Date.now() - s) / 1000)) : 0; },
  label() { const s = this.elapsedSec(); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; },
  clear() { try { sessionStorage.removeItem('lf-call-start'); } catch (e) {} }
};

// Drive a log-call modal's duration field live from the call timer. While a call
// is being timed, the field auto-fills (read-only) and ticks every second, except
// when the outcome is No Answer / Voicemail (no conversation → left blank).
// Returns a stop() to call when the modal closes.
LF.startCallDurationTimer = function (form) {
  if (!form) return function () {};
  const dur = form.elements['duration'];
  const outcomeEl = form.elements['outcome'];
  if (!dur || !LF.callTimer.active()) return function () {};
  dur.readOnly = true;
  dur.style.background = 'var(--surface-3)';
  dur.title = 'Timing the call automatically';
  const tick = () => {
    const o = outcomeEl ? outcomeEl.value : 'Connected';
    if (o === 'No Answer' || o === 'Voicemail' || o === 'Missed') return; // handled by the form's sync
    dur.value = LF.callTimer.label();
  };
  tick();
  const id = setInterval(tick, 1000);
  return function () { clearInterval(id); dur.readOnly = false; dur.style.background = ''; dur.title = ''; };
};

// Build a tel: URI from a phone number (US default: prefix 1 for 10 digits).
// Returns '' when there are no digits, so callers can disable the button.
// Normalize any common phone format to an E.164-style "+<digits>" number.
// Accepts: +xxxxxxxxxx (E.164), +1-xxx-xxx-xxxx, +1 (xxx) xxx-xxxx,
// xxx-xxx-xxxx, (xxx) xxx-xxxx, and similar — punctuation/spaces are ignored.
LF.normalizePhone = function (phone) {
  const raw = String(phone || '').trim();
  const hadPlus = raw.startsWith('+');
  const d = raw.replace(/\D/g, '');
  if (!d) return '';
  if (hadPlus) return '+' + d;                          // already international — trust it
  if (d.length === 10) return '+1' + d;                 // bare US 10-digit
  if (d.length === 11 && d[0] === '1') return '+' + d;  // US with country code
  return '+' + d;                                       // other lengths — best effort
};
LF.telLink = function (phone) { const n = LF.normalizePhone(phone); return n ? 'tel:' + n : ''; };
LF.smsLink = function (phone) { const n = LF.normalizePhone(phone); return n ? 'sms:' + n : ''; };
LF.waLink  = function (phone) { const n = LF.normalizePhone(phone); return n ? 'https://wa.me/' + n.replace(/\D/g, '') : ''; };

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

// ----- Lead score shown as a 1–5 star rating (1 = lowest) -----
LF.scoreStars = (score) => Math.min(5, Math.max(1, Math.ceil((Number(score) || 0) / 20)));
// Renders five stars (filled up to the rating) + the "n/5" number. When a lead
// object with scoreBreakdown is passed, the element carries a hover tooltip that
// explains how the score is calculated.
LF.scoreStarsHTML = function (lead, size) {
  const score = (lead && typeof lead === 'object') ? lead.score : lead;
  const n = LF.scoreStars(score);
  size = size || 14;
  const star = (on) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${on ? '#F5A623' : 'none'}" stroke="${on ? '#F5A623' : '#C4C4D4'}" stroke-width="1.8" style="flex-shrink:0;pointer-events:none;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  let stars = '';
  for (let i = 1; i <= 5; i++) stars += star(i <= n);
  let attrs = 'style="display:inline-flex;align-items:center;gap:1px;vertical-align:middle;cursor:default;"';
  if (lead && typeof lead === 'object' && Array.isArray(lead.scoreBreakdown)) {
    const payload = encodeURIComponent(JSON.stringify({ stars: n, breakdown: lead.scoreBreakdown, note: lead.scoreNote || '' }));
    attrs = `data-score-tip="${payload}" ${attrs}`;
  }
  return `<span ${attrs}>${stars}<span style="font-size:11px;color:var(--text-muted);margin-left:4px;">${n}/5</span></span>`;
};
LF.scoreTipHTML = function (data) {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = (data.breakdown || []).map(p => {
    const tip = p.tip ? `<div style="color:#B07A00;font-size:10.5px;margin-top:1px;">↑ ${esc(p.tip)}</div>` : '';
    return `<div style="padding:5px 0;border-bottom:1px solid var(--border-soft);">
      <div style="display:flex;justify-content:space-between;gap:12px;">
        <span style="font-weight:600;">${esc(p.label)}</span>
        <span style="color:var(--text-muted);white-space:nowrap;">${p.points}/${p.max} pts</span>
      </div>
      <div style="font-size:11px;color:var(--text-muted);">${esc(p.value)}</div>${tip}
    </div>`;
  }).join('');
  const note = data.note ? `<div style="font-size:10.5px;color:#2255a3;margin-top:6px;">${esc(data.note)}</div>` : '';
  return `<div style="font-size:12.5px;font-weight:700;margin-bottom:5px;">Lead score: ${data.stars}/5 ★</div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">How it's calculated:</div>
    ${rows}
    <div style="font-size:10.5px;color:var(--text-muted);margin-top:6px;">Amber tips show how to raise the score.</div>${note}`;
};
// One-time: a floating tooltip + delegated hover, shared across all pages.
LF.initScoreTips = function () {
  if (LF._scoreTipsReady) return;
  LF._scoreTipsReady = true;
  const tip = document.createElement('div');
  tip.id = 'lf-score-tip';
  tip.className = 'hidden';
  tip.style.cssText = 'position:fixed;z-index:80;width:250px;max-width:88vw;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 28px var(--shadow);padding:10px 12px;pointer-events:none;';
  document.body.appendChild(tip);
  const place = (el) => {
    const r = el.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    let left = r.left;
    if (left + tr.width > window.innerWidth - 8) left = window.innerWidth - tr.width - 8;
    if (left < 8) left = 8;
    let top = r.bottom + 8;
    if (top + tr.height > window.innerHeight - 8) top = r.top - tr.height - 8; // flip above
    tip.style.left = left + 'px';
    tip.style.top = Math.max(8, top) + 'px';
  };
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('[data-score-tip]');
    if (!el) return;
    let data; try { data = JSON.parse(decodeURIComponent(el.getAttribute('data-score-tip'))); } catch (err) { return; }
    tip.innerHTML = LF.scoreTipHTML(data);
    tip.classList.remove('hidden');
    place(el);
  });
  document.addEventListener('mouseout', (e) => {
    const el = e.target.closest && e.target.closest('[data-score-tip]');
    if (el) tip.classList.add('hidden');
  });
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
  if (['Scheduled','Away','High','Sending'].includes(s)) return 'pill-yellow';
  if (['Paused','Offline','Not Connected','Low'].includes(s)) return 'pill-gray';
  if (['Missed', 'No Answer'].includes(s)) return 'pill-red';
  return 'pill-blue';
};
