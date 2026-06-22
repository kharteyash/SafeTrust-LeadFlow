// Realtor portal: a sandboxed, sidebar-driven app for realtors. Sections switch
// client-side (hash routing) so the realtor stays on the single allowed page.
// Section contents are placeholders for now — to be filled in one by one.
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function initials(name) { return (name || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?'; }
  function show(id, on) { const el = document.getElementById(id); if (el) el.classList.toggle('hidden', !on); }
  function api(url, opts) { return fetch(url, Object.assign({ credentials: 'same-origin' }, opts || {})); }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }
  function normPhone(p) {
    const raw = String(p || '').trim(); const had = raw.startsWith('+'); const d = raw.replace(/\D/g, '');
    if (!d) return ''; if (had) return '+' + d; if (d.length === 10) return '+1' + d; if (d.length === 11 && d[0] === '1') return '+' + d; return '+' + d;
  }
  function telLink(p) { const n = normPhone(p); return n ? 'tel:' + n : ''; }
  function smsLink(p) { const n = normPhone(p); return n ? 'sms:' + n : ''; }
  function waLink(p) { const n = normPhone(p); return n ? 'https://wa.me/' + n.replace(/\D/g, '') : ''; }
  function gmailCompose(to) {
    const compose = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to);
    return 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(compose);
  }

  const SECTIONS = [
    { id: 'home',     label: 'Home',         icon: 'layout-dashboard' },
    { id: 'leads',    label: 'Leads',        icon: 'user-plus' },
    { id: 'clients',  label: 'Past Clients', icon: 'user-check' },
    { id: 'contacts', label: 'All Contacts', icon: 'contact' },
    { id: 'calls',    label: 'Calls',        icon: 'phone' },
    { id: 'tasks',    label: 'Follow-ups',   icon: 'list-checks' },
    { id: 'settings', label: 'Settings',     icon: 'settings' }
  ];

  let me = null;
  let active = 'home';
  let homeBadge = 0;

  // ----- Sidebar + routing -----
  function renderNav() {
    document.getElementById('rp-nav').innerHTML = SECTIONS.map(s => {
      const badge = (s.id === 'home' && homeBadge > 0)
        ? `<span class="ml-auto bg-[#E64B4B] text-white text-[10px] font-bold rounded-full flex items-center justify-center" style="min-width:18px;height:18px;padding:0 5px;">${homeBadge > 9 ? '9+' : homeBadge}</span>`
        : '';
      return `
      <a href="#${s.id}" class="nav-item ${active === s.id ? 'active' : ''}" data-section="${s.id}" title="${s.label}">
        <i data-lucide="${s.icon}"></i>
        <span class="nav-label">${s.label}</span>
        ${badge}
      </a>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
  }

  function placeholder(title, blurb) {
    return `
      <div class="mb-5">
        <h1 class="text-[24px] font-bold tracking-tight">${esc(title)}</h1>
        <p class="text-[13.5px] text-muted mt-1">${esc(blurb)}</p>
      </div>
      <div class="panel p-10 text-center">
        <div class="mx-auto mb-3 stat-icon" style="background:var(--surface-3);width:48px;height:48px;border-radius:12px;">
          <i data-lucide="sparkles" style="width:22px;height:22px;color:#8A8AA0;"></i>
        </div>
        <div class="text-[14px] font-semibold mb-1">Coming soon</div>
        <div class="text-[13px] text-muted">This section is ready to be built out.</div>
      </div>`;
  }

  function renderSettings() {
    const tempBanner = (me && me.mustChangePassword) ? `
      <div class="rounded-lg p-3 mb-4 text-[12.5px] max-w-[520px]" style="border:1px solid #E8C36A;background:#FBF4E2;color:#7A5A00;">
        <div class="flex items-start gap-2">
          <i data-lucide="key-round" style="width:14px;height:14px;flex-shrink:0;margin-top:1px;"></i>
          <div>You're signed in with a <b>temporary password</b>. Set your own below — enter the temporary password as your current password.</div>
        </div>
      </div>` : '';
    return `
      <div class="mb-5">
        <h1 class="text-[24px] font-bold tracking-tight">Settings</h1>
        <p class="text-[13.5px] text-muted mt-1">Manage your account.</p>
      </div>
      ${tempBanner}
      <div class="panel p-6 max-w-[520px] mb-5">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h3 class="text-[15px] font-semibold mb-1">Automatic follow-ups</h3>
            <p class="text-[12.5px] text-muted">When on, we'll add follow-up reminders for you — a call task for every new lead, and a retry when a call goes to voicemail or no-answer. You can edit or delete any of them.</p>
          </div>
          <button id="rp-auto-toggle" role="switch" aria-checked="false" class="flex-shrink-0" style="position:relative;width:44px;height:26px;border-radius:13px;border:none;background:var(--border-strong);cursor:pointer;transition:background .15s;">
            <span id="rp-auto-knob" style="position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .15s;"></span>
          </button>
        </div>
        <div id="rp-auto-msg" class="text-[12px] font-medium mt-2"></div>
      </div>
      <div class="panel p-6 max-w-[520px]">
        <h3 class="text-[15px] font-semibold mb-1">Change password</h3>
        <p class="text-[12.5px] text-muted mb-4">Update the password you use to sign in.</p>
        <div class="flex flex-col gap-3">
          <div>
            <label class="text-[12px] font-semibold text-muted">Current password</label>
            <input id="rp-cp-cur" type="password" autocomplete="current-password" class="input mt-1" placeholder="••••••••" />
          </div>
          <div>
            <label class="text-[12px] font-semibold text-muted">New password</label>
            <input id="rp-cp-new" type="password" autocomplete="new-password" class="input mt-1" placeholder="At least 6 characters" />
          </div>
          <div>
            <label class="text-[12px] font-semibold text-muted">Confirm new password</label>
            <input id="rp-cp-new2" type="password" autocomplete="new-password" class="input mt-1" placeholder="Repeat new password" />
          </div>
          <div id="rp-cp-msg" class="text-[12.5px] font-medium"></div>
          <div><button id="rp-cp-save" class="btn-primary">Update password</button></div>
        </div>
      </div>`;
  }

  function renderView() {
    const view = document.getElementById('rp-view');
    if (active === 'home') {
      renderHome();
    } else if (active === 'settings') {
      view.innerHTML = renderSettings();
      bindChangePassword();
      bindAutoToggle();
    } else if (active === 'leads') {
      renderLeads();
    } else if (active === 'contacts') {
      renderContacts();
    } else if (active === 'calls') {
      renderCalls();
    } else if (active === 'tasks') {
      renderTasks();
    } else if (active === 'clients') {
      renderClients();
    } else {
      const s = SECTIONS.find(x => x.id === active);
      view.innerHTML = placeholder(s ? s.label : 'Section', 'Tell us what you want here.');
    }
    if (window.lucide) lucide.createIcons();
  }

  // ----- Home / dashboard -----
  let homeData = null;
  function homeSeenKey() { return 'rp-home-seen-' + (me && me.id ? me.id : 'x'); }
  function lastSeenHome() { try { return +localStorage.getItem(homeSeenKey()) || 0; } catch (e) { return 0; } }
  function markHomeSeen() { try { localStorage.setItem(homeSeenKey(), String(Date.now())); } catch (e) {} }
  function computeHomeBadge(d) {
    if (!d) return 0;
    const seen = lastSeenHome();
    const fresh = (d.activity || []).filter(a => new Date(a.at).getTime() > seen).length;
    return fresh + (d.stats ? (d.stats.unreadMessages || 0) : 0);
  }
  async function loadHome() {
    try {
      const res = await api('/api/realtor/home', { cache: 'no-store' });
      homeData = res.ok ? await res.json() : null;
    } catch (e) { homeData = null; }
    homeBadge = computeHomeBadge(homeData);
    return homeData;
  }
  function toneStyle(tone) {
    return tone === 'green' ? 'background:#E7F6EC;color:#138A4B;'
      : tone === 'blue' ? 'background:#E7EEFB;color:#2255a3;'
      : tone === 'purple' ? 'background:#F0E9FB;color:#7A43C9;'
      : tone === 'red' ? 'background:#FBE9E9;color:#D63333;'
      : tone === 'yellow' ? 'background:#FBF4E2;color:#9A7B12;'
      : 'background:var(--chip);color:var(--text-muted);';
  }
  function statCard(icon, label, value, tone) {
    return `
      <div class="panel p-4 flex items-center gap-3">
        <div class="rounded-xl flex items-center justify-center flex-shrink-0" style="width:42px;height:42px;${toneStyle(tone)}">
          <i data-lucide="${icon}" style="width:19px;height:19px;"></i>
        </div>
        <div class="leading-tight">
          <div class="text-[22px] font-bold">${value}</div>
          <div class="text-[12px] text-muted">${esc(label)}</div>
        </div>
      </div>`;
  }
  function timeAgo(at) {
    const t = new Date(at).getTime(); if (isNaN(t)) return '';
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
    const d = Math.floor(h / 24); if (d < 7) return d + 'd ago';
    return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function renderHome() {
    const view = document.getElementById('rp-view');
    const first = (me && me.name ? me.name.split(/\s+/)[0] : '') || 'there';
    if (!homeData) {
      view.innerHTML = `
        <div class="mb-5"><h1 class="text-[24px] font-bold tracking-tight">Welcome back, ${esc(first)}</h1>
          <p class="text-[13.5px] text-muted mt-1">Here's what's happening with your book of business.</p></div>
        <div class="text-[13px] text-muted py-10 text-center">Loading…</div>`;
      loadHome().then(() => { if (active === 'home') renderHome(); });
      return;
    }
    const s = homeData.stats || {};
    const queue = homeData.queue || [];
    const shared = homeData.shared || [];
    const activity = homeData.activity || [];
    const tasksToday = homeData.tasksToday || [];
    const priPillH = (p) => p === 'High' ? 'pill-red' : p === 'Medium' ? 'pill-yellow' : 'pill-gray';

    const followCard = tasksToday.length ? `
      <div class="panel">
        <div class="p-5 pb-2 flex items-center justify-between">
          <h3 class="text-[15px] font-semibold">Follow-ups due</h3>
          <a href="#tasks" class="text-[12.5px] font-semibold" style="color:var(--accent);">View all</a>
        </div>
        <div class="px-5 pb-4">
          ${tasksToday.map(t => `
            <div class="flex items-center gap-3 py-2.5" style="border-bottom:1px solid var(--border-soft);">
              <button data-home-done="${t.id}" title="Mark done" style="width:20px;height:20px;border-radius:6px;border:1.5px solid var(--border-strong);background:transparent;flex-shrink:0;cursor:pointer;"></button>
              <div class="min-w-0 flex-1">
                <div class="text-[13px] font-medium truncate">${esc(t.title)}</div>
                <div class="text-[11.5px] truncate">${t.leadName ? esc(t.leadName) + ' · ' : ''}<span style="${t.overdue ? 'color:#D63333;font-weight:600;' : 'color:var(--text-muted);'}">${t.overdue ? 'Overdue' : 'Today'}</span></div>
              </div>
              <span class="pill ${priPillH(t.priority)}" style="font-size:10.5px;">${esc(t.priority)}</span>
            </div>`).join('')}
        </div>
      </div>` : '';

    const callItems = queue.length ? queue.map(p => `
      <div class="flex items-center justify-between gap-3 py-2.5" style="border-bottom:1px solid var(--border-soft);">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-semibold text-[13px] truncate">${esc(p.name)}</span>
            <span class="pill ${priPillH(p.priority)}" style="font-size:10.5px;">${esc(p.priority)}</span>
          </div>
          <div class="text-[11.5px] text-muted truncate">${esc(p.reason)}</div>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          ${telLink(p.phone) ? `<a href="${escAttr(telLink(p.phone))}" data-rk-callnow="${p.leadId}" data-rk-name="${escAttr(p.name)}" data-rk-phone="${escAttr(p.phone)}" class="btn-icon" title="Call & log" style="width:30px;height:30px;"><i data-lucide="phone" style="width:13px;height:13px;color:#2255a3;pointer-events:none;"></i></a>` : ''}
          <button class="btn-secondary" data-rk-log="${p.leadId}" data-rk-name="${escAttr(p.name)}" data-rk-phone="${escAttr(p.phone)}" style="padding:5px 10px;font-size:12px;">Log</button>
        </div>
      </div>`).join('') : `<div class="text-[13px] text-muted py-6 text-center">No one to call right now. Nicely done. 👏</div>`;

    const sharedItems = shared.length ? shared.slice(0, 8).map(l => `
      <div class="flex items-center justify-between gap-3 py-2.5" style="border-bottom:1px solid var(--border-soft);">
        <div class="min-w-0">
          <div class="font-semibold text-[13px] truncate">${esc(l.name)}</div>
          <div class="text-[11.5px] text-muted truncate">${[l.leadType, l.timeline, l.state].filter(Boolean).map(esc).join(' · ') || 'Shared lead'}</div>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <span class="pill" style="${toneStyle(l.statusTone)}font-size:10.5px;">${esc(l.status)}</span>
          ${telLink(l.phone) ? `<a href="${escAttr(telLink(l.phone))}" class="btn-icon" title="Call" style="width:30px;height:30px;"><i data-lucide="phone" style="width:13px;height:13px;color:#2255a3;pointer-events:none;"></i></a>` : ''}
        </div>
      </div>`).join('') : `<div class="text-[13px] text-muted py-6 text-center">No shared leads yet. When your loan officer attaches you to a lead, it shows up here.</div>`;

    const feedItems = activity.length ? activity.map(a => `
      <div class="flex items-start gap-3 py-2.5" style="border-bottom:1px solid var(--border-soft);">
        <div class="rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style="width:30px;height:30px;${toneStyle(a.tone)}">
          <i data-lucide="${esc(a.icon)}" style="width:15px;height:15px;"></i>
        </div>
        <div class="min-w-0">
          <div class="text-[12.5px]" style="word-break:break-word;">${esc(a.text)}</div>
          <div class="text-[11px] text-soft mt-0.5">${esc(timeAgo(a.at))}</div>
        </div>
      </div>`).join('') : `<div class="text-[13px] text-muted py-6 text-center">No recent activity yet.</div>`;

    view.innerHTML = `
      <div class="mb-5">
        <h1 class="text-[24px] font-bold tracking-tight">Welcome back, ${esc(first)}</h1>
        <p class="text-[13.5px] text-muted mt-1">Here's what's happening with your book of business.</p>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        ${statCard('user-plus', 'Active leads', s.activeLeads || 0, 'blue')}
        ${statCard('phone', 'To call today', s.callsToday || 0, 'red')}
        ${statCard('list-checks', 'Follow-ups due', s.tasksDue || 0, 'yellow')}
        ${statCard('message-circle', 'Unread messages', s.unreadMessages || 0, 'purple')}
      </div>
      <div class="grid grid-cols-12 gap-5">
        <div class="col-span-12 lg:col-span-7 flex flex-col gap-5">
          ${followCard}
          <div class="panel">
            <div class="p-5 pb-2 flex items-center justify-between">
              <h3 class="text-[15px] font-semibold">Call today</h3>
              <a href="#calls" class="text-[12.5px] font-semibold" style="color:var(--accent);">View all</a>
            </div>
            <div class="px-5 pb-4">${callItems}</div>
          </div>
          <div class="panel">
            <div class="p-5 pb-2 flex items-center justify-between">
              <h3 class="text-[15px] font-semibold">Leads shared with you</h3>
              <span class="text-[12px] text-muted">${shared.length || 0}</span>
            </div>
            <div class="px-5 pb-4">${sharedItems}</div>
          </div>
        </div>
        <div class="col-span-12 lg:col-span-5">
          <div class="panel">
            <div class="p-5 pb-2"><h3 class="text-[15px] font-semibold">Recent activity</h3></div>
            <div class="px-5 pb-4">${feedItems}</div>
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
    // Visiting Home clears the "new" badge.
    markHomeSeen();
    homeBadge = 0;
    renderNav();
  }
  function bindHome() {
    document.getElementById('rp-view').addEventListener('click', async (e) => {
      const d = e.target.closest('[data-home-done]');
      if (!d || active !== 'home') return;
      const id = d.getAttribute('data-home-done');
      d.disabled = true;
      try {
        const res = await api('/api/realtor/tasks/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) });
        if (res.ok) {
          // keep the local tasks cache in sync if it's loaded
          const i = rtTasks.findIndex(x => String(x.id) === String(id));
          if (i >= 0) { try { rtTasks[i] = await res.clone().json(); } catch (e2) {} }
          await loadHome();
          if (active === 'home') renderHome();
        }
      } catch (err) {}
    });
  }

  // ----- Leads section -----
  let rlLeads = [], rlQuery = '';
  function renderLeads() {
    const view = document.getElementById('rp-view');
    view.innerHTML = `
      <div class="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 class="text-[24px] font-bold tracking-tight">Leads</h1>
          <p class="text-[13.5px] text-muted mt-1">Capture and keep track of the people you're working with.</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button id="rl-import" class="btn-secondary"><i data-lucide="upload" style="width:14px;height:14px;"></i> Import</button>
          <button id="rl-export" class="btn-secondary"><i data-lucide="download" style="width:14px;height:14px;"></i> Export</button>
          <button id="rl-add" class="btn-primary"><i data-lucide="plus" style="width:14px;height:14px;"></i> Add lead</button>
        </div>
      </div>
      <div class="panel">
        <div class="p-5 pb-3 flex items-center justify-between flex-wrap gap-3">
          <h3 class="text-[15px] font-semibold">All leads <span id="rl-count" class="text-muted font-normal"></span></h3>
          <div class="relative">
            <i data-lucide="search" style="width:14px;height:14px;color:#8A8AA0;position:absolute;left:12px;top:50%;transform:translateY(-50%);"></i>
            <input id="rl-search" class="input pl-9" style="padding-top:7px;padding-bottom:7px;font-size:12.5px;width:240px;" placeholder="Search leads…" />
          </div>
        </div>
        <div id="rl-import-msg" class="px-5 text-[12.5px] font-medium"></div>
        <div class="overflow-x-auto"><table class="lf-table lf-cards" id="rl-table"></table></div>
      </div>`;
    document.getElementById('rl-add').addEventListener('click', () => openLeadModal(null));
    document.getElementById('rl-import').addEventListener('click', () => document.getElementById('rl-file').click());
    document.getElementById('rl-export').addEventListener('click', exportLeads);
    document.getElementById('rl-search').addEventListener('input', e => { rlQuery = e.target.value; renderLeadsTable(); });
    if (window.lucide) lucide.createIcons();
    loadRealtorLeads();
  }
  async function loadRealtorLeads() {
    try {
      const res = await api('/api/realtor/leads', { cache: 'no-store' });
      rlLeads = res.ok ? await res.json() : [];
    } catch (e) { rlLeads = []; }
    renderLeadsTable();
  }
  function filteredLeads() {
    const t = rlQuery.trim().toLowerCase();
    if (!t) return rlLeads;
    return rlLeads.filter(l => [l.name, l.phone, l.email, l.area, l.budget, l.intent, l.timeline]
      .some(v => String(v || '').toLowerCase().includes(t)));
  }
  function renderLeadsTable() {
    const table = document.getElementById('rl-table');
    if (!table) return;
    const countEl = document.getElementById('rl-count');
    if (countEl) countEl.textContent = rlLeads.length ? `(${rlLeads.length})` : '';
    if (!rlLeads.length) {
      table.innerHTML = `<tbody><tr><td><div class="text-center py-14">
        <div class="mx-auto mb-3 stat-icon" style="background:var(--surface-3);width:46px;height:46px;border-radius:12px;">
          <i data-lucide="user-plus" style="width:20px;height:20px;color:#8A8AA0;"></i></div>
        <div class="text-[14px] font-semibold mb-1">No leads yet</div>
        <div class="text-[13px] text-muted mb-4">Add a lead while you're on a call, or import a CSV/Excel file.</div>
        <button class="btn-primary" onclick="document.getElementById('rl-add').click()"><i data-lucide="plus" style="width:14px;height:14px;"></i> Add lead</button>
      </div></td></tr></tbody>`;
      if (window.lucide) lucide.createIcons();
      return;
    }
    const rows = filteredLeads();
    const intentPill = (i) => i === 'Buying' ? 'pill-green' : i === 'Selling' ? 'pill-blue' : i === 'Both' ? 'pill-purple' : 'pill-gray';
    table.innerHTML = `
      <thead><tr><th>Name</th><th>Contact</th><th>Looking to</th><th>Timeline</th><th>Budget</th><th>Area</th><th>Financing</th><th>Credit</th><th>Assets</th><th></th></tr></thead>
      <tbody>
        ${rows.length ? rows.map(l => `
          <tr>
            <td data-col="name"><span class="font-semibold text-[13px]" data-rl-view="${l.id}" style="cursor:pointer;color:var(--accent);">${esc(l.name)}</span></td>
            <td class="text-muted" data-label="Contact">${[l.phone, l.email].filter(Boolean).map(esc).join('<br>') || '—'}</td>
            <td data-label="Looking to">${l.intent ? `<span class="pill ${intentPill(l.intent)}">${esc(l.intent)}</span>` : '<span class="text-soft">—</span>'}</td>
            <td data-label="Timeline">${esc(l.timeline) || '<span class="text-soft">—</span>'}</td>
            <td data-label="Budget">${esc(l.budget) || '<span class="text-soft">—</span>'}</td>
            <td class="text-muted" data-label="Area">${[l.area, l.zipcode].filter(Boolean).map(esc).join(' · ') || '—'}</td>
            <td data-label="Financing">${esc(l.financing) || '<span class="text-soft">—</span>'}</td>
            <td data-label="Credit">${esc(l.creditScore) || '<span class="text-soft">—</span>'}</td>
            <td class="text-muted" data-label="Assets">${esc(l.assets) || '—'}</td>
            <td data-col="actions" style="text-align:right;">
              <div class="flex items-center gap-1 justify-end">
                <button class="btn-secondary" data-close-lead="${l.id}" data-lead-name="${escAttr(l.name)}" data-lead-phone="${escAttr(l.phone || '')}" title="Mark as a past client" style="padding:5px 10px;font-size:12px;">Close</button>
                <button class="btn-icon" data-rl-edit="${l.id}" title="Edit lead" style="width:30px;height:30px;">
                  <i data-lucide="pencil" style="width:13px;height:13px;color:var(--text-muted);pointer-events:none;"></i>
                </button>
                <button class="btn-icon" data-del-lead="${l.id}" data-lead-name="${esc(l.name)}" title="Delete lead" style="width:30px;height:30px;border:none;">
                  <i data-lucide="trash-2" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i>
                </button>
              </div>
            </td>
          </tr>`).join('') : `<tr><td colspan="10" class="text-center py-8 text-muted">No leads match that search.</td></tr>`}
      </tbody>`;
    if (window.lucide) lucide.createIcons();
  }

  // Add / edit lead modal
  let rlEditingId = null;
  function openLeadModal(lead) {
    const form = document.getElementById('rl-form');
    form.reset();
    rlEditingId = (lead && lead.id) ? lead.id : null;
    document.getElementById('rl-modal-title').textContent = rlEditingId ? 'Edit lead' : 'Add a lead';
    document.getElementById('rl-submit').textContent = rlEditingId ? 'Save changes' : 'Add lead';
    if (lead) {
      ['name', 'phone', 'email', 'budget', 'area', 'zipcode', 'creditScore', 'assets', 'notes'].forEach(k => { if (form.elements[k]) form.elements[k].value = lead[k] || ''; });
      ['intent', 'timeline', 'propertyType', 'financing'].forEach(k => { if (form.elements[k]) form.elements[k].value = lead[k] || ''; });
    }
    document.getElementById('rl-msg').textContent = '';
    document.getElementById('rl-modal').classList.remove('hidden');
    form.elements['name'].focus();
  }
  function closeLeadModal() { document.getElementById('rl-modal').classList.add('hidden'); rlEditingId = null; }
  async function submitLead(e) {
    e.preventDefault();
    const form = document.getElementById('rl-form');
    const data = Object.fromEntries(new FormData(form));
    const msg = document.getElementById('rl-msg');
    if (!data.name.trim()) { msg.style.color = '#D63333'; msg.textContent = 'A name is required.'; return; }
    const btn = document.getElementById('rl-submit');
    btn.disabled = true; btn.style.opacity = '0.7';
    try {
      const res = await api(rlEditingId ? '/api/realtor/leads/' + rlEditingId : '/api/realtor/leads', {
        method: rlEditingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { msg.style.color = '#D63333'; msg.textContent = body.error || 'Could not save the lead.'; return; }
      if (rlEditingId) { const i = rlLeads.findIndex(l => String(l.id) === String(rlEditingId)); if (i >= 0) rlLeads[i] = body; }
      else rlLeads.unshift(body);
      closeLeadModal();
      renderLeadsTable();
    } catch (e2) { msg.style.color = '#D63333'; msg.textContent = 'Network error.'; }
    finally { btn.disabled = false; btn.style.opacity = ''; }
  }

  // Import from CSV / XLS / XLSX (parsed in-browser with SheetJS).
  function mapImportRow(obj) {
    const pick = (re) => { for (const k of Object.keys(obj)) { if (re.test(k)) { const v = String(obj[k] == null ? '' : obj[k]).trim(); if (v) return v; } } return ''; };
    const norm = (v, list) => { const t = v.toLowerCase(); return list.find(x => x.toLowerCase() === t) || (list.find(x => t.includes(x.toLowerCase())) || ''); };
    return {
      name: pick(/^name$|full ?name|contact|client|lead/i),
      phone: pick(/phone|mobile|\bcell\b|\btel\b/i),
      email: pick(/e-?mail/i),
      intent: norm(pick(/intent|buying|selling|buyer|seller|type/i), ['Buying', 'Selling', 'Both']),
      timeline: pick(/timeline|how soon|when|time ?frame/i),
      budget: pick(/budget|price|range/i),
      propertyType: pick(/property|home ?type|prop ?type/i),
      area: pick(/area|location|city|neighborhood|region/i),
      zipcode: pick(/zip|postal/i),
      financing: norm(pick(/financing|pre-?approv|lender|cash|loan/i), ['Pre-approved', 'Needs a lender', 'Paying cash', 'Not sure']),
      creditScore: pick(/credit ?score|\bfico\b|\bcredit\b/i),
      assets: pick(/assets?|cash on hand|cash|down ?payment|savings/i),
      notes: pick(/notes?|comments?|details?/i)
    };
  }
  function importMsg(text, kind) {
    const el = document.getElementById('rl-import-msg');
    if (!el) return;
    el.style.color = kind === 'err' ? '#D63333' : kind === 'ok' ? '#138A4B' : 'var(--text-muted)';
    el.textContent = text || '';
  }
  async function handleImportFile(file) {
    if (!file) return;
    if (typeof XLSX === 'undefined') { importMsg('Spreadsheet reader failed to load — check your connection and retry.', 'err'); return; }
    importMsg('Reading file…');
    let objs;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      objs = XLSX.utils.sheet_to_json(ws, { defval: '' });
    } catch (e) { importMsg('Could not read that file. Use a .csv, .xls, or .xlsx with a header row.', 'err'); return; }
    const rows = (objs || []).map(mapImportRow).filter(r => r.name);
    if (!rows.length) { importMsg('No rows with a Name column were found.', 'err'); return; }
    importMsg(`Importing ${rows.length} lead${rows.length === 1 ? '' : 's'}…`);
    try {
      const res = await api('/api/realtor/leads/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { importMsg(body.error || 'Import failed.', 'err'); return; }
      await loadRealtorLeads();
      importMsg(`Imported ${body.imported} lead${body.imported === 1 ? '' : 's'}` + (body.skipped ? ` · ${body.skipped} skipped (no name)` : ''), 'ok');
    } catch (e) { importMsg('Network error.', 'err'); }
  }

  // Export the current leads as a CSV download.
  function exportLeads() {
    if (!rlLeads.length) { importMsg('No leads to export yet.', 'err'); return; }
    const cols = [['Name', 'name'], ['Phone', 'phone'], ['Email', 'email'], ['Looking to', 'intent'], ['Timeline', 'timeline'], ['Budget', 'budget'], ['Property type', 'propertyType'], ['Area', 'area'], ['ZIP code', 'zipcode'], ['Financing', 'financing'], ['Credit score', 'creditScore'], ['Assets available', 'assets'], ['Notes', 'notes']];
    const escCsv = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [cols.map(c => c[0]).join(',')].concat(rlLeads.map(l => cols.map(c => escCsv(l[c[1]])).join(',')));
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'my-leads.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Close a lead → past client
  let rxTarget = null;
  function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function openCloseModal(target) {
    rxTarget = target;
    document.getElementById('rx-who').textContent = target.name + (target.phone ? ` · ${target.phone}` : '');
    document.getElementById('rx-deal').value = '';
    document.getElementById('rx-date').value = todayStr();
    document.getElementById('rx-address').value = '';
    document.getElementById('rx-price').value = '';
    document.getElementById('rx-notes').value = '';
    document.getElementById('rx-msg').textContent = '';
    document.getElementById('rx-modal').classList.remove('hidden');
  }
  function closeCloseModal() { document.getElementById('rx-modal').classList.add('hidden'); rxTarget = null; }
  async function saveClose() {
    if (!rxTarget) return;
    const msg = document.getElementById('rx-msg');
    const btn = document.getElementById('rx-save');
    btn.disabled = true; btn.style.opacity = '0.7';
    try {
      const payload = {
        dealType: document.getElementById('rx-deal').value,
        closedDate: document.getElementById('rx-date').value,
        address: document.getElementById('rx-address').value,
        price: document.getElementById('rx-price').value,
        notes: document.getElementById('rx-notes').value
      };
      const res = await api('/api/realtor/leads/' + rxTarget.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { msg.style.color = '#D63333'; msg.textContent = body.error || 'Could not close the lead.'; return; }
      rlLeads = rlLeads.filter(l => String(l.id) !== String(rxTarget.id));
      closeCloseModal();
      renderLeadsTable();
    } catch (e) { msg.style.color = '#D63333'; msg.textContent = 'Network error.'; }
    finally { btn.disabled = false; btn.style.opacity = ''; }
  }
  function bindClose() {
    document.getElementById('rx-close').addEventListener('click', closeCloseModal);
    document.getElementById('rx-cancel').addEventListener('click', closeCloseModal);
    document.getElementById('rx-backdrop').addEventListener('click', closeCloseModal);
    document.getElementById('rx-save').addEventListener('click', saveClose);
  }

  function bindLeads() {
    document.getElementById('rl-close').addEventListener('click', closeLeadModal);
    document.getElementById('rl-cancel').addEventListener('click', closeLeadModal);
    document.getElementById('rl-backdrop').addEventListener('click', closeLeadModal);
    document.getElementById('rl-form').addEventListener('submit', submitLead);
    document.getElementById('rl-file').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      handleImportFile(f);
      e.target.value = '';
    });
    // Delegated actions on the leads table (table is re-rendered, so listen on the view).
    document.getElementById('rp-view').addEventListener('click', async (e) => {
      const view = e.target.closest('[data-rl-view]');
      if (view) { openLeadDetail(view.getAttribute('data-rl-view')); return; }
      const editBtn = e.target.closest('[data-rl-edit]');
      if (editBtn) { const l = rlLeads.find(x => String(x.id) === editBtn.getAttribute('data-rl-edit')); if (l) openLeadModal(l); return; }
      const closeBtn = e.target.closest('[data-close-lead]');
      if (closeBtn) { openCloseModal({ id: closeBtn.getAttribute('data-close-lead'), name: closeBtn.getAttribute('data-lead-name'), phone: closeBtn.getAttribute('data-lead-phone') || '' }); return; }
      const del = e.target.closest('[data-del-lead]');
      if (!del) return;
      const id = del.getAttribute('data-del-lead');
      const name = del.getAttribute('data-lead-name') || 'this lead';
      if (!window.confirm(`Delete ${name}?`)) return;
      try {
        const res = await api('/api/realtor/leads/' + id, { method: 'DELETE' });
        if (!res.ok && res.status !== 404) { window.alert('Could not delete the lead.'); return; }
        rlLeads = rlLeads.filter(l => String(l.id) !== String(id));
        renderLeadsTable();
      } catch (err) { window.alert('Network error.'); }
    });
  }

  function setSection(id) {
    if (!SECTIONS.some(s => s.id === id)) id = 'home';
    active = id;
    renderNav();
    renderView();
  }

  function bindNav() {
    document.getElementById('rp-nav').addEventListener('click', (e) => {
      const a = e.target.closest('[data-section]');
      if (!a) return;
      e.preventDefault();
      const id = a.getAttribute('data-section');
      if (location.hash !== '#' + id) location.hash = '#' + id; else setSection(id);
    });
    window.addEventListener('hashchange', () => setSection((location.hash || '').replace('#', '') || 'home'));
  }

  // ----- Change password (in Settings) -----
  function bindChangePassword() {
    const btn = document.getElementById('rp-cp-save');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const cur = document.getElementById('rp-cp-cur').value;
      const nw = document.getElementById('rp-cp-new').value;
      const nw2 = document.getElementById('rp-cp-new2').value;
      const msg = document.getElementById('rp-cp-msg');
      msg.style.color = '#D63333';
      if (!cur || !nw) { msg.textContent = 'Fill in all fields.'; return; }
      if (nw.length < 6) { msg.textContent = 'New password must be at least 6 characters.'; return; }
      if (nw !== nw2) { msg.textContent = 'The new passwords don’t match.'; return; }
      btn.disabled = true; btn.style.opacity = '0.7';
      try {
        const res = await api('/api/change-password', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword: cur, newPassword: nw })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { msg.textContent = body.error || 'Could not update your password.'; return; }
        msg.style.color = '#138A4B'; msg.textContent = 'Password updated.';
        document.getElementById('rp-cp-cur').value = '';
        document.getElementById('rp-cp-new').value = '';
        document.getElementById('rp-cp-new2').value = '';
        if (me) me.mustChangePassword = false;   // clear the temporary-password banner
      } catch (e) { msg.textContent = 'Network error.'; }
      finally { btn.disabled = false; btn.style.opacity = ''; }
    });
  }

  // ----- Automatic follow-ups toggle (in Settings) -----
  async function bindAutoToggle() {
    const btn = document.getElementById('rp-auto-toggle');
    if (!btn) return;
    const knob = document.getElementById('rp-auto-knob');
    const msg = document.getElementById('rp-auto-msg');
    let on = !(me && me.autoTasks === false);
    function paint() {
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      btn.style.background = on ? '#2255a3' : 'var(--border-strong)';
      knob.style.left = on ? '21px' : '3px';
    }
    paint();
    try { const r = await api('/api/realtor/prefs', { cache: 'no-store' }); if (r.ok) { const d = await r.json(); on = !!d.autoFollowups; paint(); } } catch (e) {}
    btn.addEventListener('click', async () => {
      const next = !on;
      btn.disabled = true;
      try {
        const r = await api('/api/realtor/prefs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autoFollowups: next }) });
        const d = await r.json().catch(() => ({}));
        if (r.ok) {
          on = !!d.autoFollowups; if (me) me.autoTasks = on; paint();
          msg.style.color = '#138A4B'; msg.textContent = on ? 'Automatic follow-ups are on.' : 'Automatic follow-ups are off — existing ones are kept.';
        } else { msg.style.color = '#D63333'; msg.textContent = d.error || 'Could not save.'; }
      } catch (e) { msg.style.color = '#D63333'; msg.textContent = 'Network error.'; }
      finally { btn.disabled = false; }
    });
  }

  // ----- All Contacts (directory of saved contacts + leads + past clients) -----
  let rcContacts = [], rcLeads = [], rcClients = [], rcQuery = '', rcFilter = 'all', rcPage = 1, rcEditingId = null, rcMenuTarget = null;
  const RC_FILTERS = [{ id: 'all', label: 'All' }, { id: 'lead', label: 'Leads' }, { id: 'contact', label: 'Contacts' }, { id: 'client', label: 'Clients' }];
  const RC_PAGE_SIZE = 10;

  function rcPeople() {
    return [].concat(
      rcContacts.map(c => ({ kind: 'contact', id: c.id, name: c.name, email: c.email || '', phone: c.phone || '', company: c.company || '', type: c.tag || 'Contact', raw: c })),
      rcLeads.map(l => ({ kind: 'lead', id: l.id, name: l.name, email: l.email || '', phone: l.phone || '', company: '', type: 'Lead', raw: l })),
      rcClients.map(c => ({ kind: 'client', id: c.id, name: c.name, email: c.email || '', phone: c.phone || '', company: '', type: 'Past client', raw: c }))
    );
  }
  function rcFiltered() {
    let list = rcPeople();
    if (rcFilter !== 'all') list = list.filter(p => p.kind === rcFilter);
    const t = rcQuery.trim().toLowerCase();
    if (t) list = list.filter(p => [p.name, p.email, p.phone, p.company, p.type].some(v => String(v || '').toLowerCase().includes(t)));
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }
  function rcTypePill(kind) { return kind === 'lead' ? 'pill-blue' : kind === 'client' ? 'pill-green' : 'pill-gray'; }

  function renderContacts() {
    const view = document.getElementById('rp-view');
    view.innerHTML = `
      <div class="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 class="text-[24px] font-bold tracking-tight">All Contacts</h1>
          <p class="text-[13.5px] text-muted mt-1">Everyone you're working with — your leads and saved contacts in one place.</p>
        </div>
        <button id="rc-add" class="btn-primary"><i data-lucide="plus" style="width:14px;height:14px;"></i> Add contact</button>
      </div>
      <div class="panel">
        <div class="p-5 pb-3 flex items-center justify-between flex-wrap gap-3">
          <div id="rc-tabs" class="flex items-center gap-5 flex-wrap"></div>
          <div class="relative">
            <i data-lucide="search" style="width:14px;height:14px;color:#8A8AA0;position:absolute;left:12px;top:50%;transform:translateY(-50%);"></i>
            <input id="rc-search" class="input pl-9" style="padding-top:7px;padding-bottom:7px;font-size:12.5px;width:240px;" placeholder="Search people…" />
          </div>
        </div>
        <div class="overflow-x-auto"><table class="lf-table lf-cards" id="rc-table"></table></div>
        <div class="p-4 flex items-center justify-between border-t flex-wrap gap-3" style="border-color:var(--border);">
          <span id="rc-summary" class="text-[12.5px] text-muted"></span>
          <div id="rc-pager" class="flex items-center gap-1"></div>
        </div>
      </div>`;
    document.getElementById('rc-add').addEventListener('click', () => openContactModal(null));
    document.getElementById('rc-search').addEventListener('input', e => { rcQuery = e.target.value; rcPage = 1; renderContactsTable(); });
    if (window.lucide) lucide.createIcons();
    loadContactsData();
  }
  function renderRcTabs() {
    const counts = rcPeople().reduce((m, p) => { m[p.kind] = (m[p.kind] || 0) + 1; m.all = (m.all || 0) + 1; return m; }, {});
    const host = document.getElementById('rc-tabs');
    if (!host) return;
    host.innerHTML = RC_FILTERS.map(f => `
      <div class="tab ${rcFilter === f.id ? 'active' : ''}" data-rc-filter="${f.id}">${f.label}
        <span class="ml-1.5 text-[11px] font-semibold rounded-full px-1.5 py-[1px]" style="background:${rcFilter === f.id ? 'rgba(34,85,163,0.12)' : 'var(--chip)'};color:${rcFilter === f.id ? '#2255a3' : 'var(--text-muted)'};">${counts[f.id] || 0}</span>
      </div>`).join('');
    host.querySelectorAll('[data-rc-filter]').forEach(el => el.addEventListener('click', () => { rcFilter = el.dataset.rcFilter; rcPage = 1; renderContactsTable(); }));
  }
  async function loadContactsData() {
    try {
      const [c, l, cl] = await Promise.all([
        api('/api/realtor/contacts', { cache: 'no-store' }),
        api('/api/realtor/leads', { cache: 'no-store' }),
        api('/api/realtor/clients', { cache: 'no-store' })
      ]);
      rcContacts = c.ok ? await c.json() : [];
      rcLeads = l.ok ? await l.json() : [];
      rcClients = cl.ok ? await cl.json() : [];
    } catch (e) { rcContacts = []; rcLeads = []; rcClients = []; }
    renderContactsTable();
  }
  function renderContactsTable() {
    renderRcTabs();
    const table = document.getElementById('rc-table');
    if (!table) return;
    const rows = rcFiltered();
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / RC_PAGE_SIZE));
    if (rcPage > totalPages) rcPage = totalPages;
    const start = (rcPage - 1) * RC_PAGE_SIZE;
    const pageRows = rows.slice(start, start + RC_PAGE_SIZE);
    if (!rcPeople().length) {
      table.innerHTML = `<tbody><tr><td><div class="text-center py-14">
        <div class="mx-auto mb-3 stat-icon" style="background:var(--surface-3);width:46px;height:46px;border-radius:12px;"><i data-lucide="contact" style="width:20px;height:20px;color:#8A8AA0;"></i></div>
        <div class="text-[14px] font-semibold mb-1">No contacts yet</div>
        <div class="text-[13px] text-muted mb-4">Add a contact, or your leads will show up here.</div>
        <button class="btn-primary" onclick="document.getElementById('rc-add').click()"><i data-lucide="plus" style="width:14px;height:14px;"></i> Add contact</button>
      </div></td></tr></tbody>`;
      document.getElementById('rc-summary').textContent = '';
      document.getElementById('rc-pager').innerHTML = '';
      if (window.lucide) lucide.createIcons();
      return;
    }
    table.innerHTML = `
      <thead><tr><th>Name</th><th>Type</th><th>Email</th><th>Phone</th><th>Company</th><th>Action</th></tr></thead>
      <tbody>
        ${pageRows.length ? pageRows.map(p => {
          const editable = p.kind === 'contact';
          const actions = editable ? `
            <div class="flex items-center gap-1">
              ${(p.phone || p.email) ? `<button class="btn-secondary" data-rc-contact="${p.id}" style="padding:5px 11px;font-size:12px;display:inline-flex;align-items:center;gap:5px;"><i data-lucide="message-circle" style="width:13px;height:13px;pointer-events:none;"></i> Contact <i data-lucide="chevron-down" style="width:12px;height:12px;pointer-events:none;opacity:.7;"></i></button>` : ''}
              <button class="btn-icon" data-rc-edit="${p.id}" title="Edit" style="width:30px;height:30px;"><i data-lucide="pencil" style="width:13px;height:13px;color:var(--text-muted);pointer-events:none;"></i></button>
              <button class="btn-icon" data-rc-del="${p.id}" data-rc-name="${escAttr(p.name)}" title="Delete" style="width:30px;height:30px;border:none;"><i data-lucide="trash-2" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i></button>
            </div>` : `<button class="btn-secondary" data-rc-view="${p.kind}:${p.id}" style="padding:5px 11px;font-size:12px;">View</button>`;
          return `
            <tr>
              <td data-col="name"><div class="flex items-center gap-2"><div class="avatar avatar-sm">${initials(p.name)}</div>
                <span class="font-semibold text-[13px]" data-rc-view="${p.kind}:${p.id}" style="cursor:pointer;color:var(--accent);">${esc(p.name)}</span></div></td>
              <td data-label="Type"><span class="pill ${rcTypePill(p.kind)}">${esc(p.type)}</span></td>
              <td class="text-muted" data-label="Email">${esc(p.email) || '—'}</td>
              <td data-label="Phone">${esc(p.phone) || '—'}</td>
              <td class="text-muted" data-label="Company">${esc(p.company) || '—'}</td>
              <td data-col="actions">${actions}</td>
            </tr>`;
        }).join('') : `<tr><td colspan="6" class="text-center py-8 text-muted">No one matches that search.</td></tr>`}
      </tbody>`;
    // Footer.
    document.getElementById('rc-summary').textContent = total === 0 ? 'No people to show' : `Showing ${start + 1} to ${start + pageRows.length} of ${total}`;
    const pager = document.getElementById('rc-pager');
    if (total <= RC_PAGE_SIZE) { pager.innerHTML = ''; }
    else {
      pager.innerHTML = `
        <button class="btn-icon" data-rc-page="prev" style="width:30px;height:30px;" ${rcPage === 1 ? 'disabled' : ''}><i data-lucide="chevron-left" style="width:14px;height:14px;color:var(--text-muted);"></i></button>
        <span class="text-[12.5px] font-semibold" style="padding:0 12px;white-space:nowrap;">${rcPage} / ${totalPages}</span>
        <button class="btn-icon" data-rc-page="next" style="width:30px;height:30px;" ${rcPage === totalPages ? 'disabled' : ''}><i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text-muted);"></i></button>`;
      pager.querySelectorAll('[data-rc-page]').forEach(btn => btn.addEventListener('click', () => {
        const v = btn.dataset.rcPage;
        if (v === 'prev' && rcPage > 1) rcPage--; else if (v === 'next' && rcPage < totalPages) rcPage++; else if (!isNaN(parseInt(v, 10))) rcPage = parseInt(v, 10);
        renderContactsTable();
      }));
    }
    if (window.lucide) lucide.createIcons();
  }

  // Contact action menu (Call / Text / WhatsApp / Email)
  function rcMenuItem(icon, label, color) {
    return `<button class="flex items-center gap-2.5 w-full text-left rounded-md px-3 py-2 hover:bg-[#FAFAFC]" data-rc-action="${label}" style="font-size:13px;"><i data-lucide="${icon}" style="width:15px;height:15px;color:${color};pointer-events:none;"></i><span>${label}</span></button>`;
  }
  function openContactMenu(person, anchor) {
    rcMenuTarget = person;
    const menu = document.getElementById('rc-menu');
    const items = [];
    if (person.phone) { items.push(rcMenuItem('phone', 'Call', '#2255a3')); items.push(rcMenuItem('message-square', 'Text (SMS)', '#2255a3')); items.push(rcMenuItem('message-circle', 'WhatsApp', '#138A4B')); }
    if (person.email) { items.push(rcMenuItem('mail', 'Email', '#2255a3')); }
    menu.innerHTML = items.join('') || `<div class="px-3 py-2 text-[12.5px] text-muted">No phone or email on file.</div>`;
    menu.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 200)) + 'px';
    menu.style.top = (r.bottom + 4) + 'px';
    if (window.lucide) lucide.createIcons();
  }
  function closeContactMenu() { const m = document.getElementById('rc-menu'); if (m) m.classList.add('hidden'); rcMenuTarget = null; }
  function doContactAction(action) {
    const p = rcMenuTarget; if (!p) return;
    let url = '';
    if (action === 'Call') url = telLink(p.phone);
    else if (action === 'Text (SMS)') url = smsLink(p.phone);
    else if (action === 'WhatsApp') url = waLink(p.phone);
    else if (action === 'Email') url = gmailCompose(p.email);
    closeContactMenu();
    if (url) window.open(url, action === 'WhatsApp' || action === 'Email' ? '_blank' : '_self');
  }

  // Add / edit contact modal
  function openContactModal(contact) {
    const form = document.getElementById('rc-form');
    form.reset();
    rcEditingId = contact ? contact.id : null;
    document.getElementById('rc-modal-title').textContent = contact ? 'Edit contact' : 'Add contact';
    document.getElementById('rc-submit').textContent = contact ? 'Save changes' : 'Add contact';
    document.getElementById('rc-msg').textContent = '';
    if (contact) {
      form.elements['name'].value = contact.name || '';
      form.elements['email'].value = contact.email || '';
      form.elements['phone'].value = contact.phone || '';
      form.elements['company'].value = contact.company || '';
      form.elements['tag'].value = ['Contact', 'Buyer', 'Seller', 'Investor', 'Lender', 'Vendor', 'Other'].includes(contact.tag) ? contact.tag : 'Contact';
    }
    document.getElementById('rc-modal').classList.remove('hidden');
    form.elements['name'].focus();
  }
  function closeContactModal() { document.getElementById('rc-modal').classList.add('hidden'); rcEditingId = null; }
  async function submitContact(e) {
    e.preventDefault();
    const form = document.getElementById('rc-form');
    const data = Object.fromEntries(new FormData(form));
    const msg = document.getElementById('rc-msg');
    if (!data.name.trim()) { msg.style.color = '#D63333'; msg.textContent = 'A name is required.'; return; }
    const btn = document.getElementById('rc-submit');
    btn.disabled = true; btn.style.opacity = '0.7';
    try {
      const res = await api(rcEditingId ? '/api/realtor/contacts/' + rcEditingId : '/api/realtor/contacts', {
        method: rcEditingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { msg.style.color = '#D63333'; msg.textContent = body.error || 'Could not save the contact.'; return; }
      if (rcEditingId) { const i = rcContacts.findIndex(x => String(x.id) === String(rcEditingId)); if (i >= 0) rcContacts[i] = body; }
      else rcContacts.push(body);
      closeContactModal();
      renderContactsTable();
    } catch (e2) { msg.style.color = '#D63333'; msg.textContent = 'Network error.'; }
    finally { btn.disabled = false; btn.style.opacity = ''; }
  }

  // Shared detail modal (contacts + leads). Phone/email rows get action buttons.
  function actBtn(href, icon, title, color, blank) {
    return `<a href="${escAttr(href)}" ${blank ? 'target="_blank" rel="noopener"' : ''} class="btn-icon" title="${title}" style="width:26px;height:26px;"><i data-lucide="${icon}" style="width:13px;height:13px;color:${color};pointer-events:none;"></i></a>`;
  }
  function phoneActions(ph, logTarget) {
    let h = '';
    if (telLink(ph)) {
      // For leads, the Call button also opens the log-call modal so the call gets recorded.
      const dataAttr = logTarget ? ` data-rk-callnow="${logTarget.leadId}" data-rk-name="${escAttr(logTarget.name)}" data-rk-phone="${escAttr(logTarget.phone || '')}"` : '';
      h += `<a href="${escAttr(telLink(ph))}"${dataAttr} class="btn-icon" title="${logTarget ? 'Call & log' : 'Call'}" style="width:26px;height:26px;"><i data-lucide="phone" style="width:13px;height:13px;color:#2255a3;pointer-events:none;"></i></a>`;
    }
    if (smsLink(ph)) h += actBtn(smsLink(ph), 'message-square', 'Text', '#2255a3', false);
    if (waLink(ph)) h += actBtn(waLink(ph), 'message-circle', 'WhatsApp', '#138A4B', true);
    return h;
  }
  function detailRow(label, val, actions) {
    if (!val) return '';
    return `<div class="flex items-center justify-between gap-4 py-2" style="border-bottom:1px solid var(--border-soft);">
      <span class="text-[12.5px] text-muted flex-shrink-0">${esc(label)}</span>
      <span class="text-[13px] font-medium text-right" style="display:flex;align-items:center;gap:6px;justify-content:flex-end;word-break:break-word;">${esc(val)}${actions || ''}</span>
    </div>`;
  }
  function renderPersonDetail(p) {
    document.getElementById('rc-detail-title').textContent = p.name || 'Details';
    const r = p.raw || {};
    let rows = '';
    rows += detailRow('Type', p.type);
    rows += detailRow('Phone', p.phone, p.phone ? phoneActions(p.phone, p.kind === 'lead' ? { leadId: r.id, name: p.name, phone: p.phone } : null) : '');
    rows += detailRow('Email', p.email, p.email ? actBtn(gmailCompose(p.email), 'mail', 'Email', '#2255a3', true) : '');
    rows += detailRow('Company', p.company);
    if (p.kind === 'lead') {
      rows += detailRow('Looking to', r.intent); rows += detailRow('Timeline', r.timeline); rows += detailRow('Budget', r.budget);
      rows += detailRow('Property type', r.propertyType); rows += detailRow('Area', r.area); rows += detailRow('ZIP code', r.zipcode); rows += detailRow('Financing', r.financing);
      rows += detailRow('Credit score', r.creditScore); rows += detailRow('Assets', r.assets); rows += detailRow('Notes', r.notes);
    } else if (p.kind === 'client') {
      rows += detailRow('Deal', r.dealType); rows += detailRow('Property', r.address); rows += detailRow('Sale price', r.price);
      rows += detailRow('Closed', r.closedDate); rows += detailRow('Looking to', r.intent); rows += detailRow('Budget', r.budget);
      rows += detailRow('Property type', r.propertyType); rows += detailRow('Area', r.area); rows += detailRow('ZIP code', r.zipcode); rows += detailRow('Notes', r.notes);
    }
    const editBtn = p.kind === 'contact'
      ? `<div class="mt-4 flex justify-end"><button id="rc-detail-edit" class="btn-secondary" style="font-size:12.5px;"><i data-lucide="pencil" style="width:13px;height:13px;"></i> Edit</button></div>` : '';
    const leadId = p.kind === 'lead' && p.raw ? p.raw.id : null;
    const leadExtra = leadId ? `
      <div class="mt-5 flex items-center justify-between">
        <h4 class="text-[13px] font-semibold">Activity & notes</h4>
        <button id="rl-detail-followup" class="btn-secondary" style="font-size:12px;padding:5px 10px;"><i data-lucide="bell-plus" style="width:13px;height:13px;"></i> Add follow-up</button>
      </div>
      <div class="flex items-center gap-2 mt-2">
        <input id="rl-note-input" class="input" style="flex:1;" placeholder="Add a note from your call…" maxlength="2000" autocomplete="off" />
        <button id="rl-note-add" class="btn-primary" style="padding:8px 12px;"><i data-lucide="plus" style="width:14px;height:14px;"></i></button>
      </div>
      <div id="rl-timeline" class="mt-3"><div class="text-[12.5px] text-muted py-2">Loading…</div></div>` : '';
    document.getElementById('rc-detail-body').innerHTML = (rows || '<div class="text-[13px] text-muted py-2">No details.</div>') + editBtn + leadExtra;
    document.getElementById('rc-detail').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
    const eb = document.getElementById('rc-detail-edit');
    if (eb) eb.addEventListener('click', () => {
      closeContactDetail();
      const c = rcContacts.find(x => String(x.id) === String(p.id));
      if (c) openContactModal(c);
    });
    if (leadId) wireLeadTimeline(leadId, p.name);
  }

  // Lead activity timeline (notes + logged calls) inside the detail modal.
  function timelineItemHtml(it) {
    const isNote = it.kind === 'note';
    const icon = isNote ? 'sticky-note' : 'phone';
    const tone = isNote ? 'blue' : 'gray';
    const head = isNote ? 'Note' : ('Call' + (it.outcome ? ' · ' + esc(it.outcome) : ''));
    const del = isNote ? `<button class="btn-icon" data-rl-note-del="${it.id}" title="Delete note" style="width:24px;height:24px;border:none;"><i data-lucide="x" style="width:13px;height:13px;color:var(--text-muted);pointer-events:none;"></i></button>` : '';
    return `
      <div class="flex items-start gap-2.5 py-2" style="border-bottom:1px solid var(--border-soft);">
        <div class="rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style="width:26px;height:26px;${toneStyle(tone)}"><i data-lucide="${icon}" style="width:13px;height:13px;"></i></div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[12px] font-semibold">${head}</span>
            <span class="text-[11px] text-soft">${esc(rkTimeAgo(it.at))}</span>
          </div>
          ${it.body ? `<div class="text-[12.5px] mt-0.5" style="word-break:break-word;">${esc(it.body)}</div>` : ''}
        </div>
        ${del}
      </div>`;
  }
  async function loadLeadTimeline(leadId) {
    const host = document.getElementById('rl-timeline'); if (!host) return;
    try {
      const res = await api('/api/realtor/leads/' + leadId + '/timeline', { cache: 'no-store' });
      const data = res.ok ? await res.json() : { items: [] };
      const items = data.items || [];
      host.innerHTML = items.length ? items.map(timelineItemHtml).join('')
        : `<div class="text-[12.5px] text-muted py-2">No notes or calls yet. Add a note above.</div>`;
      if (window.lucide) lucide.createIcons();
    } catch (e) { host.innerHTML = `<div class="text-[12.5px] text-muted py-2">Could not load activity.</div>`; }
  }
  function wireLeadTimeline(leadId, leadName) {
    loadLeadTimeline(leadId);
    const fu = document.getElementById('rl-detail-followup');
    if (fu) fu.addEventListener('click', () => openTaskModal(null, { id: leadId, name: leadName }));
    const input = document.getElementById('rl-note-input');
    const addBtn = document.getElementById('rl-note-add');
    const add = async () => {
      const body = (input.value || '').trim();
      if (!body) return;
      addBtn.disabled = true; addBtn.style.opacity = '0.7';
      try {
        const res = await api('/api/realtor/leads/' + leadId + '/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
        if (res.ok) { input.value = ''; await loadLeadTimeline(leadId); }
      } catch (e) {}
      finally { addBtn.disabled = false; addBtn.style.opacity = ''; }
    };
    if (addBtn) addBtn.addEventListener('click', add);
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    const host = document.getElementById('rl-timeline');
    if (host) host.addEventListener('click', async (e) => {
      const d = e.target.closest('[data-rl-note-del]'); if (!d) return;
      const noteId = d.getAttribute('data-rl-note-del');
      try {
        const res = await api('/api/realtor/leads/' + leadId + '/notes/' + noteId, { method: 'DELETE' });
        if (res.ok || res.status === 404) loadLeadTimeline(leadId);
      } catch (err) {}
    });
  }
  function openContactDetail(kind, id) {
    const p = rcPeople().find(x => x.kind === kind && String(x.id) === String(id));
    if (p) renderPersonDetail(p);
  }
  function openLeadDetail(id) {
    const l = rlLeads.find(x => String(x.id) === String(id));
    if (l) renderPersonDetail({ kind: 'lead', name: l.name, email: l.email || '', phone: l.phone || '', company: '', type: 'Lead', raw: l });
  }
  function closeContactDetail() { document.getElementById('rc-detail').classList.add('hidden'); }

  function bindContacts() {
    document.getElementById('rc-close').addEventListener('click', closeContactModal);
    document.getElementById('rc-cancel').addEventListener('click', closeContactModal);
    document.getElementById('rc-backdrop').addEventListener('click', closeContactModal);
    document.getElementById('rc-form').addEventListener('submit', submitContact);
    document.getElementById('rc-detail-close').addEventListener('click', closeContactDetail);
    document.getElementById('rc-detail-backdrop').addEventListener('click', closeContactDetail);
    document.getElementById('rc-menu').addEventListener('click', (e) => {
      const a = e.target.closest('[data-rc-action]'); if (a) doContactAction(a.getAttribute('data-rc-action'));
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#rc-menu') && !e.target.closest('[data-rc-contact]')) closeContactMenu();
    });
    // Delegated table actions (table re-renders, so listen on the persistent view).
    document.getElementById('rp-view').addEventListener('click', async (e) => {
      const cBtn = e.target.closest('[data-rc-contact]');
      if (cBtn) { const p = rcPeople().find(x => x.kind === 'contact' && String(x.id) === cBtn.getAttribute('data-rc-contact')); if (p) openContactMenu(p, cBtn); return; }
      const view = e.target.closest('[data-rc-view]');
      if (view) { const [k, id] = view.getAttribute('data-rc-view').split(':'); openContactDetail(k, id); return; }
      const edit = e.target.closest('[data-rc-edit]');
      if (edit) { const c = rcContacts.find(x => String(x.id) === edit.getAttribute('data-rc-edit')); if (c) openContactModal(c); return; }
      const del = e.target.closest('[data-rc-del]');
      if (del) {
        const id = del.getAttribute('data-rc-del'); const name = del.getAttribute('data-rc-name') || 'this contact';
        if (!window.confirm(`Delete ${name}?`)) return;
        try {
          const res = await api('/api/realtor/contacts/' + id, { method: 'DELETE' });
          if (!res.ok && res.status !== 404) { window.alert('Could not delete the contact.'); return; }
          rcContacts = rcContacts.filter(x => String(x.id) !== String(id));
          renderContactsTable();
        } catch (err) { window.alert('Network error.'); }
      }
    });
  }

  // ----- Past Clients (closed leads) -----
  let pcClients = [], pcQuery = '', pcPage = 1;
  const PC_PAGE_SIZE = 10;
  function pcFiltered() {
    const t = pcQuery.trim().toLowerCase();
    let list = pcClients;
    if (t) list = list.filter(c => [c.name, c.email, c.phone, c.address, c.area, c.dealType].some(v => String(v || '').toLowerCase().includes(t)));
    return list;
  }
  function renderClients() {
    const view = document.getElementById('rp-view');
    view.innerHTML = `
      <div class="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 class="text-[24px] font-bold tracking-tight">Past Clients</h1>
          <p class="text-[13.5px] text-muted mt-1">Leads you've closed, plus any you add or import directly.</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button id="pc-import" class="btn-secondary"><i data-lucide="upload" style="width:14px;height:14px;"></i> Import</button>
          <button id="pc-export" class="btn-secondary"><i data-lucide="download" style="width:14px;height:14px;"></i> Export</button>
          <button id="pc-add" class="btn-primary"><i data-lucide="plus" style="width:14px;height:14px;"></i> Add client</button>
        </div>
      </div>
      <div class="panel">
        <div class="p-5 pb-3 flex items-center justify-between flex-wrap gap-3">
          <h3 class="text-[15px] font-semibold">All past clients <span id="pc-count" class="text-muted font-normal"></span></h3>
          <div class="relative">
            <i data-lucide="search" style="width:14px;height:14px;color:#8A8AA0;position:absolute;left:12px;top:50%;transform:translateY(-50%);"></i>
            <input id="pc-search" class="input pl-9" style="padding-top:7px;padding-bottom:7px;font-size:12.5px;width:240px;" placeholder="Search clients…" />
          </div>
        </div>
        <div id="pc-import-msg" class="px-5 text-[12.5px] font-medium"></div>
        <div class="overflow-x-auto"><table class="lf-table lf-cards" id="pc-table"></table></div>
        <div class="p-4 flex items-center justify-between border-t flex-wrap gap-3" style="border-color:var(--border);">
          <span id="pc-summary" class="text-[12.5px] text-muted"></span>
          <div id="pc-pager" class="flex items-center gap-1"></div>
        </div>
      </div>`;
    document.getElementById('pc-search').addEventListener('input', e => { pcQuery = e.target.value; pcPage = 1; renderClientsTable(); });
    document.getElementById('pc-add').addEventListener('click', () => openClientModal(null));
    document.getElementById('pc-import').addEventListener('click', () => document.getElementById('pc-file').click());
    document.getElementById('pc-export').addEventListener('click', exportClients);
    if (window.lucide) lucide.createIcons();
    loadClients();
  }
  async function loadClients() {
    try { const r = await api('/api/realtor/clients', { cache: 'no-store' }); pcClients = r.ok ? await r.json() : []; }
    catch (e) { pcClients = []; }
    renderClientsTable();
  }
  function renderClientsTable() {
    const table = document.getElementById('pc-table'); if (!table) return;
    const countEl = document.getElementById('pc-count'); if (countEl) countEl.textContent = pcClients.length ? `(${pcClients.length})` : '';
    if (!pcClients.length) {
      table.innerHTML = `<tbody><tr><td><div class="text-center py-14">
        <div class="mx-auto mb-3 stat-icon" style="background:var(--surface-3);width:46px;height:46px;border-radius:12px;"><i data-lucide="user-check" style="width:20px;height:20px;color:#8A8AA0;"></i></div>
        <div class="text-[14px] font-semibold mb-1">No past clients yet</div>
        <div class="text-[13px] text-muted">When you close a lead, it shows up here.</div>
      </div></td></tr></tbody>`;
      document.getElementById('pc-summary').textContent = '';
      document.getElementById('pc-pager').innerHTML = '';
      if (window.lucide) lucide.createIcons();
      return;
    }
    const rows = pcFiltered();
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / PC_PAGE_SIZE));
    if (pcPage > totalPages) pcPage = totalPages;
    const start = (pcPage - 1) * PC_PAGE_SIZE;
    const pageRows = rows.slice(start, start + PC_PAGE_SIZE);
    const dealPill = (d) => d === 'Bought' ? 'pill-green' : d === 'Sold' ? 'pill-blue' : d === 'Both' ? 'pill-purple' : 'pill-gray';
    table.innerHTML = `
      <thead><tr><th>Name</th><th>Deal</th><th>Property</th><th>Price</th><th>Closed</th><th>Contact</th><th></th></tr></thead>
      <tbody>
        ${pageRows.length ? pageRows.map(c => `
          <tr>
            <td data-col="name"><span class="font-semibold text-[13px]" data-pc-view="${c.id}" style="cursor:pointer;color:var(--accent);">${esc(c.name)}</span></td>
            <td data-label="Deal">${c.dealType ? `<span class="pill ${dealPill(c.dealType)}">${esc(c.dealType)}</span>` : '<span class="text-soft">—</span>'}</td>
            <td class="text-muted" data-label="Property">${esc(c.address) || '—'}</td>
            <td data-label="Price">${esc(c.price) || '<span class="text-soft">—</span>'}</td>
            <td class="text-muted" data-label="Closed">${esc(c.closedDate) || '—'}</td>
            <td class="text-muted" data-label="Contact">${[c.phone, c.email].filter(Boolean).map(esc).join('<br>') || '—'}</td>
            <td data-col="actions" style="text-align:right;">
              <div class="flex items-center gap-1 justify-end">
                <button class="btn-icon" data-pc-edit="${c.id}" title="Edit client" style="width:30px;height:30px;"><i data-lucide="pencil" style="width:13px;height:13px;color:var(--text-muted);pointer-events:none;"></i></button>
                <button class="btn-icon" data-pc-del="${c.id}" data-pc-name="${escAttr(c.name)}" title="Remove" style="width:30px;height:30px;border:none;"><i data-lucide="trash-2" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i></button>
              </div>
            </td>
          </tr>`).join('') : `<tr><td colspan="7" class="text-center py-8 text-muted">No clients match that search.</td></tr>`}
      </tbody>`;
    document.getElementById('pc-summary').textContent = total === 0 ? 'No clients to show' : `Showing ${start + 1} to ${start + pageRows.length} of ${total}`;
    const pager = document.getElementById('pc-pager');
    if (total <= PC_PAGE_SIZE) { pager.innerHTML = ''; }
    else {
      pager.innerHTML = `
        <button class="btn-icon" data-pc-page="prev" style="width:30px;height:30px;" ${pcPage === 1 ? 'disabled' : ''}><i data-lucide="chevron-left" style="width:14px;height:14px;color:var(--text-muted);"></i></button>
        <span class="text-[12.5px] font-semibold" style="padding:0 12px;white-space:nowrap;">${pcPage} / ${totalPages}</span>
        <button class="btn-icon" data-pc-page="next" style="width:30px;height:30px;" ${pcPage === totalPages ? 'disabled' : ''}><i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text-muted);"></i></button>`;
      pager.querySelectorAll('[data-pc-page]').forEach(btn => btn.addEventListener('click', () => {
        const v = btn.dataset.pcPage;
        if (v === 'prev' && pcPage > 1) pcPage--; else if (v === 'next' && pcPage < totalPages) pcPage++; else if (!isNaN(parseInt(v, 10))) pcPage = parseInt(v, 10);
        renderClientsTable();
      }));
    }
    if (window.lucide) lucide.createIcons();
  }
  function openClientDetail(id) {
    const c = pcClients.find(x => String(x.id) === String(id));
    if (c) renderPersonDetail({ kind: 'client', name: c.name, email: c.email || '', phone: c.phone || '', company: '', type: 'Past client', raw: c });
  }
  // Add / edit past client modal
  let pcEditingId = null;
  function openClientModal(c) {
    const form = document.getElementById('pc-form');
    form.reset();
    pcEditingId = (c && c.id) ? c.id : null;
    document.getElementById('pc-modal-title').textContent = pcEditingId ? 'Edit past client' : 'Add past client';
    document.getElementById('pc-submit').textContent = pcEditingId ? 'Save changes' : 'Add client';
    if (c) {
      ['name', 'phone', 'email', 'address', 'price', 'notes'].forEach(k => { if (form.elements[k]) form.elements[k].value = c[k] || ''; });
      form.elements['dealType'].value = c.dealType || '';
      form.elements['closedDate'].value = c.closedDate || '';
    } else {
      form.elements['closedDate'].value = todayStr();
    }
    document.getElementById('pc-msg').textContent = '';
    document.getElementById('pc-modal').classList.remove('hidden');
    form.elements['name'].focus();
  }
  function closeClientModal() { document.getElementById('pc-modal').classList.add('hidden'); pcEditingId = null; }
  async function submitClient(e) {
    e.preventDefault();
    const form = document.getElementById('pc-form');
    const data = Object.fromEntries(new FormData(form));
    const msg = document.getElementById('pc-msg');
    if (!data.name.trim()) { msg.style.color = '#D63333'; msg.textContent = 'A name is required.'; return; }
    const btn = document.getElementById('pc-submit');
    btn.disabled = true; btn.style.opacity = '0.7';
    try {
      const res = await api(pcEditingId ? '/api/realtor/clients/' + pcEditingId : '/api/realtor/clients', {
        method: pcEditingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { msg.style.color = '#D63333'; msg.textContent = body.error || 'Could not save the client.'; return; }
      if (pcEditingId) { const i = pcClients.findIndex(x => String(x.id) === String(pcEditingId)); if (i >= 0) pcClients[i] = body; }
      else pcClients.unshift(body);
      closeClientModal();
      renderClientsTable();
    } catch (e2) { msg.style.color = '#D63333'; msg.textContent = 'Network error.'; }
    finally { btn.disabled = false; btn.style.opacity = ''; }
  }
  // Import / export past clients
  function pcImportMsg(text, kind) {
    const el = document.getElementById('pc-import-msg'); if (!el) return;
    el.style.color = kind === 'err' ? '#D63333' : kind === 'ok' ? '#138A4B' : 'var(--text-muted)';
    el.textContent = text || '';
  }
  function mapClientImportRow(obj) {
    const pick = (re) => { for (const k of Object.keys(obj)) { if (re.test(k)) { const v = String(obj[k] == null ? '' : obj[k]).trim(); if (v) return v; } } return ''; };
    const norm = (v, list) => { const t = v.toLowerCase(); return list.find(x => x.toLowerCase() === t) || (list.find(x => t.includes(x.toLowerCase())) || ''); };
    let cd = pick(/closed ?date|close ?date|date/i);
    const m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(cd) || /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(cd);
    if (m) { cd = m[1].length === 4 ? `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}` : `${m[3]}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`; }
    else cd = '';
    return {
      name: pick(/^name$|full ?name|client|contact/i),
      phone: pick(/phone|mobile|\bcell\b/i),
      email: pick(/e-?mail/i),
      dealType: norm(pick(/deal|bought|sold|transaction/i), ['Bought', 'Sold', 'Both']),
      address: pick(/address|property|location/i),
      price: pick(/price|sale|amount|value/i),
      zipcode: pick(/zip|postal/i),
      closedDate: cd,
      notes: pick(/notes?|comments?/i)
    };
  }
  async function handleClientImport(file) {
    if (!file) return;
    if (typeof XLSX === 'undefined') { pcImportMsg('Spreadsheet reader failed to load — retry.', 'err'); return; }
    pcImportMsg('Reading file…');
    let objs;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const wb = XLSX.read(buf, { type: 'array' });
      objs = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    } catch (e) { pcImportMsg('Could not read that file. Use a .csv, .xls, or .xlsx with a header row.', 'err'); return; }
    const rows = (objs || []).map(mapClientImportRow).filter(r => r.name);
    if (!rows.length) { pcImportMsg('No rows with a Name column were found.', 'err'); return; }
    pcImportMsg(`Importing ${rows.length} client${rows.length === 1 ? '' : 's'}…`);
    try {
      const res = await api('/api/realtor/clients/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { pcImportMsg(body.error || 'Import failed.', 'err'); return; }
      await loadClients();
      pcImportMsg(`Imported ${body.imported} client${body.imported === 1 ? '' : 's'}` + (body.skipped ? ` · ${body.skipped} skipped (no name)` : ''), 'ok');
    } catch (e) { pcImportMsg('Network error.', 'err'); }
  }
  function exportClients() {
    if (!pcClients.length) { pcImportMsg('No clients to export yet.', 'err'); return; }
    const cols = [['Name', 'name'], ['Phone', 'phone'], ['Email', 'email'], ['Deal', 'dealType'], ['Property', 'address'], ['Sale price', 'price'], ['Closed date', 'closedDate'], ['Looking to', 'intent'], ['Budget', 'budget'], ['Property type', 'propertyType'], ['Area', 'area'], ['Notes', 'notes']];
    const escCsv = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [cols.map(c => c[0]).join(',')].concat(pcClients.map(c => cols.map(col => escCsv(c[col[1]])).join(',')));
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'past-clients.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }
  function bindClients() {
    document.getElementById('pc-close').addEventListener('click', closeClientModal);
    document.getElementById('pc-cancel').addEventListener('click', closeClientModal);
    document.getElementById('pc-backdrop').addEventListener('click', closeClientModal);
    document.getElementById('pc-form').addEventListener('submit', submitClient);
    document.getElementById('pc-file').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; handleClientImport(f); e.target.value = ''; });
    document.getElementById('rp-view').addEventListener('click', async (e) => {
      const view = e.target.closest('[data-pc-view]');
      if (view) { openClientDetail(view.getAttribute('data-pc-view')); return; }
      const editBtn = e.target.closest('[data-pc-edit]');
      if (editBtn) { const c = pcClients.find(x => String(x.id) === editBtn.getAttribute('data-pc-edit')); if (c) openClientModal(c); return; }
      const del = e.target.closest('[data-pc-del]');
      if (del) {
        const id = del.getAttribute('data-pc-del'); const name = del.getAttribute('data-pc-name') || 'this client';
        if (!window.confirm(`Remove ${name} from past clients?`)) return;
        try {
          const res = await api('/api/realtor/clients/' + id, { method: 'DELETE' });
          if (!res.ok && res.status !== 404) { window.alert('Could not remove the client.'); return; }
          pcClients = pcClients.filter(x => String(x.id) !== String(id));
          renderClientsTable();
        } catch (err) { window.alert('Network error.'); }
      }
    });
  }

  // ----- Calls: prioritized "who to call" + call log -----
  let rkQueue = [], rkCalls = [], rkTarget = null;
  function priPill(p) { return p === 'High' ? 'pill-red' : p === 'Medium' ? 'pill-yellow' : 'pill-gray'; }
  function rkTimeAgo(at) {
    const d = new Date(at); if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' +
      d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function renderCalls() {
    const view = document.getElementById('rp-view');
    view.innerHTML = `
      <div class="mb-5">
        <h1 class="text-[24px] font-bold tracking-tight">Calls</h1>
        <p class="text-[13.5px] text-muted mt-1">Who to call next, ranked by how ready each lead is from the info you've captured.</p>
      </div>
      <div class="grid grid-cols-12 gap-5">
        <div class="panel col-span-12 lg:col-span-7">
          <div class="p-5 pb-3"><h3 class="text-[15px] font-semibold">Who to call <span id="rk-q-count" class="text-muted font-normal"></span></h3></div>
          <div class="overflow-x-auto"><table class="lf-table lf-cards" id="rk-queue"></table></div>
        </div>
        <div class="panel col-span-12 lg:col-span-5">
          <div class="p-5 pb-3"><h3 class="text-[15px] font-semibold">Recent calls</h3></div>
          <div id="rk-log" class="px-5 pb-5"></div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
    loadCalls();
  }
  async function loadCalls() {
    try {
      const [q1, c1] = await Promise.all([api('/api/realtor/call-queue', { cache: 'no-store' }), api('/api/realtor/calls', { cache: 'no-store' })]);
      rkQueue = q1.ok ? await q1.json() : [];
      rkCalls = c1.ok ? await c1.json() : [];
    } catch (e) { rkQueue = []; rkCalls = []; }
    renderQueue(); renderCallLog();
  }
  function renderQueue() {
    const table = document.getElementById('rk-queue'); if (!table) return;
    const countEl = document.getElementById('rk-q-count'); if (countEl) countEl.textContent = rkQueue.length ? `(${rkQueue.length})` : '';
    if (!rkQueue.length) {
      table.innerHTML = `<tbody><tr><td><div class="text-center py-12">
        <div class="mx-auto mb-3 stat-icon" style="background:var(--surface-3);width:46px;height:46px;border-radius:12px;"><i data-lucide="phone" style="width:20px;height:20px;color:#8A8AA0;"></i></div>
        <div class="text-[14px] font-semibold mb-1">No one to call right now</div>
        <div class="text-[13px] text-muted">Add leads with a phone number and they'll be ranked here. Anyone you called in the last 2 days is hidden.</div>
      </div></td></tr></tbody>`;
      if (window.lucide) lucide.createIcons();
      return;
    }
    table.innerHTML = `
      <thead><tr><th>Name</th><th>Priority</th><th>Why</th><th>Phone</th><th>Action</th></tr></thead>
      <tbody>
        ${rkQueue.map(p => `
          <tr>
            <td data-col="name"><span class="font-semibold text-[13px]">${esc(p.name)}</span></td>
            <td data-label="Priority"><span class="pill ${priPill(p.priority)}">${esc(p.priority)}</span></td>
            <td class="text-muted" data-label="Why">${esc(p.reason)}</td>
            <td data-label="Phone">${esc(p.phone)}</td>
            <td data-col="actions">
              <div class="flex items-center gap-1">
                ${telLink(p.phone) ? `<a href="${escAttr(telLink(p.phone))}" data-rk-callnow="${p.leadId}" data-rk-name="${escAttr(p.name)}" data-rk-phone="${escAttr(p.phone)}" class="btn-icon" title="Call & log" style="width:30px;height:30px;"><i data-lucide="phone" style="width:13px;height:13px;color:#2255a3;pointer-events:none;"></i></a>` : ''}
                ${smsLink(p.phone) ? `<a href="${escAttr(smsLink(p.phone))}" class="btn-icon" title="Text" style="width:30px;height:30px;"><i data-lucide="message-square" style="width:13px;height:13px;color:#2255a3;pointer-events:none;"></i></a>` : ''}
                <button class="btn-secondary" data-rk-log="${p.leadId}" data-rk-name="${escAttr(p.name)}" data-rk-phone="${escAttr(p.phone)}" style="padding:5px 10px;font-size:12px;">Log call</button>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>`;
    if (window.lucide) lucide.createIcons();
  }
  function renderCallLog() {
    const host = document.getElementById('rk-log'); if (!host) return;
    if (!rkCalls.length) { host.innerHTML = `<div class="text-[13px] text-muted py-2">No calls logged yet.</div>`; return; }
    const outPill = (o) => o === 'Connected' ? 'pill-green' : o === 'Voicemail' ? 'pill-yellow' : 'pill-gray';
    host.innerHTML = `<div class="flex flex-col gap-2">
      ${rkCalls.slice(0, 25).map(c => `
        <div class="rounded-lg p-3" style="border:1px solid var(--border);">
          <div class="flex items-center justify-between gap-2">
            <span class="font-semibold text-[13px]">${esc(c.name)}</span>
            <span class="pill ${outPill(c.outcome)}" style="font-size:11px;">${esc(c.outcome)}</span>
          </div>
          <div class="text-[11.5px] text-muted mt-0.5">${esc(rkTimeAgo(c.loggedAt))}${c.notes ? ' · ' + esc(c.notes) : ''}</div>
        </div>`).join('')}
    </div>`;
  }
  // Log-call modal
  function openLogCall(target) {
    rkTarget = target;
    document.getElementById('rk-who').textContent = target.name + (target.phone ? ` · ${target.phone}` : '');
    document.getElementById('rk-outcome').value = 'Connected';
    document.getElementById('rk-notes').value = '';
    document.getElementById('rk-msg').textContent = '';
    document.getElementById('rk-modal').classList.remove('hidden');
  }
  function closeLogCall() { document.getElementById('rk-modal').classList.add('hidden'); rkTarget = null; }
  async function saveLogCall() {
    if (!rkTarget) return;
    const msg = document.getElementById('rk-msg');
    const btn = document.getElementById('rk-save');
    btn.disabled = true; btn.style.opacity = '0.7';
    try {
      const payload = { leadId: rkTarget.leadId, name: rkTarget.name, phone: rkTarget.phone, outcome: document.getElementById('rk-outcome').value, notes: document.getElementById('rk-notes').value };
      const res = await api('/api/realtor/calls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { msg.style.color = '#D63333'; msg.textContent = body.error || 'Could not log the call.'; return; }
      closeLogCall();
      await loadCalls();   // refresh queue (callee drops off) + history
      if (active === 'home') { await loadHome(); renderHome(); }   // keep the dashboard's "Call today" fresh
    } catch (e) { msg.style.color = '#D63333'; msg.textContent = 'Network error.'; }
    finally { btn.disabled = false; btn.style.opacity = ''; }
  }
  function bindCalls() {
    document.getElementById('rk-close').addEventListener('click', closeLogCall);
    document.getElementById('rk-cancel').addEventListener('click', closeLogCall);
    document.getElementById('rk-backdrop').addEventListener('click', closeLogCall);
    document.getElementById('rk-save').addEventListener('click', saveLogCall);
    // Clicking "Call" anywhere (queue or a lead's detail modal) dials via the
    // tel: link AND opens the log modal so the call gets recorded right after.
    document.addEventListener('click', (e) => {
      const callBtn = e.target.closest('[data-rk-callnow]');
      if (callBtn) openLogCall({ leadId: parseInt(callBtn.getAttribute('data-rk-callnow'), 10) || null, name: callBtn.getAttribute('data-rk-name'), phone: callBtn.getAttribute('data-rk-phone') || '' });
    });
    document.getElementById('rp-view').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rk-log]');
      if (b) openLogCall({ leadId: parseInt(b.getAttribute('data-rk-log'), 10) || null, name: b.getAttribute('data-rk-name'), phone: b.getAttribute('data-rk-phone') || '' });
    });
  }

  // ----- Follow-ups (personal tasks) -----
  let rtTasks = [], rtEditingId = null, rtLeadCtx = null;
  function rtPriPill(p) { return p === 'High' ? 'pill-red' : p === 'Low' ? 'pill-gray' : 'pill-yellow'; }
  function rtDateLabel(due) {
    if (!due) return '';
    const today = todayStr();
    if (due < today) return 'Overdue';
    if (due === today) return 'Today';
    const d = new Date(due + 'T00:00:00');
    return isNaN(d.getTime()) ? due : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function rtBucket(t) {
    if (t.status === 'done') return 'done';
    const today = todayStr();
    if (!t.due) return 'someday';
    if (t.due < today) return 'overdue';
    if (t.due === today) return 'today';
    return 'upcoming';
  }
  function renderTasks() {
    const view = document.getElementById('rp-view');
    view.innerHTML = `
      <div class="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 class="text-[24px] font-bold tracking-tight">Follow-ups</h1>
          <p class="text-[13.5px] text-muted mt-1">Your personal reminders — call-backs, paperwork, anything you don't want to forget.</p>
        </div>
        <button id="rt-add" class="btn-primary"><i data-lucide="plus" style="width:14px;height:14px;"></i> Add follow-up</button>
      </div>
      <div id="rt-list"></div>`;
    document.getElementById('rt-add').addEventListener('click', () => openTaskModal(null, null));
    if (window.lucide) lucide.createIcons();
    loadTasks();
  }
  async function loadTasks() {
    try { const r = await api('/api/realtor/tasks', { cache: 'no-store' }); rtTasks = r.ok ? await r.json() : []; }
    catch (e) { rtTasks = []; }
    renderTaskList();
  }
  function taskRow(t) {
    const done = t.status === 'done';
    const dl = rtDateLabel(t.due);
    const overdue = !done && t.due && t.due < todayStr();
    return `
      <div class="flex items-center gap-3 px-4 py-3" style="border-bottom:1px solid var(--border-soft);">
        <button class="flex-shrink-0" data-rt-toggle="${t.id}" title="${done ? 'Mark as not done' : 'Mark done'}" style="width:20px;height:20px;border-radius:6px;border:1.5px solid ${done ? '#138A4B' : 'var(--border-strong)'};background:${done ? '#138A4B' : 'transparent'};display:flex;align-items:center;justify-content:center;cursor:pointer;">
          ${done ? '<i data-lucide="check" style="width:13px;height:13px;color:#fff;pointer-events:none;"></i>' : ''}
        </button>
        <div class="min-w-0 flex-1">
          <div class="text-[13.5px] font-medium ${done ? 'line-through' : ''}" style="${done ? 'color:var(--text-muted);' : ''}word-break:break-word;">${esc(t.title)}${t.auto ? ` <span class="pill" style="${toneStyle('yellow')}font-size:9.5px;vertical-align:middle;">Auto</span>` : ''}</div>
          <div class="flex items-center gap-2 mt-0.5">
            ${t.leadName ? `<span class="text-[11.5px] text-muted">${esc(t.leadName)}</span>` : ''}
            ${dl ? `<span class="text-[11.5px] ${overdue ? 'font-semibold' : 'text-muted'}" style="${overdue ? 'color:#D63333;' : ''}">${esc(dl)}</span>` : ''}
          </div>
        </div>
        <span class="pill ${rtPriPill(t.priority)}" style="font-size:10.5px;">${esc(t.priority)}</span>
        <div class="flex items-center gap-1 flex-shrink-0">
          <button class="btn-icon" data-rt-edit="${t.id}" title="Edit" style="width:30px;height:30px;"><i data-lucide="pencil" style="width:13px;height:13px;color:var(--text-muted);pointer-events:none;"></i></button>
          <button class="btn-icon" data-rt-del="${t.id}" data-rt-title="${escAttr(t.title)}" title="Delete" style="width:30px;height:30px;border:none;"><i data-lucide="trash-2" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i></button>
        </div>
      </div>`;
  }
  function renderTaskList() {
    const host = document.getElementById('rt-list'); if (!host) return;
    if (!rtTasks.length) {
      host.innerHTML = `<div class="panel p-10 text-center">
        <div class="mx-auto mb-3 stat-icon" style="background:var(--surface-3);width:48px;height:48px;border-radius:12px;"><i data-lucide="list-checks" style="width:22px;height:22px;color:#8A8AA0;"></i></div>
        <div class="text-[14px] font-semibold mb-1">No follow-ups yet</div>
        <div class="text-[13px] text-muted mb-4">Add a reminder to call someone back or chase down paperwork.</div>
        <button class="btn-primary" onclick="document.getElementById('rt-add').click()"><i data-lucide="plus" style="width:14px;height:14px;"></i> Add follow-up</button>
      </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }
    const groups = [
      { id: 'overdue', label: 'Overdue', tone: 'red' },
      { id: 'today', label: 'Today', tone: 'blue' },
      { id: 'upcoming', label: 'Upcoming', tone: 'gray' },
      { id: 'someday', label: 'No date', tone: 'gray' },
      { id: 'done', label: 'Completed', tone: 'green' }
    ];
    const byBucket = {};
    rtTasks.forEach(t => { const b = rtBucket(t); (byBucket[b] = byBucket[b] || []).push(t); });
    host.innerHTML = groups.filter(g => (byBucket[g.id] || []).length).map(g => `
      <div class="panel mb-4">
        <div class="px-4 py-3 flex items-center gap-2" style="border-bottom:1px solid var(--border);">
          <span class="text-[13px] font-semibold">${g.label}</span>
          <span class="pill" style="${toneStyle(g.tone)}font-size:10.5px;">${byBucket[g.id].length}</span>
        </div>
        ${byBucket[g.id].map(taskRow).join('')}
      </div>`).join('');
    if (window.lucide) lucide.createIcons();
  }
  function openTaskModal(task, leadCtx) {
    const form = document.getElementById('rt-form');
    form.reset();
    rtEditingId = (task && task.id) ? task.id : null;
    rtLeadCtx = leadCtx || (task && task.leadId ? { id: task.leadId, name: task.leadName } : null);
    document.getElementById('rt-modal-title').textContent = rtEditingId ? 'Edit follow-up' : 'Add a follow-up';
    document.getElementById('rt-submit').textContent = rtEditingId ? 'Save changes' : 'Add follow-up';
    document.getElementById('rt-who').textContent = rtLeadCtx && rtLeadCtx.name
      ? `For ${rtLeadCtx.name}` : 'Set a reminder so nothing slips.';
    if (task) {
      form.elements['title'].value = task.title || '';
      form.elements['due'].value = task.due || '';
      form.elements['priority'].value = ['High', 'Medium', 'Low'].includes(task.priority) ? task.priority : 'Medium';
    }
    document.getElementById('rt-msg').textContent = '';
    document.getElementById('rt-modal').classList.remove('hidden');
    form.elements['title'].focus();
  }
  function closeTaskModal() { document.getElementById('rt-modal').classList.add('hidden'); rtEditingId = null; rtLeadCtx = null; }
  async function submitTask(e) {
    e.preventDefault();
    const form = document.getElementById('rt-form');
    const data = Object.fromEntries(new FormData(form));
    const msg = document.getElementById('rt-msg');
    if (!String(data.title || '').trim()) { msg.textContent = 'A task is required.'; return; }
    const payload = { title: data.title, due: data.due, priority: data.priority };
    if (rtLeadCtx && rtLeadCtx.id) payload.leadId = parseInt(rtLeadCtx.id, 10) || null;
    const btn = document.getElementById('rt-submit');
    btn.disabled = true; btn.style.opacity = '0.7';
    try {
      const res = await api(rtEditingId ? '/api/realtor/tasks/' + rtEditingId : '/api/realtor/tasks', {
        method: rtEditingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { msg.textContent = body.error || 'Could not save the follow-up.'; return; }
      if (rtEditingId) { const i = rtTasks.findIndex(t => String(t.id) === String(rtEditingId)); if (i >= 0) rtTasks[i] = body; }
      else rtTasks.unshift(body);
      closeTaskModal();
      if (active === 'tasks') renderTaskList();
    } catch (e2) { msg.textContent = 'Network error.'; }
    finally { btn.disabled = false; btn.style.opacity = ''; }
  }
  async function toggleTask(id) {
    const t = rtTasks.find(x => String(x.id) === String(id)); if (!t) return;
    const next = t.status === 'done' ? 'todo' : 'done';
    try {
      const res = await api('/api/realtor/tasks/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const i = rtTasks.findIndex(x => String(x.id) === String(id)); if (i >= 0) rtTasks[i] = body;
      renderTaskList();
    } catch (e) {}
  }
  function bindTasks() {
    document.getElementById('rt-close').addEventListener('click', closeTaskModal);
    document.getElementById('rt-cancel').addEventListener('click', closeTaskModal);
    document.getElementById('rt-backdrop').addEventListener('click', closeTaskModal);
    document.getElementById('rt-form').addEventListener('submit', submitTask);
    document.getElementById('rp-view').addEventListener('click', async (e) => {
      const tg = e.target.closest('[data-rt-toggle]');
      if (tg) { toggleTask(tg.getAttribute('data-rt-toggle')); return; }
      const ed = e.target.closest('[data-rt-edit]');
      if (ed) { const t = rtTasks.find(x => String(x.id) === ed.getAttribute('data-rt-edit')); if (t) openTaskModal(t, null); return; }
      const dl = e.target.closest('[data-rt-del]');
      if (dl) {
        const id = dl.getAttribute('data-rt-del'); const title = dl.getAttribute('data-rt-title') || 'this follow-up';
        if (!window.confirm(`Delete “${title}”?`)) return;
        try {
          const res = await api('/api/realtor/tasks/' + id, { method: 'DELETE' });
          if (!res.ok && res.status !== 404) { window.alert('Could not delete the follow-up.'); return; }
          rtTasks = rtTasks.filter(x => String(x.id) !== String(id));
          renderTaskList();
        } catch (err) { window.alert('Network error.'); }
      }
    });
  }

  // ----- Chat with the loan officer (top-bar modal) -----
  let chatCount = -1, unseen = 0, chatStarted = false;
  function updateChatBadge() {
    const b = document.getElementById('rp-chat-badge');
    if (!b) return;
    b.style.display = unseen > 0 ? 'inline-flex' : 'none';
    b.textContent = unseen > 9 ? '9+' : String(unseen);
  }
  function chatTime(at) {
    const d = new Date(at); if (isNaN(d.getTime())) return '';
    let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
    const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return `${h}:${m} ${ap}`;
  }
  // One date divider per calendar day, with a friendly label.
  function chatDayKey(at) { const d = new Date(at); return isNaN(d.getTime()) ? '' : d.toDateString(); }
  function chatDateLabel(at) {
    const d = new Date(at); if (isNaN(d.getTime())) return '';
    const today = new Date(); const key = d.toDateString();
    if (key === today.toDateString()) return 'Today';
    const yest = new Date(today); yest.setDate(today.getDate() - 1);
    if (key === yest.toDateString()) return 'Yesterday';
    const sameYear = d.getFullYear() === today.getFullYear();
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
  }
  function renderChat(messages) {
    const host = document.getElementById('rp-chat');
    if (!host) return;
    if (!messages.length) { host.innerHTML = `<div class="text-[12.5px] text-muted text-center py-8">No messages yet. Say hello 👋</div>`; return; }
    let lastDay = '';
    host.innerHTML = messages.map(m => {
      const mine = m.mine, align = mine ? 'align-items:flex-end;' : 'align-items:flex-start;';
      const bg = mine ? 'background:#2255a3;color:#fff;' : 'background:var(--surface-2);color:var(--text);';
      const k = chatDayKey(m.at);
      let divider = '';
      if (k && k !== lastDay) {
        lastDay = k;
        divider = `<div class="flex items-center justify-center my-2"><span class="text-[10.5px] font-medium text-soft" style="background:var(--surface-3);border-radius:999px;padding:2px 10px;">${esc(chatDateLabel(m.at))}</span></div>`;
      }
      return `${divider}<div class="flex flex-col" style="${align}">
        <div style="max-width:80%;${bg}border-radius:12px;padding:7px 11px;font-size:13px;white-space:pre-wrap;word-break:break-word;">${esc(m.body)}</div>
        <div class="text-[10.5px] text-soft mt-0.5">${chatTime(m.at)}</div>
      </div>`;
    }).join('');
  }
  async function loadChat(scroll) {
    try {
      const res = await api('/api/realtor/chat', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const msgs = data.messages || [];
      const open = !document.getElementById('rp-chat-modal').classList.contains('hidden');
      if (open) renderChat(msgs);
      if (chatCount < 0) {
        chatCount = msgs.length;                       // first load: baseline, no badge
      } else if (msgs.length > chatCount) {
        const grewBy = msgs.length - chatCount;
        chatCount = msgs.length;
        if (open) { const h = document.getElementById('rp-chat'); if (h) h.scrollTop = h.scrollHeight; }
        else { unseen += grewBy; updateChatBadge(); }  // new message while chat closed
      } else {
        chatCount = msgs.length;
      }
      if (open && scroll) { const h = document.getElementById('rp-chat'); if (h) h.scrollTop = h.scrollHeight; }
    } catch (e) {}
  }
  async function sendChat() {
    const input = document.getElementById('rp-chat-input');
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    try {
      const res = await api('/api/realtor/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
      if (!res.ok) { input.value = body; return; }
      await loadChat(true);
    } catch (e) { input.value = body; }
  }
  function openChat() {
    document.getElementById('rp-chat-modal').classList.remove('hidden');
    unseen = 0; updateChatBadge();
    if (window.lucide) lucide.createIcons();
    document.getElementById('rp-chat-input').focus();
    loadChat(true);
  }
  function closeChat() { document.getElementById('rp-chat-modal').classList.add('hidden'); }
  // Quick emojis relevant to a loan-officer / realtor conversation.
  const CHAT_EMOJIS = ['🏠', '🏡', '🔑', '📄', '✍️', '🤝', '💰', '📊', '📈', '📅', '📞', '📧', '✅', '👍', '🎉', '⏳'];
  function insertEmoji(inputId, em) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const start = input.selectionStart != null ? input.selectionStart : input.value.length;
    const end = input.selectionEnd != null ? input.selectionEnd : input.value.length;
    input.value = input.value.slice(0, start) + em + input.value.slice(end);
    const pos = start + em.length;
    input.focus();
    try { input.setSelectionRange(pos, pos); } catch (e) {}
  }
  function renderEmojiRow(hostId, inputId) {
    const host = document.getElementById(hostId);
    if (!host) return;
    host.innerHTML = CHAT_EMOJIS.map(e => `<button type="button" data-emoji="${e}" title="${e}" style="font-size:18px;line-height:1;padding:3px 5px;border:none;background:none;cursor:pointer;border-radius:6px;">${e}</button>`).join('');
    host.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-emoji]');
      if (b) insertEmoji(inputId, b.getAttribute('data-emoji'));
    });
  }
  function startChat(officerName) {
    if (officerName) document.getElementById('rp-chat-officer').textContent = officerName.split(/\s+/)[0] || 'your loan officer';
    if (chatStarted) return;
    chatStarted = true;
    renderEmojiRow('rp-chat-emojis', 'rp-chat-input');
    document.getElementById('rp-chat-btn').addEventListener('click', openChat);
    document.getElementById('rp-chat-close').addEventListener('click', closeChat);
    document.getElementById('rp-chat-backdrop').addEventListener('click', closeChat);
    document.getElementById('rp-chat-send').addEventListener('click', sendChat);
    document.getElementById('rp-chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } });
    loadChat(false);
    setInterval(loadChat, 5000);
  }

  // ----- Sidebar (collapsible; closed by default, choice remembered) -----
  function setSidebar(open) {
    const sb = document.getElementById('rp-sidebar');
    if (!sb) return;
    sb.style.display = open ? '' : 'none';   // '' reverts to the .flex from the class
    try { localStorage.setItem('rp-sidebar-open', open ? '1' : '0'); } catch (e) {}
  }
  function applyStoredSidebar() {
    let open = false;   // default closed
    try { open = localStorage.getItem('rp-sidebar-open') === '1'; } catch (e) {}
    setSidebar(open);
  }
  function bindSidebar() {
    const menuBtn = document.getElementById('rp-menu-btn');
    if (menuBtn) menuBtn.addEventListener('click', () => {
      const sb = document.getElementById('rp-sidebar');
      setSidebar(!sb || sb.style.display === 'none');   // toggle
    });
    const closeBtn = document.getElementById('rp-sidebar-close');
    if (closeBtn) closeBtn.addEventListener('click', () => setSidebar(false));
  }

  // ----- Boot -----
  function bindTheme() {
    document.getElementById('rp-theme').addEventListener('click', function () {
      const dark = document.documentElement.classList.toggle('dark');
      try { localStorage.setItem('lf-theme', dark ? 'dark' : 'light'); } catch (e) {}
      this.innerHTML = `<i data-lucide="${dark ? 'sun' : 'moon'}" style="width:16px;height:16px;color:var(--text-muted);"></i>`;
      if (window.lucide) lucide.createIcons();
    });
  }
  function bindUserMenu() {
    const btn = document.getElementById('rp-user-btn');
    const dd = document.getElementById('rp-user-dropdown');
    btn.addEventListener('click', (e) => { e.stopPropagation(); dd.classList.toggle('hidden'); });
    document.addEventListener('click', () => dd.classList.add('hidden'));
    document.getElementById('rp-logout').addEventListener('click', async () => {
      try { await api('/api/logout', { method: 'POST' }); } catch (e) {}
      window.location.href = '/login.html';
    });
  }

  async function enterPortal() {
    show('rp-loading', false);
    show('rp-shell', true);
    applyStoredSidebar();   // closed by default; honors the realtor's last choice
    // Fill the user chrome.
    document.getElementById('rp-user-name').textContent = me.name || '';
    document.getElementById('rp-user-email').textContent = me.email || '';
    document.getElementById('rp-avatar').textContent = initials(me.name);
    document.getElementById('rp-theme').innerHTML = `<i data-lucide="${document.documentElement.classList.contains('dark') ? 'sun' : 'moon'}" style="width:16px;height:16px;color:var(--text-muted);"></i>`;
    renderNav();
    setSection((location.hash || '').replace('#', '') || 'home');
    if (window.lucide) lucide.createIcons();
    // Chat: officer name + unread badge.
    try {
      const res = await api('/api/realtor/portal');
      if (res.ok) {
        const d = await res.json();
        startChat(d.officer ? d.officer.name : '');
      } else { startChat(''); }
    } catch (e) { startChat(''); }
    // Home badge: load once for the sidebar, then refresh while away from Home.
    if (active !== 'home') { await loadHome(); renderNav(); }
    setInterval(() => { if (active !== 'home') loadHome().then(() => renderNav()); }, 60000);
  }

  document.addEventListener('DOMContentLoaded', async function () {
    bindNav(); bindTheme(); bindUserMenu(); bindSidebar(); bindLeads(); bindClose(); bindContacts(); bindCalls(); bindClients(); bindTasks(); bindHome();
    let res;
    try { res = await api('/api/me', { cache: 'no-store' }); } catch (e) { window.location.href = '/login.html'; return; }
    if (!res.ok) { window.location.href = '/login.html'; return; }
    me = await res.json();
    if (me.role !== 'realtor') { window.location.href = '/index.html'; return; }
    // No blocking gate — realtors go straight in and can change their temporary
    // password anytime under Settings (like every other member).
    await enterPortal();
  });
})();
