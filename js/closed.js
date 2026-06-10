// Previously Closed leads: imported from CSV, displayed in a dynamic table.
(function () {
  let closed = []; // [{ id, data: {col: value} }]
  let query = '';
  const state = { page: 1, pageSize: 10 };
  const selectedClosed = new Set(); // record ids checked for bulk delete

  // Filter by the search term (matches any field value, so names are covered).
  function filtered() {
    const term = query.trim().toLowerCase();
    if (!term) return closed;
    return closed.filter(r => Object.values(r.data || {}).some(v => String(v == null ? '' : v).toLowerCase().includes(term)));
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ----- Column type detection -----
  function isEmailField(h) { return /e-?mail/i.test(h); }
  function isPhoneField(h) { return /phone|mobile|\bcell\b|\btel\b/i.test(h); }
  function detectColumn(cols, patterns) {
    for (const p of patterns) { const c = cols.find(col => p.test(col)); if (c) return c; }
    return null;
  }
  // Curated, leads-like subset of columns for the table (the modal shows all).
  function pickColumns(allCols) {
    const used = new Set(), out = [];
    const add = (c) => { if (c && !used.has(c)) { used.add(c); out.push(c); } };
    add(detectColumn(allCols, [/^primary borrower$/i, /borrower name/i, /full name/i, /^name$/i, /^customer$/i, /^client$/i]) || allCols[0]);
    [
      [/e-?mail/i], [/phone|mobile|\bcell\b/i],
      [/loan purpose|^purpose$/i], [/total loan amount|loan amount|^amount$/i],
      [/stage name|^stage$|^status$/i], [/subject state|^state$/i],
      [/loan officer name|officer name|^owner$/i], [/loan funded|closing date|funding date/i]
    ].forEach(pats => add(detectColumn(allCols, pats)));
    for (const c of allCols) { if (out.length >= 7) break; add(c); }
    return out.slice(0, 7);
  }
  // The name column / value (for the modal title + clickable cell).
  function nameColumn(allCols) {
    return detectColumn(allCols, [/^primary borrower$/i, /borrower name/i, /full name/i, /^name$/i, /^customer$/i, /^client$/i]) || allCols[0];
  }

  // ----- Action buttons (call / email) used in the detail modal -----
  function gmailChooser(to) {
    const compose = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to);
    return 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(compose);
  }
  function actionFor(header, value, name) {
    if (!value) return '';
    if (isEmailField(header)) {
      return `<button class="btn-icon" title="Send email" data-email="${escAttr(value)}" style="width:28px;height:28px;">
        <i data-lucide="mail" style="width:13px;height:13px;color:#2255a3;pointer-events:none;"></i></button>`;
    }
    if (isPhoneField(header)) {
      return `<button class="btn-icon" title="Call & log" data-call="${escAttr(value)}" data-call-name="${escAttr(name || '')}" style="width:28px;height:28px;">
        <i data-lucide="phone" style="width:13px;height:13px;color:#2255a3;pointer-events:none;"></i></button>`;
    }
    return '';
  }

  // ----- CSV parsing (handles quoted fields, commas, and newlines in quotes) -----
  function parseCSV(text) {
    text = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rows = [];
    let cur = [], field = '', inQuotes = false, i = 0;
    while (i < text.length) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
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

  function csvToObjects(text) {
    const rows = parseCSV(text).filter(r => r.some(c => String(c).trim() !== ''));
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
  }

  // ----- Load -----
  async function load() {
    try {
      const res = await fetch('/api/closed', { credentials: 'same-origin' });
      closed = res.ok ? await res.json() : [];
    } catch (e) { closed = []; }
  }

  // Columns = union of all keys across rows, in first-seen order.
  function computeColumns() {
    const cols = [], seen = new Set();
    closed.forEach(r => Object.keys(r.data || {}).forEach(k => { if (!seen.has(k)) { seen.add(k); cols.push(k); } }));
    return cols;
  }

  // ----- Render -----
  function render() {
    const table = document.getElementById('closed-table');
    const footer = document.getElementById('closed-footer');
    const rows = filtered();
    document.getElementById('closed-count').textContent = closed.length
      ? (query.trim() ? `${rows.length} of ${closed.length}` : `(${closed.length})`)
      : '';

    if (closed.length === 0) {
      footer.classList.add('hidden');
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
      if (window.lucide) lucide.createIcons();
      return;
    }

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const pageRows = rows.slice(start, start + state.pageSize);

    const allCols = computeColumns();
    const cols = pickColumns(allCols);
    const nameCol = nameColumn(allCols);
    const allChecked = rows.length > 0 && rows.every(r => selectedClosed.has(String(r.id)));
    table.innerHTML = `
      <thead>
        <tr><th style="width:34px;"><input type="checkbox" id="closed-select-all" title="Select all" style="accent-color:#2255a3;cursor:pointer;" ${allChecked ? 'checked' : ''} /></th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}<th>Action</th></tr>
      </thead>
      <tbody>
        ${total === 0
          ? `<tr><td colspan="${cols.length + 2}" class="text-center py-10 text-muted">No closed leads match "${esc(query)}".</td></tr>`
          : pageRows.map(r => `
          <tr>
            <td><input type="checkbox" data-select-id="${r.id}" style="accent-color:#2255a3;cursor:pointer;" ${selectedClosed.has(String(r.id)) ? 'checked' : ''} /></td>
            ${cols.map(c => {
              const val = r.data ? r.data[c] : '';
              if (c === nameCol) {
                return `<td><span class="font-semibold" data-view-id="${r.id}" style="cursor:pointer;color:var(--accent);">${esc(val) || '(no name)'}</span></td>`;
              }
              return `<td class="text-muted">${esc(val) || '<span class="text-soft">—</span>'}</td>`;
            }).join('')}
            <td>
              <button class="btn-icon" title="Remove" data-del="${r.id}" style="width:30px;height:30px;border:none;">
                <i data-lucide="trash-2" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i>
              </button>
            </td>
          </tr>`).join('')}
      </tbody>`;
    renderBulkBar();

    // Footer: summary + pager (hidden when there's nothing to page through).
    if (total === 0) {
      footer.classList.add('hidden');
    } else {
      footer.classList.remove('hidden');
      document.getElementById('closed-summary').textContent =
        `Showing ${start + 1} to ${Math.min(start + state.pageSize, total)} of ${total}`;
      renderPager(totalPages);
    }
    if (window.lucide) lucide.createIcons();
  }

  function renderPager(totalPages) {
    const pager = document.getElementById('closed-pager');
    const pages = [];
    for (let p = 1; p <= totalPages; p++) pages.push(p);
    pager.innerHTML = `
      <button class="btn-icon" data-page="prev" style="width:30px;height:30px;" ${state.page === 1 ? 'disabled' : ''}>
        <i data-lucide="chevron-left" style="width:14px;height:14px;color:var(--text-muted);"></i>
      </button>
      ${pages.map(p => `<button data-page="${p}" class="rounded-md text-[12.5px] font-semibold" style="width:30px;height:30px;${p === state.page ? 'background:#2255a3;color:#FFF;' : 'background:var(--surface);color:var(--text);border:1px solid var(--border-strong);'}">${p}</button>`).join('')}
      <button class="btn-icon" data-page="next" style="width:30px;height:30px;" ${state.page === totalPages ? 'disabled' : ''}>
        <i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text-muted);"></i>
      </button>`;
    pager.querySelectorAll('button[data-page]').forEach(btn => btn.addEventListener('click', () => {
      const v = btn.dataset.page;
      if (v === 'prev' && state.page > 1) state.page--;
      else if (v === 'next' && state.page < totalPages) state.page++;
      else if (!isNaN(parseInt(v, 10))) state.page = parseInt(v, 10);
      render();
    }));
    if (window.lucide) lucide.createIcons();
  }

  // ----- Bulk selection / delete -----
  function renderBulkBar() {
    const bar = document.getElementById('closed-bulkbar');
    if (!bar) return;
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
    if (clearBtn) clearBtn.addEventListener('click', () => { selectedClosed.clear(); render(); });
    const delBtn = document.getElementById('closed-bulk-delete');
    if (delBtn) delBtn.addEventListener('click', bulkDeleteClosed);
  }
  async function bulkDeleteClosed() {
    const ids = [...selectedClosed].map(Number).filter(n => !isNaN(n));
    if (!ids.length) { selectedClosed.clear(); render(); return; }
    if (!window.confirm(`Remove ${ids.length} selected record${ids.length === 1 ? '' : 's'}? This can't be undone.`)) return;
    try {
      const res = await fetch('/api/closed/bulk-delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ ids })
      });
      if (!res.ok) { window.alert('Could not remove the selected records.'); return; }
    } catch (e) { window.alert('Network error.'); return; }
    selectedClosed.clear();
    await load();
    render();
  }

  // ----- Detail modal: all imported fields, with call/email buttons -----
  function openDetail(rec) {
    const data = rec.data || {};
    const keys = Object.keys(data);
    const nameCol = nameColumn(keys);
    const borrowerName = data[nameCol] || 'Closed lead';
    document.getElementById('closed-detail-title').textContent = borrowerName;
    document.getElementById('closed-detail-body').innerHTML = keys.map(k => {
      const v = data[k];
      const action = actionFor(k, v, borrowerName);
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
  function closeDetail() { document.getElementById('closed-detail-modal').classList.add('hidden'); }

  function setMsg(text, ok) {
    const el = document.getElementById('closed-msg');
    el.style.color = ok ? '#138A4B' : '#D63333';
    el.textContent = text || '';
  }

  // ----- Import -----
  async function handleFile(file) {
    if (!file) return;
    setMsg('Reading file…', true);
    let text;
    try { text = await file.text(); } catch (e) { setMsg('Could not read the file.', false); return; }
    const { objects } = csvToObjects(text);
    if (objects.length === 0) { setMsg('That CSV has no data rows.', false); return; }

    setMsg(`Importing ${objects.length} row${objects.length === 1 ? '' : 's'}…`, true);
    try {
      const res = await fetch('/api/closed/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ rows: objects })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(body.error || `Import failed (HTTP ${res.status}).`, false); return; }
      await load();
      render();
      const parts = [`${body.imported || 0} new`];
      if (body.updated) parts.push(`${body.updated} updated`);
      const unchanged = body.unchanged != null ? body.unchanged : (body.skipped || 0);
      if (unchanged) parts.push(`${unchanged} unchanged`);
      setMsg('Import complete · ' + parts.join(' · '), true);
    } catch (e) { setMsg('Network error. Is the server running?', false); }
  }

  function bind() {
    document.getElementById('closed-search').addEventListener('input', e => { query = e.target.value; state.page = 1; selectedClosed.clear(); render(); });

    // Bulk-select checkboxes (delegated; the table body re-renders).
    document.getElementById('closed-table').addEventListener('change', e => {
      if (e.target.id === 'closed-select-all') {
        filtered().forEach(r => { const id = String(r.id); if (e.target.checked) selectedClosed.add(id); else selectedClosed.delete(id); });
        render();
        return;
      }
      const cb = e.target.closest('[data-select-id]');
      if (cb) {
        const id = cb.getAttribute('data-select-id');
        if (cb.checked) selectedClosed.add(id); else selectedClosed.delete(id);
        render();
      }
    });
    document.getElementById('closed-rows-per-page').addEventListener('change', e => { state.pageSize = parseInt(e.target.value, 10); state.page = 1; render(); });

    const fileInput = document.getElementById('closed-file');
    document.getElementById('closed-import-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      handleFile(file);
      fileInput.value = ''; // allow re-importing the same file
    });

    document.getElementById('closed-table').addEventListener('click', async e => {
      const view = e.target.closest('[data-view-id]');
      if (view) {
        const rec = closed.find(r => String(r.id) === view.getAttribute('data-view-id'));
        if (rec) openDetail(rec);
        return;
      }
      const del = e.target.closest('[data-del]');
      if (!del) return;
      const id = del.getAttribute('data-del');
      if (!window.confirm('Remove this closed lead?')) return;
      try {
        const res = await fetch('/api/closed/' + id, { method: 'DELETE', credentials: 'same-origin' });
        if (!res.ok && res.status !== 404) { window.alert('Could not remove it.'); return; }
      } catch (err) { window.alert('Network error.'); return; }
      closed = closed.filter(r => String(r.id) !== String(id));
      render();
    });

    // Detail modal controls + call/email actions.
    document.getElementById('closed-detail-close').addEventListener('click', closeDetail);
    document.getElementById('closed-detail-backdrop').addEventListener('click', closeDetail);
    document.getElementById('closed-detail-body').addEventListener('click', e => {
      const callBtn = e.target.closest('[data-call]');
      if (callBtn) {
        const phone = callBtn.getAttribute('data-call');
        const name = callBtn.getAttribute('data-call-name') || 'Closed lead';
        LF.callTimer.start(); // time the call from the moment it starts
        const tel = LF.telLink(phone); if (tel) window.location.href = tel;
        openClosedCallModal(name, phone);
        return;
      }
      const emailBtn = e.target.closest('[data-email]');
      if (emailBtn) { window.open(gmailChooser(emailBtn.getAttribute('data-email')), '_blank'); return; }
    });

    bindClosedCall();
  }

  // ----- Log a call to a closed lead (dial + log into Call History) -----
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
  function bindClosedCall() {
    document.getElementById('closed-call-close').addEventListener('click', closeClosedCallModal);
    document.getElementById('closed-call-cancel').addEventListener('click', closeClosedCallModal);
    document.getElementById('closed-call-backdrop').addEventListener('click', closeClosedCallModal);
    document.getElementById('closed-call-form').elements['outcome'].addEventListener('change', e => syncClosedCallDuration(e.target.form));

    const form = document.getElementById('closed-call-form');
    const msg = document.getElementById('closed-call-msg');
    form.addEventListener('submit', async e => {
      e.preventDefault();
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

  // ----- Mount -----
  document.addEventListener('DOMContentLoaded', async function () {
    await LF.renderLayout({ active: 'closed' });
    await load();
    bind();
    render();
  });
})();
