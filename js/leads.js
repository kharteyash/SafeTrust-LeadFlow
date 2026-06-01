// Leads page renderer + interactive tab filtering.
(function () {
  const D = window.LF_DATA;

  const TABS = [
    { id: 'all',     label: 'All Leads',          match: () => true },
    { id: 'buying',  label: 'Buying Immediately', match: l => l.timeline === 'Buying Immediately' },
    { id: '1-3',     label: '1-3 Months',         match: l => l.timeline === '1-3 Months' },
    { id: '3-6',     label: '3-6 Months',         match: l => l.timeline === '3-6 Months' },
    { id: '6plus',   label: '6+ Months',          match: l => l.timeline === '6+ Months' }
  ];

  const state = {
    tab: 'all',
    search: '',
    page: 1,
    pageSize: 10
  };

  // Working list = the user's saved leads (DB) + demo leads. Loaded on mount.
  // Each gets a client-side _uid so any row can be referenced for deletion.
  let leadUid = 0;
  function withUid(l) { return Object.assign({ _uid: ++leadUid }, l); }
  let leads = [];

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ----- Header stats -----
  function renderLeadStats() {
    const all = leads;
    const cards = [
      { label: 'Total Leads',        value: all.length, icon: 'users',        tint: '#EFEAFF', color: '#6D5BFF' },
      { label: 'Buying Immediately', value: all.filter(l => l.timeline === 'Buying Immediately').length, icon: 'flame',         tint: '#E6F8EC', color: '#138A4B' },
      { label: '1-3 Months',         value: all.filter(l => l.timeline === '1-3 Months').length,         icon: 'clock',         tint: '#FFF4D6', color: '#B07A00' },
      { label: '3-6 Months',         value: all.filter(l => l.timeline === '3-6 Months').length,         icon: 'calendar-clock', tint: '#FEECEC', color: '#D63333' },
      { label: '6+ Months',          value: all.filter(l => l.timeline === '6+ Months').length,          icon: 'calendar-days',  tint: '#E7EEFF', color: '#2B57D9' }
    ];
    document.getElementById('lead-stats').innerHTML = cards.map(c => `
      <div class="stat-card">
        <div class="flex items-center gap-3 mb-3">
          <div class="stat-icon" style="background:${c.tint};">
            <i data-lucide="${c.icon}" style="width:18px;height:18px;color:${c.color};"></i>
          </div>
          <span class="text-[13px] text-muted font-medium">${c.label}</span>
        </div>
        <div class="text-[26px] font-bold tracking-tight leading-tight">${LF.fmtNum(c.value)}</div>
      </div>
    `).join('');
  }

  // ----- Tabs -----
  function renderTabs() {
    const counts = {
      all:    leads.length,
      buying: leads.filter(l => l.timeline === 'Buying Immediately').length,
      '1-3':  leads.filter(l => l.timeline === '1-3 Months').length,
      '3-6':  leads.filter(l => l.timeline === '3-6 Months').length,
      '6plus':leads.filter(l => l.timeline === '6+ Months').length
    };
    document.getElementById('lead-tabs').innerHTML = TABS.map(t => `
      <div class="tab ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}">
        ${t.label}
        <span class="ml-1.5 text-[11px] font-semibold rounded-full px-1.5 py-[1px]"
              style="background:${state.tab === t.id ? 'rgba(109,91,255,0.12)' : 'var(--chip)'};
                     color:${state.tab === t.id ? '#6D5BFF' : 'var(--text-muted)'};">
          ${counts[t.id]}
        </span>
      </div>
    `).join('');

    document.querySelectorAll('#lead-tabs .tab').forEach(el => {
      el.addEventListener('click', () => {
        state.tab = el.dataset.tab;
        state.page = 1;
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
        l.owner.toLowerCase().includes(q)
      );
    });
  }

  // ----- Table -----
  function renderTable() {
    const rows = filtered();
    const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const pageRows = rows.slice(start, start + state.pageSize);

    const tableEl = document.getElementById('leads-table');
    if (pageRows.length === 0) {
      tableEl.innerHTML = `
        <thead>
          <tr>
            <th>Name</th><th>Email</th><th>Phone</th><th>Buying Timeline</th>
            <th>Lead Score</th><th>Last Contacted</th><th>Owner</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr><td colspan="8" class="text-center py-10 text-muted">No leads found for this filter.</td></tr>
        </tbody>
      `;
    } else {
      tableEl.innerHTML = `
        <thead>
          <tr>
            <th>Name</th><th>Email</th><th>Phone</th><th>Buying Timeline</th>
            <th>Lead Score</th><th>Last Contacted</th><th>Owner</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${pageRows.map(l => `
            <tr>
              <td><span class="font-semibold" data-view-uid="${l._uid}" style="cursor:pointer;color:var(--accent);">${l.name}</span>${l.preapproved ? ' <span class="pill pill-green" style="font-size:10px;">Pre-approved</span>' : ''}</td>
              <td class="text-muted">${l.email}</td>
              <td>${l.phone}</td>
              <td><span class="pill ${LF.timelinePill(l.timeline)}">${l.timeline}</span></td>
              <td><span class="pill ${LF.scorePill(l.score)}">${l.score}</span></td>
              <td class="text-muted">${l.last}</td>
              <td>
                <div class="flex items-center gap-2">
                  <div class="avatar avatar-sm">${l.owner.split(' ').map(s => s[0]).join('')}</div>
                  <span class="text-[13px]">${l.owner}</span>
                </div>
              </td>
              <td>
                <div class="flex items-center gap-1">
                  <button class="btn-icon" title="Call" data-call="${l.phone}" style="width:30px;height:30px;" ${l.phone ? '' : 'disabled'}>
                    <i data-lucide="phone" style="width:13px;height:13px;color:#6D5BFF;pointer-events:none;"></i>
                  </button>
                  <button class="btn-icon" title="Send email" data-email="${l.email}" style="width:30px;height:30px;">
                    <i data-lucide="mail" style="width:13px;height:13px;color:#6D5BFF;pointer-events:none;"></i>
                  </button>
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
    if (window.lucide) lucide.createIcons();
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
          ? 'background:#6D5BFF;color:#FFF;'
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

  // ----- Search (driven by the topbar input rendered by layout.js) -----
  function bindSearch() {
    const input = document.getElementById('topbar-search');
    if (!input) return;
    input.addEventListener('input', e => {
      state.search = e.target.value;
      state.page = 1;
      renderTable();
    });
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
  function bindEmail() {
    // Delegated — the table body re-renders, but #leads-table persists.
    document.getElementById('leads-table').addEventListener('click', e => {
      const callBtn = e.target.closest('[data-call]');
      if (callBtn) {
        const tel = LF.telLink(callBtn.getAttribute('data-call'));
        if (tel) window.location.href = tel;
        return;
      }
      const btn = e.target.closest('[data-email]');
      if (!btn) return;
      window.open(gmailComposeViaChooser(btn.getAttribute('data-email')), '_blank');
    });
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
    rows.push(detailRow('Lead score', `<span class="pill ${LF.scorePill(lead.score)}">${lead.score}</span>`));
    rows.push(detailRow('Preapproved', lead.preapproved ? 'Yes' : 'No'));
    rows.push(detailRow('Lead type', esc(type)));
    if (type === 'Refinance') {
      rows.push(detailRow('Refinance type', esc(lead.refiType) || '—'));
    } else {
      rows.push(detailRow('Realtor', realtorLabel(lead.realtorStatus)));
      if (lead.realtorStatus === 'has') {
        rows.push(detailRow('Realtor name', esc(lead.realtorName) || '—'));
        rows.push(detailRow('Realtor email', esc(lead.realtorEmail) || '—'));
        rows.push(detailRow('Realtor phone', esc(lead.realtorPhone) || '—'));
      }
    }
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
      ${notesBlock}`;

    detailViewUid = lead._uid;
    document.getElementById('lead-detail-modal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }
  function closeLeadDetail() { document.getElementById('lead-detail-modal').classList.add('hidden'); }

  function bindAddLead() {
    document.getElementById('add-lead-btn').addEventListener('click', () => openLeadModal(null));
    document.getElementById('lead-type-select').addEventListener('change', syncLeadForm);
    document.getElementById('realtor-status-select').addEventListener('change', syncLeadForm);
    document.getElementById('lead-modal-close').addEventListener('click', closeLeadModal);
    document.getElementById('lead-cancel').addEventListener('click', closeLeadModal);
    document.getElementById('lead-modal-backdrop').addEventListener('click', closeLeadModal);

    // Lead detail modal controls.
    document.getElementById('lead-detail-close').addEventListener('click', closeLeadDetail);
    document.getElementById('lead-detail-done').addEventListener('click', closeLeadDetail);
    document.getElementById('lead-detail-backdrop').addEventListener('click', closeLeadDetail);
    document.getElementById('lead-detail-edit').addEventListener('click', () => {
      const lead = leads.find(l => String(l._uid) === String(detailViewUid));
      closeLeadDetail();
      if (lead) openLeadModal(lead);
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
            timeline: body.timeline, owner: body.owner, notes: body.notes, score: body.score,
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
      const viewEl = e.target.closest('[data-view-uid]');
      if (viewEl) {
        const lead = leads.find(l => String(l._uid) === viewEl.getAttribute('data-view-uid'));
        if (lead) openLeadDetail(lead);
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
          <input type="checkbox" value="${t}" checked style="width:15px;height:15px;accent-color:#6D5BFF;cursor:pointer;" />
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
      [l.name, l.email, l.phone, l.timeline, l.score, l.last, l.owner].map(csvEscape).join(',')
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

  function bindExport() {
    document.getElementById('export-btn').addEventListener('click', openExportModal);
    document.getElementById('export-modal-close').addEventListener('click', closeExportModal);
    document.getElementById('export-cancel').addEventListener('click', closeExportModal);
    document.getElementById('export-modal-backdrop').addEventListener('click', closeExportModal);
    document.getElementById('export-go').addEventListener('click', exportCsv);
  }

  // ----- Mount -----
  document.addEventListener('DOMContentLoaded', async function () {
    // Layout must render first — it rebuilds #app's innerHTML, which wipes
    // any event listeners attached to elements inside it.
    await LF.renderLayout({ active: 'leads' });
    await loadLeads();
    renderLeadStats();
    renderTabs();
    renderTable();
    bindSearch();
    bindRowsPerPage();
    bindEmail();
    bindAddLead();
    bindDeleteLead();
    bindExport();
    if (window.lucide) lucide.createIcons();
  });
})();
