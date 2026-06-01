// Injects the shared sidebar + topbar into every page.
// Each page calls LF.renderLayout({ active: 'dashboard' }) after DOM is ready.

window.LF = window.LF || {};

// Apply the saved theme as early as possible (the inline <head> script in each
// page is the primary no-flash guard; this is a fallback).
try { if (localStorage.getItem('lf-theme') === 'dark') document.documentElement.classList.add('dark'); } catch (e) {}

const NAV_ITEMS = [
  { id: 'dashboard',    label: 'Dashboard',    icon: 'layout-dashboard', href: 'index.html' },
  { id: 'leads',        label: 'Leads',        icon: 'users',            href: 'leads.html' },
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
    role:  'Member',
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
          <button class="btn-icon relative">
            <i data-lucide="bell" style="width:16px;height:16px;color:var(--text-muted);"></i>
            <span class="absolute -top-1 -right-1 bg-[#E64B4B] text-white text-[10px] font-bold rounded-full w-[16px] h-[16px] flex items-center justify-center">3</span>
          </button>
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

  if (window.lucide) lucide.createIcons();
};

// Tiny helper used by pages.
LF.fmtNum = (n) => n.toLocaleString('en-US');

// Refreshes the topbar avatar + name after profile changes save.
LF.refreshUserDisplay = function (user) {
  LF_DATA.user = {
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    title: user.title || '',
    bio:   user.bio   || '',
    role:  'Member',
    initials: getInitials(user.name)
  };
  const avatar = document.getElementById('lf-user-avatar');
  const nameEl = document.getElementById('lf-user-name');
  if (avatar) avatar.textContent = LF_DATA.user.initials;
  if (nameEl) nameEl.textContent = LF_DATA.user.name;
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
  if (['Missed'].includes(s)) return 'pill-red';
  return 'pill-blue';
};
