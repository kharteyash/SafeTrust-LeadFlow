// Realtor portal: a sandboxed, sidebar-driven app for realtors. Sections switch
// client-side (hash routing) so the realtor stays on the single allowed page.
// Section contents are placeholders for now — to be filled in one by one.
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function initials(name) { return (name || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?'; }
  function show(id, on) { const el = document.getElementById(id); if (el) el.classList.toggle('hidden', !on); }
  function api(url, opts) { return fetch(url, Object.assign({ credentials: 'same-origin' }, opts || {})); }

  const SECTIONS = [
    { id: 'leads',    label: 'Leads',        icon: 'user-plus' },
    { id: 'clients',  label: 'Past Clients', icon: 'user-check' },
    { id: 'contacts', label: 'All Contacts', icon: 'contact' },
    { id: 'calls',    label: 'Calls',        icon: 'phone' },
    { id: 'settings', label: 'Settings',     icon: 'settings' }
  ];

  let me = null;
  let active = 'leads';

  // ----- Sidebar + routing -----
  function renderNav() {
    document.getElementById('rp-nav').innerHTML = SECTIONS.map(s => `
      <a href="#${s.id}" class="nav-item ${active === s.id ? 'active' : ''}" data-section="${s.id}" title="${s.label}">
        <i data-lucide="${s.icon}"></i>
        <span class="nav-label">${s.label}</span>
      </a>`).join('');
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
    return `
      <div class="mb-5">
        <h1 class="text-[24px] font-bold tracking-tight">Settings</h1>
        <p class="text-[13.5px] text-muted mt-1">Manage your account.</p>
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
    if (active === 'settings') {
      view.innerHTML = renderSettings();
      bindChangePassword();
    } else if (active === 'leads') {
      renderLeads();
    } else {
      const s = SECTIONS.find(x => x.id === active);
      view.innerHTML = placeholder(s ? s.label : 'Section', 'Tell us what you want here.');
    }
    if (window.lucide) lucide.createIcons();
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
        <div class="overflow-x-auto"><table class="lf-table" id="rl-table"></table></div>
      </div>`;
    document.getElementById('rl-add').addEventListener('click', openLeadModal);
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
      <thead><tr><th>Name</th><th>Contact</th><th>Looking to</th><th>Timeline</th><th>Budget</th><th>Area</th><th>Financing</th><th></th></tr></thead>
      <tbody>
        ${rows.length ? rows.map(l => `
          <tr>
            <td><span class="font-semibold text-[13px]">${esc(l.name)}</span></td>
            <td class="text-muted">${[l.phone, l.email].filter(Boolean).map(esc).join('<br>') || '—'}</td>
            <td>${l.intent ? `<span class="pill ${intentPill(l.intent)}">${esc(l.intent)}</span>` : '<span class="text-soft">—</span>'}</td>
            <td>${esc(l.timeline) || '<span class="text-soft">—</span>'}</td>
            <td>${esc(l.budget) || '<span class="text-soft">—</span>'}</td>
            <td class="text-muted">${esc(l.area) || '—'}</td>
            <td>${esc(l.financing) || '<span class="text-soft">—</span>'}</td>
            <td style="text-align:right;">
              <button class="btn-icon" data-del-lead="${l.id}" data-lead-name="${esc(l.name)}" title="Delete lead" style="width:30px;height:30px;border:none;">
                <i data-lucide="trash-2" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i>
              </button>
            </td>
          </tr>`).join('') : `<tr><td colspan="8" class="text-center py-8 text-muted">No leads match that search.</td></tr>`}
      </tbody>`;
    if (window.lucide) lucide.createIcons();
  }

  // Add-lead modal
  function openLeadModal() {
    const form = document.getElementById('rl-form');
    form.reset();
    document.getElementById('rl-msg').textContent = '';
    document.getElementById('rl-modal').classList.remove('hidden');
    form.elements['name'].focus();
  }
  function closeLeadModal() { document.getElementById('rl-modal').classList.add('hidden'); }
  async function submitLead(e) {
    e.preventDefault();
    const form = document.getElementById('rl-form');
    const data = Object.fromEntries(new FormData(form));
    const msg = document.getElementById('rl-msg');
    if (!data.name.trim()) { msg.style.color = '#D63333'; msg.textContent = 'A name is required.'; return; }
    const btn = document.getElementById('rl-submit');
    btn.disabled = true; btn.style.opacity = '0.7';
    try {
      const res = await api('/api/realtor/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { msg.style.color = '#D63333'; msg.textContent = body.error || 'Could not add the lead.'; return; }
      rlLeads.unshift(body);
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
      financing: norm(pick(/financing|pre-?approv|lender|cash|loan/i), ['Pre-approved', 'Needs a lender', 'Paying cash', 'Not sure']),
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
    const cols = [['Name', 'name'], ['Phone', 'phone'], ['Email', 'email'], ['Looking to', 'intent'], ['Timeline', 'timeline'], ['Budget', 'budget'], ['Property type', 'propertyType'], ['Area', 'area'], ['Financing', 'financing'], ['Notes', 'notes']];
    const escCsv = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [cols.map(c => c[0]).join(',')].concat(rlLeads.map(l => cols.map(c => escCsv(l[c[1]])).join(',')));
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'my-leads.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
    // Delegated delete on the leads table (table is re-rendered, so listen on the view).
    document.getElementById('rp-view').addEventListener('click', async (e) => {
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
    if (!SECTIONS.some(s => s.id === id)) id = 'leads';
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
    window.addEventListener('hashchange', () => setSection((location.hash || '').replace('#', '') || 'leads'));
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
      } catch (e) { msg.textContent = 'Network error.'; }
      finally { btn.disabled = false; btn.style.opacity = ''; }
    });
  }

  // ----- First-login password gate -----
  function bindGate() {
    document.getElementById('rp-gate-save').addEventListener('click', async () => {
      const cur = document.getElementById('rp-cur').value;
      const nw = document.getElementById('rp-new').value;
      const nw2 = document.getElementById('rp-new2').value;
      const msg = document.getElementById('rp-gate-msg');
      msg.style.color = '#D63333';
      if (!cur || !nw) { msg.textContent = 'Fill in all fields.'; return; }
      if (nw.length < 6) { msg.textContent = 'New password must be at least 6 characters.'; return; }
      if (nw !== nw2) { msg.textContent = 'The new passwords don’t match.'; return; }
      const btn = document.getElementById('rp-gate-save');
      btn.disabled = true; btn.style.opacity = '0.7';
      try {
        const res = await api('/api/change-password', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword: cur, newPassword: nw })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { msg.textContent = body.error || 'Could not update your password.'; return; }
        enterPortal();
      } catch (e) { msg.textContent = 'Network error.'; }
      finally { btn.disabled = false; btn.style.opacity = ''; }
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
  function renderChat(messages) {
    const host = document.getElementById('rp-chat');
    if (!host) return;
    if (!messages.length) { host.innerHTML = `<div class="text-[12.5px] text-muted text-center py-8">No messages yet. Say hello 👋</div>`; return; }
    host.innerHTML = messages.map(m => {
      const mine = m.mine, align = mine ? 'align-items:flex-end;' : 'align-items:flex-start;';
      const bg = mine ? 'background:#2255a3;color:#fff;' : 'background:var(--surface-2);color:var(--text);';
      return `<div class="flex flex-col" style="${align}">
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
  function startChat(officerName) {
    if (officerName) document.getElementById('rp-chat-officer').textContent = officerName.split(/\s+/)[0] || 'your loan officer';
    if (chatStarted) return;
    chatStarted = true;
    document.getElementById('rp-chat-btn').addEventListener('click', openChat);
    document.getElementById('rp-chat-close').addEventListener('click', closeChat);
    document.getElementById('rp-chat-backdrop').addEventListener('click', closeChat);
    document.getElementById('rp-chat-send').addEventListener('click', sendChat);
    document.getElementById('rp-chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } });
    loadChat(false);
    setInterval(loadChat, 5000);
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
    show('rp-gate', false);
    show('rp-shell', true);
    // Fill the user chrome.
    document.getElementById('rp-user-name').textContent = me.name || '';
    document.getElementById('rp-user-email').textContent = me.email || '';
    document.getElementById('rp-avatar').textContent = initials(me.name);
    document.getElementById('rp-theme').innerHTML = `<i data-lucide="${document.documentElement.classList.contains('dark') ? 'sun' : 'moon'}" style="width:16px;height:16px;color:var(--text-muted);"></i>`;
    renderNav();
    setSection((location.hash || '').replace('#', '') || 'leads');
    if (window.lucide) lucide.createIcons();
    // Chat: officer name + unread badge.
    try {
      const res = await api('/api/realtor/portal');
      if (res.ok) {
        const d = await res.json();
        startChat(d.officer ? d.officer.name : '');
      } else { startChat(''); }
    } catch (e) { startChat(''); }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    bindGate(); bindNav(); bindTheme(); bindUserMenu(); bindLeads();
    let res;
    try { res = await api('/api/me'); } catch (e) { window.location.href = '/login.html'; return; }
    if (!res.ok) { window.location.href = '/login.html'; return; }
    me = await res.json();
    if (me.role !== 'realtor') { window.location.href = '/index.html'; return; }
    if (me.mustChangePassword) {
      show('rp-loading', false);
      show('rp-gate', true);
      if (window.lucide) lucide.createIcons();
      return;
    }
    await enterPortal();
  });
})();
