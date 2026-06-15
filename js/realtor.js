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
    } else if (active === 'contacts') {
      renderContacts();
    } else if (active === 'calls') {
      renderCalls();
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
      <thead><tr><th>Name</th><th>Contact</th><th>Looking to</th><th>Timeline</th><th>Budget</th><th>Area</th><th>Financing</th><th>Credit</th><th>Assets</th><th></th></tr></thead>
      <tbody>
        ${rows.length ? rows.map(l => `
          <tr>
            <td><span class="font-semibold text-[13px]" data-rl-view="${l.id}" style="cursor:pointer;color:var(--accent);">${esc(l.name)}</span></td>
            <td class="text-muted">${[l.phone, l.email].filter(Boolean).map(esc).join('<br>') || '—'}</td>
            <td>${l.intent ? `<span class="pill ${intentPill(l.intent)}">${esc(l.intent)}</span>` : '<span class="text-soft">—</span>'}</td>
            <td>${esc(l.timeline) || '<span class="text-soft">—</span>'}</td>
            <td>${esc(l.budget) || '<span class="text-soft">—</span>'}</td>
            <td class="text-muted">${esc(l.area) || '—'}</td>
            <td>${esc(l.financing) || '<span class="text-soft">—</span>'}</td>
            <td>${esc(l.creditScore) || '<span class="text-soft">—</span>'}</td>
            <td class="text-muted">${esc(l.assets) || '—'}</td>
            <td style="text-align:right;">
              <button class="btn-icon" data-del-lead="${l.id}" data-lead-name="${esc(l.name)}" title="Delete lead" style="width:30px;height:30px;border:none;">
                <i data-lucide="trash-2" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i>
              </button>
            </td>
          </tr>`).join('') : `<tr><td colspan="10" class="text-center py-8 text-muted">No leads match that search.</td></tr>`}
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
    const cols = [['Name', 'name'], ['Phone', 'phone'], ['Email', 'email'], ['Looking to', 'intent'], ['Timeline', 'timeline'], ['Budget', 'budget'], ['Property type', 'propertyType'], ['Area', 'area'], ['Financing', 'financing'], ['Credit score', 'creditScore'], ['Assets available', 'assets'], ['Notes', 'notes']];
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
    // Delegated actions on the leads table (table is re-rendered, so listen on the view).
    document.getElementById('rp-view').addEventListener('click', async (e) => {
      const view = e.target.closest('[data-rl-view]');
      if (view) { openLeadDetail(view.getAttribute('data-rl-view')); return; }
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
        if (me) me.mustChangePassword = false;   // clear the temporary-password banner
      } catch (e) { msg.textContent = 'Network error.'; }
      finally { btn.disabled = false; btn.style.opacity = ''; }
    });
  }

  // ----- All Contacts (directory of saved contacts + leads) -----
  let rcContacts = [], rcLeads = [], rcQuery = '', rcFilter = 'all', rcPage = 1, rcEditingId = null, rcMenuTarget = null;
  const RC_FILTERS = [{ id: 'all', label: 'All' }, { id: 'lead', label: 'Leads' }, { id: 'contact', label: 'Contacts' }];
  const RC_PAGE_SIZE = 10;

  function rcPeople() {
    return [].concat(
      rcContacts.map(c => ({ kind: 'contact', id: c.id, name: c.name, email: c.email || '', phone: c.phone || '', company: c.company || '', type: c.tag || 'Contact', raw: c })),
      rcLeads.map(l => ({ kind: 'lead', id: l.id, name: l.name, email: l.email || '', phone: l.phone || '', company: '', type: 'Lead', raw: l }))
    );
  }
  function rcFiltered() {
    let list = rcPeople();
    if (rcFilter !== 'all') list = list.filter(p => p.kind === rcFilter);
    const t = rcQuery.trim().toLowerCase();
    if (t) list = list.filter(p => [p.name, p.email, p.phone, p.company, p.type].some(v => String(v || '').toLowerCase().includes(t)));
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }
  function rcTypePill(kind) { return kind === 'lead' ? 'pill-blue' : 'pill-gray'; }

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
        <div class="overflow-x-auto"><table class="lf-table" id="rc-table"></table></div>
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
      const [c, l] = await Promise.all([api('/api/realtor/contacts', { cache: 'no-store' }), api('/api/realtor/leads', { cache: 'no-store' })]);
      rcContacts = c.ok ? await c.json() : [];
      rcLeads = l.ok ? await l.json() : [];
    } catch (e) { rcContacts = []; rcLeads = []; }
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
              <td><div class="flex items-center gap-2"><div class="avatar avatar-sm">${initials(p.name)}</div>
                <span class="font-semibold text-[13px]" data-rc-view="${p.kind}:${p.id}" style="cursor:pointer;color:var(--accent);">${esc(p.name)}</span></div></td>
              <td><span class="pill ${rcTypePill(p.kind)}">${esc(p.type)}</span></td>
              <td class="text-muted">${esc(p.email) || '—'}</td>
              <td>${esc(p.phone) || '—'}</td>
              <td class="text-muted">${esc(p.company) || '—'}</td>
              <td>${actions}</td>
            </tr>`;
        }).join('') : `<tr><td colspan="6" class="text-center py-8 text-muted">No one matches that search.</td></tr>`}
      </tbody>`;
    // Footer.
    document.getElementById('rc-summary').textContent = total === 0 ? 'No people to show' : `Showing ${start + 1} to ${start + pageRows.length} of ${total}`;
    const pager = document.getElementById('rc-pager');
    if (total <= RC_PAGE_SIZE) { pager.innerHTML = ''; }
    else {
      const pages = []; for (let p = 1; p <= totalPages; p++) pages.push(p);
      pager.innerHTML = `
        <button class="btn-icon" data-rc-page="prev" style="width:30px;height:30px;" ${rcPage === 1 ? 'disabled' : ''}><i data-lucide="chevron-left" style="width:14px;height:14px;color:var(--text-muted);"></i></button>
        ${pages.map(p => `<button data-rc-page="${p}" class="rounded-md text-[12.5px] font-semibold" style="width:30px;height:30px;${p === rcPage ? 'background:#2255a3;color:#FFF;' : 'background:var(--surface);color:var(--text);border:1px solid var(--border-strong);'}">${p}</button>`).join('')}
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
  function phoneActions(ph) {
    let h = '';
    if (telLink(ph)) h += actBtn(telLink(ph), 'phone', 'Call', '#2255a3', false);
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
    rows += detailRow('Phone', p.phone, p.phone ? phoneActions(p.phone) : '');
    rows += detailRow('Email', p.email, p.email ? actBtn(gmailCompose(p.email), 'mail', 'Email', '#2255a3', true) : '');
    rows += detailRow('Company', p.company);
    if (p.kind === 'lead') {
      rows += detailRow('Looking to', r.intent); rows += detailRow('Timeline', r.timeline); rows += detailRow('Budget', r.budget);
      rows += detailRow('Property type', r.propertyType); rows += detailRow('Area', r.area); rows += detailRow('Financing', r.financing);
      rows += detailRow('Credit score', r.creditScore); rows += detailRow('Assets', r.assets); rows += detailRow('Notes', r.notes);
    }
    document.getElementById('rc-detail-body').innerHTML = rows || '<div class="text-[13px] text-muted py-2">No details.</div>';
    document.getElementById('rc-detail').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
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
          <div class="overflow-x-auto"><table class="lf-table" id="rk-queue"></table></div>
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
            <td><span class="font-semibold text-[13px]">${esc(p.name)}</span></td>
            <td><span class="pill ${priPill(p.priority)}">${esc(p.priority)}</span></td>
            <td class="text-muted">${esc(p.reason)}</td>
            <td>${esc(p.phone)}</td>
            <td>
              <div class="flex items-center gap-1">
                ${telLink(p.phone) ? `<a href="${escAttr(telLink(p.phone))}" class="btn-icon" title="Call" style="width:30px;height:30px;"><i data-lucide="phone" style="width:13px;height:13px;color:#2255a3;pointer-events:none;"></i></a>` : ''}
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
    } catch (e) { msg.style.color = '#D63333'; msg.textContent = 'Network error.'; }
    finally { btn.disabled = false; btn.style.opacity = ''; }
  }
  function bindCalls() {
    document.getElementById('rk-close').addEventListener('click', closeLogCall);
    document.getElementById('rk-cancel').addEventListener('click', closeLogCall);
    document.getElementById('rk-backdrop').addEventListener('click', closeLogCall);
    document.getElementById('rk-save').addEventListener('click', saveLogCall);
    document.getElementById('rp-view').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rk-log]');
      if (b) openLogCall({ leadId: parseInt(b.getAttribute('data-rk-log'), 10) || null, name: b.getAttribute('data-rk-name'), phone: b.getAttribute('data-rk-phone') || '' });
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
    bindNav(); bindTheme(); bindUserMenu(); bindLeads(); bindContacts(); bindCalls();
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
