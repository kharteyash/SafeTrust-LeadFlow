// Previously Closed leads: imported from CSV, displayed in a dynamic table.
(function () {
  let closed = []; // [{ id, data: {col: value} }]
  let query = '';

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
  function actionFor(header, value) {
    if (!value) return '';
    if (isEmailField(header)) {
      return `<button class="btn-icon" title="Send email" data-email="${escAttr(value)}" style="width:28px;height:28px;">
        <i data-lucide="mail" style="width:13px;height:13px;color:#6D5BFF;pointer-events:none;"></i></button>`;
    }
    if (isPhoneField(header)) {
      return `<button class="btn-icon" title="Call" data-call="${escAttr(value)}" style="width:28px;height:28px;">
        <i data-lucide="phone" style="width:13px;height:13px;color:#6D5BFF;pointer-events:none;"></i></button>`;
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
    const rows = filtered();
    document.getElementById('closed-count').textContent = closed.length
      ? (query.trim() ? `${rows.length} of ${closed.length}` : `(${closed.length})`)
      : '';

    if (closed.length === 0) {
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

    const allCols = computeColumns();
    const cols = pickColumns(allCols);
    const nameCol = nameColumn(allCols);
    table.innerHTML = `
      <thead>
        <tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}<th>Action</th></tr>
      </thead>
      <tbody>
        ${rows.length === 0
          ? `<tr><td colspan="${cols.length + 1}" class="text-center py-10 text-muted">No closed leads match "${esc(query)}".</td></tr>`
          : rows.map(r => `
          <tr>
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
    if (window.lucide) lucide.createIcons();
  }

  // ----- Detail modal: all imported fields, with call/email buttons -----
  function openDetail(rec) {
    const data = rec.data || {};
    const keys = Object.keys(data);
    const nameCol = nameColumn(keys);
    document.getElementById('closed-detail-title').textContent = data[nameCol] || 'Closed lead';
    document.getElementById('closed-detail-body').innerHTML = keys.map(k => {
      const v = data[k];
      const action = actionFor(k, v);
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
      const dupes = body.skipped || 0;
      setMsg(`Imported ${body.imported} row${body.imported === 1 ? '' : 's'}` + (dupes ? ` · ${dupes} duplicate${dupes === 1 ? '' : 's'} skipped` : ''), true);
    } catch (e) { setMsg('Network error. Is the server running?', false); }
  }

  function bind() {
    document.getElementById('closed-search').addEventListener('input', e => { query = e.target.value; render(); });

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
      if (callBtn) { const tel = LF.telLink(callBtn.getAttribute('data-call')); if (tel) window.location.href = tel; return; }
      const emailBtn = e.target.closest('[data-email]');
      if (emailBtn) { window.open(gmailChooser(emailBtn.getAttribute('data-email')), '_blank'); return; }
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
