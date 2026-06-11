// Leads page renderer + interactive tab filtering.
(function () {
  const D = window.LF_DATA;

  const TABS = [
    { id: 'all',     label: 'All Leads',          match: () => true },
    { id: 'hot',     label: 'Hot Leads',          match: l => l.stars === 5 },
    { id: 'mine',    label: 'My Leads',           match: l => l.mine, adminOnly: true },
    { id: 'buying',  label: 'Buying Immediately', match: l => l.timeline === 'Buying Immediately' },
    { id: '1-3',     label: '1-3 Months',         match: l => l.timeline === '1-3 Months' },
    { id: '3-6',     label: '3-6 Months',         match: l => l.timeline === '3-6 Months' },
    { id: '6plus',   label: '6+ Months',          match: l => l.timeline === '6+ Months' },
    { id: 'closed',  label: 'Previously Closed',  closed: true }
  ];

  const state = {
    tab: 'all',
    search: '',
    page: 1,
    pageSize: 10
  };

  // The admin (superuser) sees every user's leads, each tagged with an owner pill.
  // Set after LF.renderLayout populates the user (LF_DATA.user is empty at load).
  let isAdmin = false;

  const selectedLeads = new Set(); // _uids checked for bulk delete

  // Working list = the user's saved leads (DB) + demo leads. Loaded on mount.
  // Each gets a client-side _uid so any row can be referenced for deletion.
  let leadUid = 0;
  function withUid(l) { return Object.assign({ _uid: ++leadUid }, l); }
  let leads = [];

  // Previously Closed leads (a separate dataset, merged in as its own tab).
  let closedLeads = [];            // [{ id, data: { col: value } }]
  const selectedClosed = new Set(); // record ids checked for bulk delete

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // Assignment / forwarding state (works for team leaders and members).
  let canAssign = false;
  let assignTargets = []; // [{ id, name, isLeader }]
  let assigningLeadId = null;
  async function loadAssignTargets() {
    try { const r = await fetch('/api/assign-targets', { credentials: 'same-origin' }); if (r.ok) assignTargets = await r.json(); }
    catch (e) { assignTargets = []; }
    canAssign = assignTargets.length > 0;
  }

  // ----- Header stats -----
  function renderLeadStats() {
    const all = leads;
    const cards = [
      { label: 'Total Leads',        value: all.length, icon: 'users',        tint: '#EFEAFF', color: '#2255a3', tab: 'all' },
      { label: 'Hot Leads',          value: all.filter(l => l.stars === 5).length, icon: 'flame',  tint: '#FEECEC', color: '#D63333', tab: 'hot' },
      { label: 'Buying Immediately', value: all.filter(l => l.timeline === 'Buying Immediately').length, icon: 'thumbs-up',     tint: '#E6F8EC', color: '#138A4B', tab: 'buying' },
      { label: '1-3 Months',         value: all.filter(l => l.timeline === '1-3 Months').length,         icon: 'clock',         tint: '#FFF4D6', color: '#B07A00', tab: '1-3' },
      { label: '3-6 Months',         value: all.filter(l => l.timeline === '3-6 Months').length,         icon: 'calendar-clock', tint: '#FEECEC', color: '#D63333', tab: '3-6' },
      { label: '6+ Months',          value: all.filter(l => l.timeline === '6+ Months').length,          icon: 'calendar-days',  tint: '#E7EEFF', color: '#2B57D9', tab: '6plus' },
      { label: 'Previously Closed',  value: closedLeads.length, icon: 'archive', tint: 'var(--surface-3)', color: '#5C5C75', tab: 'closed' }
    ];
    document.getElementById('lead-stats').innerHTML = cards.map(c => `
      <div class="stat-card ${c.tab ? 'cursor-pointer' : ''}" ${c.tab ? `data-go-tab="${c.tab}"` : ''}>
        <div class="flex items-center gap-3 mb-3" style="pointer-events:none;">
          <div class="stat-icon" style="background:${c.tint};">
            <i data-lucide="${c.icon}" style="width:18px;height:18px;color:${c.color};"></i>
          </div>
          <span class="text-[13px] text-muted font-medium">${c.label}</span>
        </div>
        <div class="text-[26px] font-bold tracking-tight leading-tight" style="pointer-events:none;">${LF.fmtNum(c.value)}</div>
      </div>
    `).join('');
    // The "Previously Closed" card jumps to that tab.
    document.querySelectorAll('#lead-stats [data-go-tab]').forEach(el => el.addEventListener('click', () => {
      state.tab = el.getAttribute('data-go-tab'); state.page = 1;
      selectedLeads.clear(); selectedClosed.clear();
      renderTabs(); renderTable();
    }));
  }

  // ----- Tabs -----
  function visibleTabs() { return TABS.filter(t => !t.adminOnly || isAdmin); }
  function renderTabs() {
    const tabsList = visibleTabs();
    if (!tabsList.some(t => t.id === state.tab)) state.tab = 'all';
    document.getElementById('lead-tabs').innerHTML = tabsList.map(t => `
      <div class="tab ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}">
        ${t.label}
        <span class="ml-1.5 text-[11px] font-semibold rounded-full px-1.5 py-[1px]"
              style="background:${state.tab === t.id ? 'rgba(34,85,163,0.12)' : 'var(--chip)'};
                     color:${state.tab === t.id ? '#2255a3' : 'var(--text-muted)'};">
          ${t.closed ? closedLeads.length : leads.filter(t.match).length}
        </span>
      </div>
    `).join('');

    document.querySelectorAll('#lead-tabs .tab').forEach(el => {
      el.addEventListener('click', () => {
        state.tab = el.dataset.tab;
        state.page = 1;
        selectedLeads.clear();   // selection is per-view
        selectedClosed.clear();
        renderTabs();
        renderTable();
      });
    });
  }

  // ----- Filtered / paged rows -----
  function filtered() {
    const tab = TABS.find(t => t.id === state.tab);
    const q = state.search.trim().toLowerCase();
    return leads.filter(l => {
      if (!tab.match(l)) return false;
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        l.phone.toLowerCase().includes(q) ||
        l.owner.toLowerCase().includes(q) ||
        (l.ownerUserName || '').toLowerCase().includes(q)
      );
    });
  }

  // ----- Table -----
  function renderTable() {
    // The closed-only "Import CSV" button shows on the Previously Closed tab.
    const impBtn = document.getElementById('closed-import-btn');
    if (impBtn) impBtn.classList.toggle('hidden', state.tab !== 'closed');
    const cmsg = document.getElementById('closed-msg');
    if (cmsg && state.tab !== 'closed') cmsg.textContent = '';
    if (state.tab === 'closed') return renderClosedTable();

    const rows = filtered();
    const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const pageRows = rows.slice(start, start + state.pageSize);

    const tableEl = document.getElementById('leads-table');
    const allChecked = rows.length > 0 && rows.every(l => selectedLeads.has(String(l._uid)));
    const headRow = `
        <thead>
          <tr>
            <th style="width:34px;"><input type="checkbox" id="leads-select-all" title="Select all" style="accent-color:#2255a3;cursor:pointer;" ${allChecked ? 'checked' : ''} /></th>
            <th>Name</th><th>Email</th><th>Phone</th><th>Buying Timeline</th>
            <th>Lead Score</th><th>Last Contacted</th><th>Owner</th><th>Action</th>
          </tr>
        </thead>`;
    if (pageRows.length === 0) {
      tableEl.innerHTML = `
        ${headRow}
        <tbody>
          <tr><td colspan="9" class="text-center py-10 text-muted">No leads found for this filter.</td></tr>
        </tbody>
      `;
    } else {
      tableEl.innerHTML = `
        ${headRow}
        <tbody>
          ${pageRows.map(l => `
            <tr>
              <td><input type="checkbox" data-select-uid="${l._uid}" style="accent-color:#2255a3;cursor:pointer;" ${selectedLeads.has(String(l._uid)) ? 'checked' : ''} /></td>
              <td><span class="font-semibold" data-view-uid="${l._uid}" style="cursor:pointer;color:var(--accent);">${l.name}</span>${l.preapproved ? ' <span class="pill pill-green" style="font-size:10px;">Pre-approved</span>' : ''}${l.assignedByName ? ` <span class="pill pill-blue" style="font-size:10px;">From ${esc(l.assignedByName)}</span>` : ''}${isAdmin && l.ownerUserName ? ` <span class="pill pill-purple" style="font-size:10px;">${esc(l.ownerUserName)}</span>` : ''}</td>
              <td class="text-muted">${l.email}</td>
              <td>${l.phone}</td>
              <td><span class="pill ${LF.timelinePill(l.timeline)}">${l.timeline}</span></td>
              <td>${LF.scoreStarsHTML(l)}</td>
              <td class="text-muted">${l.last}</td>
              <td>
                <div class="flex items-center gap-2">
                  <div class="avatar avatar-sm">${l.owner.split(' ').map(s => s[0]).join('')}</div>
                  <span class="text-[13px]">${l.owner}</span>
                </div>
              </td>
              <td>
                <div class="flex items-center gap-1">
                  ${(l.phone || l.email) ? `<button class="btn-secondary" title="Contact" data-contact-uid="${l._uid}" style="padding:5px 11px;font-size:12px;display:inline-flex;align-items:center;gap:5px;">
                    <i data-lucide="message-circle" style="width:13px;height:13px;pointer-events:none;"></i> Contact
                    <i data-lucide="chevron-down" style="width:12px;height:12px;pointer-events:none;opacity:.7;"></i>
                  </button>` : ''}
                  ${(canAssign && (!isAdmin || l.mine)) ? `<button class="btn-icon" title="Assign / forward" data-assign-uid="${l._uid}" style="width:30px;height:30px;">
                    <i data-lucide="forward" style="width:13px;height:13px;color:#2B57D9;pointer-events:none;"></i>
                  </button>` : ''}
                  <button class="btn-icon" title="Edit lead" data-edit-uid="${l._uid}" style="width:30px;height:30px;">
                    <i data-lucide="pencil" style="width:13px;height:13px;color:var(--text-muted);pointer-events:none;"></i>
                  </button>
                  <button class="btn-icon" title="Delete lead" data-del-uid="${l._uid}" style="width:30px;height:30px;border:none;">
                    <i data-lucide="trash-2" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i>
                  </button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      `;
    }

    // Summary line
    const summary = rows.length === 0
      ? 'No leads to show'
      : `Showing ${start + 1} to ${Math.min(start + state.pageSize, rows.length)} of ${LF.fmtNum(rows.length)} leads`;
    document.getElementById('lead-summary').textContent = summary;

    renderPager(totalPages);
    renderBulkBar();
    if (window.lucide) lucide.createIcons();
  }

  // ----- Bulk selection / delete -----
  function renderBulkBar() {
    const bar = document.getElementById('leads-bulkbar');
    if (!bar) return;
    if (state.tab === 'closed') return renderClosedBulkBar(bar);
    const n = selectedLeads.size;
    bar.innerHTML = n === 0 ? '' : `
      <div class="flex items-center gap-2">
        <span class="text-[12.5px] text-muted">${n} selected</span>
        <button id="leads-bulk-clear" class="btn-secondary" style="padding:5px 12px;font-size:12.5px;">Clear</button>
        <button id="leads-bulk-delete" class="btn-primary" style="padding:5px 12px;font-size:12.5px;background:#D63333;">
          <i data-lucide="trash-2" style="width:13px;height:13px;"></i> Delete ${n}
        </button>
      </div>`;
    const clearBtn = document.getElementById('leads-bulk-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => { selectedLeads.clear(); renderTable(); });
    const delBtn = document.getElementById('leads-bulk-delete');
    if (delBtn) delBtn.addEventListener('click', bulkDeleteLeads);
  }
  async function bulkDeleteLeads() {
    const uids = [...selectedLeads];
    const ids = uids.map(u => leads.find(l => String(l._uid) === u)).filter(l => l && l.id).map(l => l.id);
    if (!ids.length) { selectedLeads.clear(); renderTable(); return; }
    if (!window.confirm(`Delete ${ids.length} selected lead${ids.length === 1 ? '' : 's'}? This can't be undone.`)) return;
    try {
      const res = await fetch('/api/leads/bulk-delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ ids })
      });
      if (!res.ok) { window.alert('Could not delete the selected leads.'); return; }
    } catch (e) { window.alert('Network error.'); return; }
    selectedLeads.clear();
    await loadLeads();          // reflect exactly what the server deleted
    renderLeadStats(); renderTabs(); renderTable();
    if (window.lucide) lucide.createIcons();
  }
  function bindBulkSelect() {
    document.getElementById('leads-table').addEventListener('change', e => {
      const all = e.target.id === 'leads-select-all' ? e.target : null;
      if (all) {
        if (state.tab === 'closed') {
          closedFiltered().forEach(r => { const id = String(r.id); if (all.checked) selectedClosed.add(id); else selectedClosed.delete(id); });
        } else {
          // Select / clear every lead in the current filter (all pages).
          filtered().forEach(l => { const u = String(l._uid); if (all.checked) selectedLeads.add(u); else selectedLeads.delete(u); });
        }
        renderTable();
        return;
      }
      const cbClosed = e.target.closest('[data-select-id]');
      if (cbClosed) {
        const id = cbClosed.getAttribute('data-select-id');
        if (cbClosed.checked) selectedClosed.add(id); else selectedClosed.delete(id);
        renderTable();
        return;
      }
      const cb = e.target.closest('[data-select-uid]');
      if (cb) {
        const u = cb.getAttribute('data-select-uid');
        if (cb.checked) selectedLeads.add(u); else selectedLeads.delete(u);
        renderTable();
      }
    });
  }

  // ----- Pager -----
  function renderPager(totalPages) {
    const pages = [];
    for (let p = 1; p <= totalPages; p++) pages.push(p);

    const pager = document.getElementById('pager');
    pager.innerHTML = `
      <button class="btn-icon" data-page="prev" style="width:30px;height:30px;" ${state.page === 1 ? 'disabled' : ''}>
        <i data-lucide="chevron-left" style="width:14px;height:14px;color:var(--text-muted);"></i>
      </button>
      ${pages.map(p => {
        const active = p === state.page;
        const style = active
          ? 'background:#2255a3;color:#FFF;'
          : 'background:var(--surface);color:var(--text);border:1px solid var(--border-strong);';
        return `<button data-page="${p}" class="rounded-md text-[12.5px] font-semibold" style="width:30px;height:30px;${style}">${p}</button>`;
      }).join('')}
      <button class="btn-icon" data-page="next" style="width:30px;height:30px;" ${state.page === totalPages ? 'disabled' : ''}>
        <i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text-muted);"></i>
      </button>
    `;

    pager.querySelectorAll('button[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.page;
        if (v === 'prev' && state.page > 1) state.page--;
        else if (v === 'next' && state.page < totalPages) state.page++;
        else if (!isNaN(parseInt(v, 10))) state.page = parseInt(v, 10);
        renderTable();
      });
    });
  }

  // ----- Search (the in-panel box above the table, plus the topbar input) -----
  function bindSearch() {
    const local = document.getElementById('leads-search');
    const topbar = document.getElementById('topbar-search');
    const onSearch = (val) => {
      state.search = val;
      state.page = 1;
      selectedLeads.clear();
      selectedClosed.clear();
      // Keep the two inputs in sync so either one reflects the active query.
      if (local && local.value !== val) local.value = val;
      if (topbar && topbar.value !== val) topbar.value = val;
      renderTable();
    };
    if (local)  local.addEventListener('input', e => onSearch(e.target.value));
    if (topbar) topbar.addEventListener('input', e => onSearch(e.target.value));
  }

  // ----- Rows per page -----
  function bindRowsPerPage() {
    const sel = document.getElementById('rows-per-page');
    sel.value = String(state.pageSize);
    sel.addEventListener('change', e => {
      state.pageSize = parseInt(e.target.value, 10);
      state.page = 1;
      renderTable();
    });
  }

  // ----- Email: open Google's account chooser, then Gmail compose under the
  // account you pick (lets you send from a non-default account; nothing saved). -----
  function gmailComposeViaChooser(to) {
    const compose = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to);
    return 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(compose);
  }
  // ----- "Contact" popup menu (Call / Text / WhatsApp / Email) -----
  let menuLead = null;
  function leadMenuItem(icon, label, color) {
    return `<button class="flex items-center gap-2.5 w-full text-left rounded-md px-3 py-2 hover:bg-[#FAFAFC]" data-action="${label}" style="font-size:13px;">
      <i data-lucide="${icon}" style="width:15px;height:15px;color:${color};pointer-events:none;"></i><span>${label}</span></button>`;
  }
  function openLeadContactMenu(lead, anchor) {
    menuLead = lead;
    const menu = document.getElementById('lead-contact-menu');
    const items = [];
    if (lead.phone) {
      items.push(leadMenuItem('phone', 'Call & log', '#2255a3'));
      items.push(leadMenuItem('message-square', 'Text (SMS)', '#2255a3'));
      items.push(leadMenuItem('message-circle', 'WhatsApp', '#138A4B'));
    }
    if (lead.email) {
      items.push(leadMenuItem('mail', 'Email', '#2255a3'));
      items.push(leadMenuItem('video', 'Google Meet', '#138A4B'));
    }
    menu.innerHTML = items.join('');
    menu.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    const mw = 190;
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - mw - 8)) + 'px';
    menu.style.top = (r.bottom + 4) + 'px';
    if (window.lucide) lucide.createIcons();
  }
  function closeLeadContactMenu() {
    const menu = document.getElementById('lead-contact-menu');
    if (menu) menu.classList.add('hidden');
    menuLead = null;
  }
  // ----- Google Meet (pick a time, create a link, email it) -----
  let meetTarget = null; // { to, name }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function createMeet(lead) {
    if (!lead || !lead.email) { window.alert('This lead has no email to send a Meet link to.'); return; }
    meetTarget = { to: lead.email, name: lead.name || '' };
    const now = new Date();
    const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const next = new Date(now.getTime() + 60 * 60000);
    document.getElementById('meet-to').textContent = lead.email;
    const dEl = document.getElementById('meet-date'); dEl.value = today; dEl.min = today;
    document.getElementById('meet-time').value = `${pad2(next.getHours())}:00`;
    document.getElementById('meet-msg').textContent = '';
    document.getElementById('meet-modal').classList.remove('hidden');
  }
  function closeMeetModal() { document.getElementById('meet-modal').classList.add('hidden'); }
  function bindMeet() {
    document.getElementById('meet-close').addEventListener('click', closeMeetModal);
    document.getElementById('meet-cancel').addEventListener('click', closeMeetModal);
    document.getElementById('meet-backdrop').addEventListener('click', closeMeetModal);
    document.getElementById('meet-go').addEventListener('click', async () => {
      if (!meetTarget) return;
      const date = document.getElementById('meet-date').value;
      const time = document.getElementById('meet-time').value;
      const msg = document.getElementById('meet-msg');
      if (!date || !time) { msg.style.color = '#D63333'; msg.textContent = 'Pick a date and time.'; return; }
      const dt = new Date(`${date}T${time}`);
      if (isNaN(dt.getTime()) || dt.getTime() <= Date.now()) { msg.style.color = '#D63333'; msg.textContent = 'Pick a future date and time.'; return; }
      const btn = document.getElementById('meet-go');
      btn.disabled = true; btn.style.opacity = '0.7';
      msg.style.color = 'var(--text-muted)'; msg.textContent = 'Creating the meeting…';
      try {
        const res = await fetch('/api/meet', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ to: meetTarget.to, name: meetTarget.name, date, start: time })
        });
        const raw = await res.text(); let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (e) {}
        if (!res.ok) { msg.style.color = '#D63333'; msg.textContent = body.error || `Could not create the meeting (HTTP ${res.status}).`; return; }
        closeMeetModal();
        window.alert(`Google Meet link emailed to ${body.sentTo}${body.when ? ' for ' + body.when : ''}.\n\n${body.meetLink}`);
        if (body.meetLink) window.open(body.meetLink, '_blank');
      } catch (e) { msg.style.color = '#D63333'; msg.textContent = 'Network error.'; }
      finally { btn.disabled = false; btn.style.opacity = ''; }
    });
  }
  function bindEmail() {
    // Open the contact menu from a lead's Contact button.
    document.getElementById('leads-table').addEventListener('click', e => {
      const btn = e.target.closest('[data-contact-uid]');
      if (!btn) return;
      const lead = leads.find(l => String(l._uid) === btn.getAttribute('data-contact-uid'));
      if (lead) openLeadContactMenu(lead, btn);
    });
    // Run the chosen contact action.
    document.getElementById('lead-contact-menu').addEventListener('click', e => {
      const item = e.target.closest('[data-action]');
      if (!item || !menuLead) return;
      const l = menuLead, action = item.getAttribute('data-action');
      if (action === 'Call & log') {
        LF.callTimer.start(); // time the call from the moment it starts
        const tel = LF.telLink(l.phone); if (tel) window.location.href = tel;
        openCallLogModal(l.name, l.phone, false); // dial + log into Call History
      } else if (action === 'Text (SMS)') {
        const sms = LF.smsLink(l.phone); if (sms) window.location.href = sms;
      } else if (action === 'WhatsApp') {
        const wa = LF.waLink(l.phone); if (wa) window.open(wa, '_blank');
      } else if (action === 'Email') {
        window.open(gmailComposeViaChooser(l.email), '_blank');
      } else if (action === 'Google Meet') {
        createMeet(l);
      }
      closeLeadContactMenu();
    });
    // Close on outside click / scroll.
    document.addEventListener('click', e => {
      if (document.getElementById('lead-contact-menu').classList.contains('hidden')) return;
      if (e.target.closest('#lead-contact-menu') || e.target.closest('[data-contact-uid]')) return;
      closeLeadContactMenu();
    });
    window.addEventListener('scroll', closeLeadContactMenu, true);
  }

  // ----- Load saved leads from the DB and merge with demo leads -----
  async function loadLeads() {
    try {
      const res = await fetch('/api/leads', { credentials: 'same-origin' });
      if (res.ok) {
        const saved = await res.json();
        leads = saved.map(withUid);
      }
    } catch (e) { /* keep demo leads only */ }
  }

  // ----- Add / Edit Lead modal -----
  let editingLeadUid = null;
  // Show/hide the conditional sections based on lead type + realtor status.
  function syncLeadForm() {
    const form = document.getElementById('lead-form');
    const type = form.elements['lead_type'].value;
    document.getElementById('refi-section').style.display = type === 'Refinance' ? '' : 'none';
    document.getElementById('purchase-section').style.display = type === 'Purchase' ? '' : 'none';
    const rs = form.elements['realtor_status'].value;
    document.getElementById('realtor-fields').style.display = (type === 'Purchase' && rs === 'has') ? '' : 'none';
  }
  function openLeadModal(lead) {
    editingLeadUid = lead ? lead._uid : null;
    const form = document.getElementById('lead-form');
    form.reset();
    if (lead) {
      document.getElementById('lead-modal-title').textContent = 'Edit lead';
      document.getElementById('lead-submit').textContent = 'Save changes';
      form.elements['name'].value = lead.name || '';
      form.elements['email'].value = lead.email || '';
      form.elements['phone'].value = lead.phone || '';
      form.elements['owner'].value = lead.owner || '';
      form.elements['timeline'].value = lead.timeline || 'Buying Immediately';
      form.elements['state'].value = lead.state || '';
      form.elements['notes'].value = lead.notes || '';
      form.elements['lead_type'].value = lead.leadType || 'Purchase';
      form.elements['refi_type'].value = lead.refiType || 'Rate & Term';
      form.elements['realtor_status'].value = lead.realtorStatus || 'none';
      form.elements['realtor_name'].value = lead.realtorName || '';
      form.elements['realtor_email'].value = lead.realtorEmail || '';
      form.elements['realtor_phone'].value = lead.realtorPhone || '';
      form.elements['preapproved'].value = lead.preapproved ? 'yes' : 'no';
    } else {
      document.getElementById('lead-modal-title').textContent = 'Add lead';
      document.getElementById('lead-submit').textContent = 'Add lead';
      form.elements['owner'].value = (LF_DATA.user && LF_DATA.user.name) || '';
      form.elements['timeline'].value = 'Buying Immediately';
      form.elements['lead_type'].value = 'Purchase';
      form.elements['realtor_status'].value = 'none';
      form.elements['preapproved'].value = 'no';
    }
    syncLeadForm();
    document.getElementById('lead-form-msg').textContent = '';
    document.getElementById('lead-modal').classList.remove('hidden');
    form.elements['name'].focus();
  }
  function closeLeadModal() { document.getElementById('lead-modal').classList.add('hidden'); editingLeadUid = null; }

  // ----- Lead details (read-only view, opened by clicking the name) -----
  let detailViewUid = null;
  function realtorLabel(s) { return s === 'has' ? 'Has a realtor' : s === 'unavailable' ? 'Not available' : 'None'; }
  function leadInitials(name) { return (name || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?'; }
  function detailRow(label, value) {
    return `<div class="flex justify-between gap-4 py-2" style="border-bottom:1px solid var(--border-soft);">
      <span class="text-[12.5px] text-muted flex-shrink-0">${label}</span>
      <span class="text-[13px] font-medium text-right" style="word-break:break-word;">${value}</span>
    </div>`;
  }
  function openLeadDetail(lead) {
    const type = lead.leadType || 'Purchase';
    const rows = [];
    rows.push(detailRow('Email', esc(lead.email) || '—'));
    rows.push(detailRow('Phone', esc(lead.phone) || '—'));
    rows.push(detailRow('Buying timeline', `<span class="pill ${LF.timelinePill(lead.timeline)}">${esc(lead.timeline)}</span>`));
    const scoreCell = isAdmin
      ? `<span class="inline-flex items-center gap-2 justify-end">
           ${LF.scoreStarsHTML(lead, 13)}
           <input type="number" min="1" max="5" value="${lead.stars || LF.scoreStars(lead.score)}" data-score-input title="Set a 1–5 rating"
             style="width:48px;padding:3px 6px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px;text-align:center;" />
           <button type="button" data-score-save title="Save rating"
             style="background:var(--accent);color:#fff;border:none;border-radius:6px;padding:4px 11px;font-size:12px;font-weight:600;cursor:pointer;">Save</button>
           <span data-score-msg style="font-size:11px;color:var(--text-muted);"></span>
         </span>`
      : LF.scoreStarsHTML(lead, 14);
    rows.push(detailRow('Lead score', scoreCell));
    rows.push(detailRow('Preapproved', lead.preapproved ? 'Yes' : 'No'));
    rows.push(detailRow('Lead type', esc(type)));
    if (type === 'Refinance') {
      rows.push(detailRow('Refinance type', esc(lead.refiType) || '—'));
    } else {
      rows.push(detailRow('Realtor', realtorLabel(lead.realtorStatus)));
      if (lead.realtorStatus === 'has') {
        rows.push(detailRow('Realtor name', esc(lead.realtorName) || '—'));
        rows.push(detailRow('Realtor email', esc(lead.realtorEmail) || '—'));
        const rTel = lead.realtorPhone ? LF.telLink(lead.realtorPhone) : '';
        const rPhoneVal = (lead.realtorPhone && rTel)
          ? `<button type="button" data-call-realtor="${escAttr(lead.realtorPhone)}" data-realtor-name="${escAttr(lead.realtorName || 'Realtor')}" title="Call realtor & log it"
               style="color:var(--accent);font-weight:600;display:inline-flex;align-items:center;gap:4px;cursor:pointer;background:none;border:none;padding:0;">
               <i data-lucide="phone" style="width:13px;height:13px;pointer-events:none;"></i>${esc(lead.realtorPhone)}</button>`
          : (esc(lead.realtorPhone) || '—');
        rows.push(detailRow('Realtor phone', rPhoneVal));
      }
    }
    rows.push(detailRow('State', esc(lead.state) || '—'));
    rows.push(detailRow('Owner', esc(lead.owner) || '—'));

    const notesBlock = lead.notes
      ? `<div class="mt-3"><div class="text-[12.5px] text-muted mb-1">Notes</div><div class="text-[13px]" style="white-space:pre-wrap;">${esc(lead.notes)}</div></div>`
      : '';

    document.getElementById('lead-detail-body').innerHTML = `
      <div class="flex items-center gap-3 mb-3">
        <div class="avatar avatar-lg">${esc(leadInitials(lead.name))}</div>
        <div>
          <div class="text-[16px] font-bold">${esc(lead.name)}</div>
          ${lead.preapproved ? '<span class="pill pill-green" style="font-size:10.5px;">Pre-approved</span>' : ''}
        </div>
      </div>
      ${rows.join('')}
      ${notesBlock}
      <div id="lead-forward-history"></div>`;

    detailViewUid = lead._uid;
    document.getElementById('lead-detail-modal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
    loadForwardHistory(lead);
  }
  // Show the forwarding chain (user1 → user2, user2 → user3) for forwarded leads.
  async function loadForwardHistory(lead) {
    if (!lead || !lead.id) return;
    let chain = [];
    try {
      const r = await fetch('/api/leads/' + lead.id + '/forwards', { credentials: 'same-origin' });
      if (r.ok) chain = await r.json();
    } catch (e) { return; }
    const host = document.getElementById('lead-forward-history');
    if (!host || !chain.length) return;
    host.innerHTML = `
      <div class="mt-3">
        <div class="text-[12.5px] text-muted mb-1">Forwarding history</div>
        <div class="text-[13px]" style="display:flex;flex-direction:column;gap:3px;">
          ${chain.map(c => `<div class="flex items-center gap-2">
            <span class="font-medium">${esc(c.from)}</span>
            <i data-lucide="arrow-right" style="width:13px;height:13px;color:var(--text-muted);"></i>
            <span class="font-medium">${esc(c.to)}</span>
          </div>`).join('')}
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  }
  function closeLeadDetail() { document.getElementById('lead-detail-modal').classList.add('hidden'); }

  // ----- Log a call (dial + log into Call History). Works for a lead or a realtor. -----
  let callLogName = '', callLogPhone = '', callIsRealtor = false;
  let stopLeadCallTimer = null;
  // Voicemail / no answer = no conversation, so blank + disable the duration.
  function syncCallDuration(form) {
    const o = form.elements['outcome'].value;
    const dur = form.elements['duration'];
    if (o === 'No Answer' || o === 'Voicemail') { dur.value = ''; dur.disabled = true; }
    else { dur.disabled = false; if (!dur.value) dur.value = '0:00'; }
  }
  function openCallLogModal(name, phone, isRealtor) {
    callIsRealtor = !!isRealtor;
    callLogName = name || (isRealtor ? 'Realtor' : 'Lead');
    callLogPhone = phone || '';
    document.getElementById('realtor-call-title').textContent = isRealtor ? 'Log realtor call' : 'Log call';
    document.getElementById('realtor-call-name').textContent = callLogName;
    document.getElementById('realtor-call-suffix').textContent = isRealtor ? ' (realtor)' : '';
    const form = document.getElementById('realtor-call-form');
    form.reset();
    form.elements['outcome'].value = 'Connected';
    syncCallDuration(form);
    // Auto-time the call's duration when opened right after dialing.
    if (stopLeadCallTimer) { stopLeadCallTimer(); stopLeadCallTimer = null; }
    stopLeadCallTimer = LF.startCallDurationTimer(form);
    document.getElementById('realtor-call-msg').textContent = '';
    document.getElementById('realtor-call-modal').classList.remove('hidden');
  }
  // Back-compat alias for the realtor-phone entry point.
  function openRealtorCallModal(name, phone) { openCallLogModal(name, phone, true); }
  function closeRealtorCallModal() {
    document.getElementById('realtor-call-modal').classList.add('hidden');
    if (stopLeadCallTimer) { stopLeadCallTimer(); stopLeadCallTimer = null; }
    LF.callTimer.clear();
  }
  function bindRealtorCall() {
    document.getElementById('realtor-call-close').addEventListener('click', closeRealtorCallModal);
    document.getElementById('realtor-call-cancel').addEventListener('click', closeRealtorCallModal);
    document.getElementById('realtor-call-backdrop').addEventListener('click', closeRealtorCallModal);
    document.getElementById('realtor-call-form').elements['outcome'].addEventListener('change', e => syncCallDuration(e.target.form));

    // Clicking a realtor phone in the details modal: dial + open the log modal.
    document.getElementById('lead-detail-body').addEventListener('click', e => {
      const btn = e.target.closest('[data-call-realtor]');
      if (!btn) return;
      const phone = btn.getAttribute('data-call-realtor');
      const name = btn.getAttribute('data-realtor-name') || 'Realtor';
      const tel = LF.telLink(phone);
      LF.callTimer.start(); // time the realtor call from the moment it starts
      if (tel) window.location.href = tel;
      closeLeadDetail();
      openRealtorCallModal(name, phone);
    });

    // Admin-only: save a manually overridden lead score from the details modal.
    document.getElementById('lead-detail-body').addEventListener('click', async e => {
      const saveBtn = e.target.closest('[data-score-save]');
      if (!saveBtn) return;
      const lead = leads.find(l => String(l._uid) === String(detailViewUid));
      const input = document.querySelector('#lead-detail-body [data-score-input]');
      const msgEl = document.querySelector('#lead-detail-body [data-score-msg]');
      if (!lead || !lead.id || !input) { if (msgEl) msgEl.textContent = 'Cannot edit'; return; }
      const val = parseInt(input.value, 10);
      if (isNaN(val) || val < 1 || val > 5) { if (msgEl) msgEl.textContent = 'Enter 1–5'; return; }
      saveBtn.disabled = true; if (msgEl) msgEl.textContent = 'Saving…';
      try {
        const res = await fetch('/api/leads/' + lead.id + '/score', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ stars: val })
        });
        const raw = await res.text(); let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (err) {}
        if (!res.ok) { if (msgEl) msgEl.textContent = body.error || `Failed (HTTP ${res.status}).`; saveBtn.disabled = false; return; }
        lead.score = body.score; lead.stars = body.stars;
        if (msgEl) msgEl.textContent = 'Saved';
        renderTable(); if (window.lucide) lucide.createIcons();
      } catch (err) { if (msgEl) msgEl.textContent = 'Network error'; saveBtn.disabled = false; }
    });

    const form = document.getElementById('realtor-call-form');
    const msg = document.getElementById('realtor-call-msg');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      msg.textContent = '';
      const data = Object.fromEntries(new FormData(form));
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.style.opacity = '0.7';
      try {
        const res = await fetch('/api/call-log', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({
            name: callLogName, phone: callLogPhone,
            outcome: data.outcome, duration: data.duration || '0:00', notes: data.notes || '', isRealtor: callIsRealtor
          })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { msg.textContent = body.error || `Request failed (HTTP ${res.status}).`; return; }
        closeRealtorCallModal();
      } catch (err) { msg.textContent = 'Network error. Is the server running?'; }
      finally { btn.disabled = false; btn.style.opacity = ''; }
    });
  }

  // ----- Close a lead (move it to Previously Closed) -----
  let closingLeadId = null;
  function openCloseLeadModal(lead) {
    closingLeadId = lead.id;
    document.getElementById('closelead-name').textContent = lead.name;
    const form = document.getElementById('closelead-form');
    form.reset();
    document.getElementById('closelead-msg').textContent = '';
    document.getElementById('closelead-modal').classList.remove('hidden');
    form.elements['birthday'].focus();
  }
  function closeCloseLeadModal() { document.getElementById('closelead-modal').classList.add('hidden'); closingLeadId = null; }
  function bindCloseLead() {
    document.getElementById('closelead-close').addEventListener('click', closeCloseLeadModal);
    document.getElementById('closelead-cancel').addEventListener('click', closeCloseLeadModal);
    document.getElementById('closelead-backdrop').addEventListener('click', closeCloseLeadModal);

    const form = document.getElementById('closelead-form');
    const msg = document.getElementById('closelead-msg');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      msg.textContent = '';
      if (closingLeadId == null) { closeCloseLeadModal(); return; }
      const data = Object.fromEntries(new FormData(form));
      if (!data.birthday) { msg.textContent = "The lead's birthday is required."; return; }
      if (!data.loanAnniversary) { msg.textContent = 'The loan anniversary is required.'; return; }
      const cid = closingLeadId;
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.style.opacity = '0.7';
      try {
        const res = await fetch('/api/leads/' + cid + '/close', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({
            birthday: data.birthday, loanAnniversary: data.loanAnniversary,
            petName: data.petName || '', childrenName: data.childrenName || '',
            hobbies: data.hobbies || '', miscNotes: data.miscNotes || ''
          })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { msg.textContent = body.error || `Request failed (HTTP ${res.status}).`; return; }
        leads = leads.filter(l => String(l.id) !== String(cid));
        closeCloseLeadModal();
        await loadClosed();        // reflect the newly closed lead in its tab/count
        renderLeadStats();
        renderTabs();
        renderTable();
        if (window.lucide) lucide.createIcons();
        window.alert('Lead closed and moved to Previously Closed.');
      } catch (err) { msg.textContent = 'Network error. Is the server running?'; }
      finally { btn.disabled = false; btn.style.opacity = ''; }
    });
  }

  function bindAddLead() {
    document.getElementById('add-lead-btn').addEventListener('click', () => openLeadModal(null));
    document.getElementById('lead-type-select').addEventListener('change', syncLeadForm);
    document.getElementById('realtor-status-select').addEventListener('change', syncLeadForm);
    document.getElementById('lead-modal-close').addEventListener('click', closeLeadModal);
    document.getElementById('lead-cancel').addEventListener('click', closeLeadModal);
    document.getElementById('lead-modal-backdrop').addEventListener('click', closeLeadModal);

    // Lead detail modal controls.
    document.getElementById('lead-detail-close').addEventListener('click', closeLeadDetail);
    document.getElementById('lead-detail-backdrop').addEventListener('click', closeLeadDetail);
    document.getElementById('lead-detail-edit').addEventListener('click', () => {
      const lead = leads.find(l => String(l._uid) === String(detailViewUid));
      closeLeadDetail();
      if (lead) openLeadModal(lead);
    });
    document.getElementById('lead-detail-closelead').addEventListener('click', () => {
      const lead = leads.find(l => String(l._uid) === String(detailViewUid));
      closeLeadDetail();
      if (lead) openCloseLeadModal(lead);
    });

    const form = document.getElementById('lead-form');
    const msg = document.getElementById('lead-form-msg');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = '';
      const data = Object.fromEntries(new FormData(form));
      if (!data.name.trim())  { msg.textContent = 'Name is required.'; return; }
      if (!data.email.trim()) { msg.textContent = 'Email is required.'; return; }

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.style.opacity = '0.7';
      const payload = {
        name: data.name, email: data.email, phone: data.phone || '',
        timeline: data.timeline, owner: data.owner || '', notes: data.notes || '',
        state: data.state || '',
        preapproved: data.preapproved === 'yes',
        leadType: data.lead_type,
        refiType: data.refi_type,
        realtorStatus: data.realtor_status,
        realtorName: data.realtor_name || '',
        realtorEmail: data.realtor_email || '',
        realtorPhone: data.realtor_phone || ''
      };
      try {
        if (editingLeadUid != null) {
          const lead = leads.find(l => String(l._uid) === String(editingLeadUid));
          if (!lead || !lead.id) { msg.textContent = 'This lead can’t be edited.'; return; }
          const res = await fetch('/api/leads/' + lead.id, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify(payload)
          });
          const raw = await res.text(); let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (err) {}
          if (!res.ok) { msg.textContent = body.error || `Request failed (HTTP ${res.status}).`; return; }
          Object.assign(lead, {
            name: body.name, email: body.email, phone: body.phone,
            timeline: body.timeline, owner: body.owner, notes: body.notes, score: body.score, state: body.state,
            preapproved: body.preapproved, leadType: body.leadType, refiType: body.refiType,
            realtorStatus: body.realtorStatus, realtorName: body.realtorName,
            realtorEmail: body.realtorEmail, realtorPhone: body.realtorPhone
          });
          closeLeadModal();
          renderLeadStats();
          renderTabs();
          renderTable();
          if (window.lucide) lucide.createIcons();
        } else {
          const res = await fetch('/api/leads', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify(payload)
          });
          const raw = await res.text(); let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (err) {}
          if (!res.ok) { msg.textContent = body.error || `Request failed (HTTP ${res.status}).`; return; }

          body.mine = true; // a lead you just created is yours (and not forwarded)
          leads.unshift(withUid(body));
          closeLeadModal();
          // Reset to All Leads, first page so the new lead is visible up top.
          state.tab = 'all';
          state.page = 1;
          state.search = '';
          const search = document.getElementById('topbar-search');
          if (search) search.value = '';
          renderLeadStats();
          renderTabs();
          renderTable();
          if (window.lucide) lucide.createIcons();
        }
      } catch (err) {
        msg.textContent = 'Network error. Is the server running?';
      } finally {
        btn.disabled = false; btn.style.opacity = '';
      }
    });
  }

  // ----- Delete a lead -----
  async function deleteLead(uid) {
    const idx = leads.findIndex(l => String(l._uid) === String(uid));
    if (idx === -1) return;
    const lead = leads[idx];
    if (!window.confirm(`Delete lead "${lead.name}"?`)) return;

    // Leads created by the user have a DB id — delete them server-side too.
    if (lead.id) {
      try {
        const res = await fetch('/api/leads/' + lead.id, { method: 'DELETE', credentials: 'same-origin' });
        if (!res.ok && res.status !== 404) { window.alert('Could not delete the lead. Please try again.'); return; }
      } catch (e) { window.alert('Network error while deleting the lead.'); return; }
    }

    leads.splice(idx, 1);
    renderLeadStats();
    renderTabs();
    renderTable();
    if (window.lucide) lucide.createIcons();
  }

  function bindDeleteLead() {
    // Delegated — #leads-table persists while its body re-renders.
    document.getElementById('leads-table').addEventListener('click', e => {
      // Closed-tab rows: open details / delete.
      const closedView = e.target.closest('[data-view-id]');
      if (closedView) {
        const rec = closedLeads.find(r => String(r.id) === closedView.getAttribute('data-view-id'));
        if (rec) openClosedDetail(rec);
        return;
      }
      const closedDel = e.target.closest('[data-del]');
      if (closedDel) { deleteClosed(closedDel.getAttribute('data-del')); return; }

      const viewEl = e.target.closest('[data-view-uid]');
      if (viewEl) {
        const lead = leads.find(l => String(l._uid) === viewEl.getAttribute('data-view-uid'));
        if (lead) openLeadDetail(lead);
        return;
      }
      const assignBtn = e.target.closest('[data-assign-uid]');
      if (assignBtn) {
        const lead = leads.find(l => String(l._uid) === assignBtn.getAttribute('data-assign-uid'));
        if (lead) openAssignModal(lead);
        return;
      }
      const editBtn = e.target.closest('[data-edit-uid]');
      if (editBtn) {
        const lead = leads.find(l => String(l._uid) === editBtn.getAttribute('data-edit-uid'));
        if (lead) openLeadModal(lead);
        return;
      }
      const btn = e.target.closest('[data-del-uid]');
      if (btn) deleteLead(btn.getAttribute('data-del-uid'));
    });
  }

  // ----- Export to CSV -----
  const EXPORT_TIMELINES = ['Buying Immediately', '1-3 Months', '3-6 Months', '6+ Months'];

  function openExportModal() {
    document.getElementById('export-msg').textContent = '';
    document.getElementById('export-options').innerHTML = EXPORT_TIMELINES.map(t => {
      const count = leads.filter(l => l.timeline === t).length;
      return `
        <label class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer" style="border:1px solid var(--border);">
          <input type="checkbox" value="${t}" checked style="width:15px;height:15px;accent-color:#2255a3;cursor:pointer;" />
          <span class="flex-1 text-[13.5px]">${t}</span>
          <span class="text-[12px] text-muted">${count}</span>
        </label>`;
    }).join('');
    document.getElementById('export-modal').classList.remove('hidden');
  }
  function closeExportModal() { document.getElementById('export-modal').classList.add('hidden'); }

  function csvEscape(v) {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCsv() {
    const checked = Array.from(document.querySelectorAll('#export-options input:checked')).map(c => c.value);
    const msg = document.getElementById('export-msg');
    if (!checked.length) { msg.textContent = 'Select at least one category.'; return; }

    const rows = leads.filter(l => checked.includes(l.timeline));
    if (!rows.length) { msg.textContent = 'No leads to export for the selected categories.'; return; }

    const headers = ['Name', 'Email', 'Phone', 'Buying Timeline', 'Lead Score', 'Last Contacted', 'Owner'];
    const lines = [headers.join(',')];
    rows.forEach(l => lines.push(
      [l.name, l.email, l.phone, l.timeline, `${l.stars || LF.scoreStars(l.score)}/5`, l.last, l.owner].map(csvEscape).join(',')
    ));
    // BOM so Excel reads UTF-8 correctly.
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    closeExportModal();
  }

  // ----- Assign lead to team (leaders) -----
  function openAssignModal(lead) {
    assigningLeadId = lead.id;
    document.getElementById('assign-lead-name').textContent = lead.name;
    const sel = document.getElementById('assign-target');
    if (assignTargets.length === 0) {
      sel.innerHTML = '<option value="">No one available</option>';
    } else {
      sel.innerHTML = `<option value="all">${isAdmin ? 'Everyone' : 'Everyone on my team'}</option>` +
        assignTargets.map(m => `<option value="${m.id}">${esc(m.name)}${m.isLeader ? ' (team leader)' : ''}</option>`).join('');
    }
    document.getElementById('assign-msg').textContent = '';
    document.getElementById('assign-modal').classList.remove('hidden');
  }
  function closeAssignModal() { document.getElementById('assign-modal').classList.add('hidden'); assigningLeadId = null; }
  function bindAssign() {
    document.getElementById('assign-close').addEventListener('click', closeAssignModal);
    document.getElementById('assign-cancel').addEventListener('click', closeAssignModal);
    document.getElementById('assign-backdrop').addEventListener('click', closeAssignModal);
    document.getElementById('assign-go').addEventListener('click', async () => {
      const sel = document.getElementById('assign-target');
      const msg = document.getElementById('assign-msg');
      if (!sel.value) { msg.textContent = 'No one available to assign to.'; return; }
      const leadId = assigningLeadId;
      const btn = document.getElementById('assign-go');
      btn.disabled = true; btn.style.opacity = '0.7';
      try {
        const res = await fetch('/api/leads/' + leadId + '/assign', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ target: sel.value === 'all' ? 'all' : Number(sel.value) })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { msg.textContent = body.error || `Request failed (HTTP ${res.status}).`; return; }
        closeAssignModal();
        // A forwarded lead leaves "My Leads" right away (pending accept).
        const lead = leads.find(l => String(l.id) === String(leadId));
        if (lead) { lead.mine = false; renderTabs(); renderTable(); if (window.lucide) lucide.createIcons(); }
        window.alert('Lead forwarded. The recipient(s) will be notified to accept or decline.');
      } catch (e) { msg.textContent = 'Network error.'; }
      finally { btn.disabled = false; btn.style.opacity = ''; }
    });
  }

  // ----- Import leads from CSV -----
  // Map a raw CSV row (header->value) to lead fields by detecting column names.
  function mapImportRow(obj) {
    const pick = (re) => {
      for (const k of Object.keys(obj)) { if (re.test(k)) { const v = String(obj[k] || '').trim(); if (v) return v; } }
      return '';
    };
    return {
      name: pick(/^name$|full name|primary borrower|^borrower$|^contact$|^customer$|^client$/i),
      email: pick(/e-?mail/i),
      phone: pick(/phone|mobile|\bcell\b/i),
      timeline: pick(/timeline|buying/i),
      owner: pick(/^owner$|^agent$|loan officer name|officer name/i),
      state: pick(/^state$|subject state/i)
    };
  }
  function importMsg(text, ok) {
    const el = document.getElementById('import-msg');
    el.style.color = ok ? '#138A4B' : '#D63333';
    el.textContent = text || '';
  }
  async function handleImportFile(file) {
    if (!file) return;
    importMsg('Reading file…', true);
    let text;
    try { text = await file.text(); } catch (e) { importMsg('Could not read the file.', false); return; }
    const { objects } = LF.csvToObjects(text);
    if (!objects.length) { importMsg('That CSV has no data rows.', false); return; }
    const mapped = objects.map(mapImportRow).filter(r => r.name);
    if (!mapped.length) { importMsg('Could not find a Name column to import from.', false); return; }
    importMsg(`Importing ${mapped.length} lead${mapped.length === 1 ? '' : 's'}…`, true);
    try {
      const res = await fetch('/api/leads/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ rows: mapped })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { importMsg(body.error || `Import failed (HTTP ${res.status}).`, false); return; }
      await loadLeads();
      state.tab = 'all'; state.page = 1; state.search = '';
      const search = document.getElementById('topbar-search'); if (search) search.value = '';
      renderLeadStats(); renderTabs(); renderTable();
      if (window.lucide) lucide.createIcons();
      const dupes = body.skipped || 0;
      importMsg(`Imported ${body.imported} lead${body.imported === 1 ? '' : 's'}` + (dupes ? ` · ${dupes} skipped (duplicate email or no name)` : ''), true);
    } catch (e) { importMsg('Network error. Is the server running?', false); }
  }
  function bindImport() {
    const fileInput = document.getElementById('leads-file');
    document.getElementById('import-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      handleImportFile(file);
      fileInput.value = ''; // allow re-importing the same file
    });
  }

  function bindExport() {
    document.getElementById('export-btn').addEventListener('click', openExportModal);
    document.getElementById('export-modal-close').addEventListener('click', closeExportModal);
    document.getElementById('export-cancel').addEventListener('click', closeExportModal);
    document.getElementById('export-modal-backdrop').addEventListener('click', closeExportModal);
    document.getElementById('export-go').addEventListener('click', exportCsv);
  }

  // ----- Mount -----
  // ====================================================================
  //  Previously Closed (merged into the Leads page as a tab)
  // ====================================================================
  async function loadClosed() {
    try {
      const res = await fetch('/api/closed', { credentials: 'same-origin' });
      closedLeads = res.ok ? await res.json() : [];
    } catch (e) { closedLeads = []; }
  }
  function closedFiltered() {
    const term = state.search.trim().toLowerCase();
    if (!term) return closedLeads;
    return closedLeads.filter(r => Object.values(r.data || {}).some(v => String(v == null ? '' : v).toLowerCase().includes(term)));
  }
  function closedIsEmail(h) { return /e-?mail/i.test(h); }
  function closedIsPhone(h) { return /phone|mobile|\bcell\b|\btel\b/i.test(h); }
  function closedDetectCol(cols, patterns) { for (const p of patterns) { const c = cols.find(col => p.test(col)); if (c) return c; } return null; }
  function closedAllColumns() {
    const cols = [], seen = new Set();
    closedLeads.forEach(r => Object.keys(r.data || {}).forEach(k => { if (!seen.has(k)) { seen.add(k); cols.push(k); } }));
    return cols;
  }
  function closedNameCol(allCols) {
    return closedDetectCol(allCols, [/^primary borrower$/i, /borrower name/i, /full name/i, /^name$/i, /^customer$/i, /^client$/i]) || allCols[0];
  }
  function closedPickColumns(allCols) {
    const used = new Set(), out = [];
    const add = (c) => { if (c && !used.has(c)) { used.add(c); out.push(c); } };
    add(closedDetectCol(allCols, [/^primary borrower$/i, /borrower name/i, /full name/i, /^name$/i, /^customer$/i, /^client$/i]) || allCols[0]);
    [
      [/e-?mail/i], [/phone|mobile|\bcell\b/i],
      [/loan purpose|^purpose$/i], [/total loan amount|loan amount|^amount$/i],
      [/stage name|^stage$|^status$/i], [/subject state|^state$/i],
      [/loan officer name|officer name|^owner$/i], [/loan funded|closing date|funding date/i]
    ].forEach(pats => add(closedDetectCol(allCols, pats)));
    for (const c of allCols) { if (out.length >= 7) break; add(c); }
    return out.slice(0, 7);
  }
  function closedGmailChooser(to) {
    const compose = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to);
    return 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(compose);
  }
  function closedActionFor(header, value, name) {
    if (!value) return '';
    if (closedIsEmail(header)) {
      return `<button class="btn-icon" title="Send email" data-cemail="${escAttr(value)}" style="width:28px;height:28px;">
        <i data-lucide="mail" style="width:13px;height:13px;color:#2255a3;pointer-events:none;"></i></button>`;
    }
    if (closedIsPhone(header)) {
      return `<button class="btn-icon" title="Call & log" data-ccall="${escAttr(value)}" data-ccall-name="${escAttr(name || '')}" style="width:28px;height:28px;">
        <i data-lucide="phone" style="width:13px;height:13px;color:#2255a3;pointer-events:none;"></i></button>`;
    }
    return '';
  }
  function renderClosedTable() {
    const table = document.getElementById('leads-table');
    const rows = closedFiltered();
    if (closedLeads.length === 0) {
      document.getElementById('lead-summary').textContent = '';
      document.getElementById('pager').innerHTML = '';
      table.innerHTML = `
        <tbody><tr><td>
          <div class="text-center py-16">
            <div class="mx-auto mb-3 stat-icon" style="background:var(--surface-3);width:48px;height:48px;border-radius:12px;">
              <i data-lucide="archive" style="width:22px;height:22px;color:#8A8AA0;"></i>
            </div>
            <div class="text-[14px] font-semibold mb-1">No closed leads yet</div>
            <div class="text-[13px] text-muted mb-4">Import a CSV to bring in your previously closed leads.</div>
            <button class="btn-primary" onclick="document.getElementById('closed-import-btn').click()">
              <i data-lucide="upload" style="width:14px;height:14px;"></i> Import CSV
            </button>
          </div>
        </td></tr></tbody>`;
      renderBulkBar();
      if (window.lucide) lucide.createIcons();
      return;
    }
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const pageRows = rows.slice(start, start + state.pageSize);
    const allCols = closedAllColumns();
    const cols = closedPickColumns(allCols);
    const nameCol = closedNameCol(allCols);
    const allChecked = total > 0 && rows.every(r => selectedClosed.has(String(r.id)));
    table.innerHTML = `
      <thead>
        <tr><th style="width:34px;"><input type="checkbox" id="leads-select-all" title="Select all" style="accent-color:#2255a3;cursor:pointer;" ${allChecked ? 'checked' : ''} /></th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}<th>Action</th></tr>
      </thead>
      <tbody>
        ${total === 0
          ? `<tr><td colspan="${cols.length + 2}" class="text-center py-10 text-muted">No closed leads match "${esc(state.search)}".</td></tr>`
          : pageRows.map(r => `
          <tr>
            <td><input type="checkbox" data-select-id="${r.id}" style="accent-color:#2255a3;cursor:pointer;" ${selectedClosed.has(String(r.id)) ? 'checked' : ''} /></td>
            ${cols.map(c => {
              const val = r.data ? r.data[c] : '';
              if (c === nameCol) return `<td><span class="font-semibold" data-view-id="${r.id}" style="cursor:pointer;color:var(--accent);">${esc(val) || '(no name)'}</span></td>`;
              return `<td class="text-muted">${esc(val) || '<span class="text-soft">—</span>'}</td>`;
            }).join('')}
            <td><button class="btn-icon" title="Remove" data-del="${r.id}" style="width:30px;height:30px;border:none;">
              <i data-lucide="trash-2" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i></button></td>
          </tr>`).join('')}
      </tbody>`;
    document.getElementById('lead-summary').textContent = total === 0
      ? 'No closed leads to show'
      : `Showing ${start + 1} to ${Math.min(start + state.pageSize, total)} of ${LF.fmtNum(total)} closed leads`;
    renderPager(totalPages);
    renderBulkBar();
    if (window.lucide) lucide.createIcons();
  }
  function renderClosedBulkBar(bar) {
    const n = selectedClosed.size;
    bar.innerHTML = n === 0 ? '' : `
      <div class="flex items-center gap-2">
        <span class="text-[12.5px] text-muted">${n} selected</span>
        <button id="closed-bulk-clear" class="btn-secondary" style="padding:5px 12px;font-size:12.5px;">Clear</button>
        <button id="closed-bulk-delete" class="btn-primary" style="padding:5px 12px;font-size:12.5px;background:#D63333;">
          <i data-lucide="trash-2" style="width:13px;height:13px;"></i> Delete ${n}
        </button>
      </div>`;
    const clearBtn = document.getElementById('closed-bulk-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => { selectedClosed.clear(); renderTable(); });
    const delBtn = document.getElementById('closed-bulk-delete');
    if (delBtn) delBtn.addEventListener('click', bulkDeleteClosed);
  }
  async function bulkDeleteClosed() {
    const ids = [...selectedClosed].map(Number).filter(n => !isNaN(n));
    if (!ids.length) { selectedClosed.clear(); renderTable(); return; }
    if (!window.confirm(`Remove ${ids.length} selected record${ids.length === 1 ? '' : 's'}? This can't be undone.`)) return;
    try {
      const res = await fetch('/api/closed/bulk-delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ ids })
      });
      if (!res.ok) { window.alert('Could not remove the selected records.'); return; }
    } catch (e) { window.alert('Network error.'); return; }
    selectedClosed.clear();
    await loadClosed();
    renderLeadStats(); renderTabs(); renderTable();
    if (window.lucide) lucide.createIcons();
  }
  async function deleteClosed(id) {
    if (!window.confirm('Remove this closed lead?')) return;
    try {
      const res = await fetch('/api/closed/' + id, { method: 'DELETE', credentials: 'same-origin' });
      if (!res.ok && res.status !== 404) { window.alert('Could not remove it.'); return; }
    } catch (err) { window.alert('Network error.'); return; }
    closedLeads = closedLeads.filter(r => String(r.id) !== String(id));
    selectedClosed.delete(String(id));
    renderLeadStats(); renderTabs(); renderTable();
    if (window.lucide) lucide.createIcons();
  }
  function openClosedDetail(rec) {
    const data = rec.data || {};
    const keys = Object.keys(data);
    const borrowerName = data[closedNameCol(keys)] || 'Closed lead';
    document.getElementById('closed-detail-title').textContent = borrowerName;
    document.getElementById('closed-detail-body').innerHTML = keys.map(k => {
      const v = data[k];
      const action = closedActionFor(k, v, borrowerName);
      return `
        <div class="flex items-start justify-between gap-3 py-2" style="border-bottom:1px solid var(--border-soft);">
          <span class="text-[12px] text-muted flex-shrink-0" style="max-width:42%;">${esc(k)}</span>
          <span class="text-[13px] font-medium text-right" style="word-break:break-word;display:flex;align-items:center;gap:6px;justify-content:flex-end;">
            ${esc(v) || '<span class="text-soft">—</span>'}${action}
          </span>
        </div>`;
    }).join('');
    document.getElementById('closed-detail-modal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }
  function closeClosedDetail() { document.getElementById('closed-detail-modal').classList.add('hidden'); }
  function closedSetMsg(text, ok) {
    const el = document.getElementById('closed-msg');
    if (!el) return;
    el.style.color = ok ? '#138A4B' : '#D63333';
    el.textContent = text || '';
  }
  // CSV parsing (handles quoted fields, commas, and newlines in quotes).
  function closedParseCSV(text) {
    text = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rows = []; let cur = [], field = '', inQuotes = false, i = 0;
    while (i < text.length) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQuotes = false; i++; continue; }
        field += c; i++; continue;
      }
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ',') { cur.push(field); field = ''; i++; continue; }
      if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; i++; continue; }
      field += c; i++;
    }
    if (field !== '' || cur.length > 0) { cur.push(field); rows.push(cur); }
    return rows;
  }
  function closedCsvToObjects(text) {
    const rows = closedParseCSV(text).filter(r => r.some(c => String(c).trim() !== ''));
    if (rows.length === 0) return { objects: [] };
    const seen = {};
    const headers = rows[0].map(h => {
      let name = String(h).trim() || 'Column';
      if (seen[name] == null) { seen[name] = 0; return name; }
      seen[name]++; return `${name} (${seen[name]})`;
    });
    const objects = rows.slice(1).map(r => {
      const o = {}; headers.forEach((h, idx) => { o[h] = r[idx] != null ? String(r[idx]).trim() : ''; }); return o;
    });
    return { objects };
  }
  async function handleClosedFile(file) {
    if (!file) return;
    closedSetMsg('Reading file…', true);
    let text;
    try { text = await file.text(); } catch (e) { closedSetMsg('Could not read the file.', false); return; }
    const { objects } = closedCsvToObjects(text);
    if (objects.length === 0) { closedSetMsg('That CSV has no data rows.', false); return; }
    closedSetMsg(`Importing ${objects.length} row${objects.length === 1 ? '' : 's'}…`, true);
    try {
      const res = await fetch('/api/closed/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ rows: objects })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { closedSetMsg(body.error || `Import failed (HTTP ${res.status}).`, false); return; }
      await loadClosed();
      renderLeadStats(); renderTabs(); renderTable();
      const parts = [`${body.imported || 0} new`];
      if (body.updated) parts.push(`${body.updated} updated`);
      const unchanged = body.unchanged != null ? body.unchanged : (body.skipped || 0);
      if (unchanged) parts.push(`${unchanged} unchanged`);
      closedSetMsg('Import complete · ' + parts.join(' · '), true);
    } catch (e) { closedSetMsg('Network error. Is the server running?', false); }
  }
  function bindClosedImport() {
    const fileInput = document.getElementById('closed-file');
    const btn = document.getElementById('closed-import-btn');
    if (btn) btn.addEventListener('click', () => fileInput.click());
    if (fileInput) fileInput.addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      handleClosedFile(file);
      fileInput.value = '';
    });
  }
  // Log a call to a closed lead (dial + log into Call History), with the timer.
  let closedCallName = '', closedCallPhone = '', stopClosedCallTimer = null;
  function syncClosedCallDuration(form) {
    const o = form.elements['outcome'].value;
    const dur = form.elements['duration'];
    if (o === 'No Answer' || o === 'Voicemail') { dur.value = ''; dur.disabled = true; }
    else { dur.disabled = false; if (!dur.value) dur.value = '0:00'; }
  }
  function openClosedCallModal(name, phone) {
    closedCallName = name || 'Closed lead';
    closedCallPhone = phone || '';
    document.getElementById('closed-call-name').textContent = closedCallName;
    const form = document.getElementById('closed-call-form');
    form.reset();
    form.elements['outcome'].value = 'Connected';
    syncClosedCallDuration(form);
    if (stopClosedCallTimer) { stopClosedCallTimer(); stopClosedCallTimer = null; }
    stopClosedCallTimer = LF.startCallDurationTimer(form);
    document.getElementById('closed-call-msg').textContent = '';
    document.getElementById('closed-call-modal').classList.remove('hidden');
  }
  function closeClosedCallModal() {
    document.getElementById('closed-call-modal').classList.add('hidden');
    if (stopClosedCallTimer) { stopClosedCallTimer(); stopClosedCallTimer = null; }
    LF.callTimer.clear();
  }
  function bindClosed() {
    // Detail modal open/close.
    document.getElementById('closed-detail-close').addEventListener('click', closeClosedDetail);
    document.getElementById('closed-detail-backdrop').addEventListener('click', closeClosedDetail);
    // Call / email actions from inside the detail modal.
    document.getElementById('closed-detail-body').addEventListener('click', e => {
      const callBtn = e.target.closest('[data-ccall]');
      if (callBtn) {
        const phone = callBtn.getAttribute('data-ccall');
        const name = callBtn.getAttribute('data-ccall-name') || 'Closed lead';
        LF.callTimer.start();
        const tel = LF.telLink(phone); if (tel) window.location.href = tel;
        openClosedCallModal(name, phone);
        return;
      }
      const emailBtn = e.target.closest('[data-cemail]');
      if (emailBtn) { window.open(closedGmailChooser(emailBtn.getAttribute('data-cemail')), '_blank'); return; }
    });
    // Call modal.
    document.getElementById('closed-call-close').addEventListener('click', closeClosedCallModal);
    document.getElementById('closed-call-cancel').addEventListener('click', closeClosedCallModal);
    document.getElementById('closed-call-backdrop').addEventListener('click', closeClosedCallModal);
    document.getElementById('closed-call-form').elements['outcome'].addEventListener('change', e => syncClosedCallDuration(e.target.form));
    document.getElementById('closed-call-form').addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target, msg = document.getElementById('closed-call-msg');
      msg.textContent = '';
      const data = Object.fromEntries(new FormData(form));
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.style.opacity = '0.7';
      try {
        const res = await fetch('/api/call-log', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ name: closedCallName, phone: closedCallPhone, outcome: data.outcome, duration: data.duration || '0:00', notes: data.notes || '' })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { msg.textContent = body.error || `Request failed (HTTP ${res.status}).`; return; }
        closeClosedCallModal();
      } catch (err) { msg.textContent = 'Network error. Is the server running?'; }
      finally { btn.disabled = false; btn.style.opacity = ''; }
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    // Layout must render first — it rebuilds #app's innerHTML, which wipes
    // any event listeners attached to elements inside it.
    await LF.renderLayout({ active: 'leads' });
    isAdmin = !!(LF_DATA.user && LF_DATA.user.rawRole === 'admin');
    await loadLeads();
    await loadClosed();
    await loadAssignTargets();
    renderLeadStats();
    renderTabs();
    renderTable();
    bindSearch();
    bindRowsPerPage();
    bindEmail();
    bindAddLead();
    bindDeleteLead();
    bindBulkSelect();
    bindMeet();
    bindAssign();
    bindCloseLead();
    bindRealtorCall();
    bindImport();
    bindExport();
    bindClosedImport();
    bindClosed();
    if (window.lucide) lucide.createIcons();
  });
})();
