// Previously Closed leads: imported from CSV, displayed in a dynamic table.
(function () {
  let closed = []; // [{ id, data: {col: value} }]

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

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
    document.getElementById('closed-count').textContent = closed.length ? `(${closed.length})` : '';
    const table = document.getElementById('closed-table');

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

    const cols = computeColumns();
    table.innerHTML = `
      <thead>
        <tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}<th>Action</th></tr>
      </thead>
      <tbody>
        ${closed.map(r => `
          <tr>
            ${cols.map(c => `<td class="${c === cols[0] ? 'font-semibold' : 'text-muted'}">${esc(r.data ? r.data[c] : '') || '<span class="text-soft">—</span>'}</td>`).join('')}
            <td>
              <button class="btn-icon" title="Remove" data-del="${r.id}" style="width:30px;height:30px;border:none;">
                <i data-lucide="trash-2" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i>
              </button>
            </td>
          </tr>`).join('')}
      </tbody>`;
    if (window.lucide) lucide.createIcons();
  }

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
    const fileInput = document.getElementById('closed-file');
    document.getElementById('closed-import-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      handleFile(file);
      fileInput.value = ''; // allow re-importing the same file
    });

    document.getElementById('closed-table').addEventListener('click', async e => {
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
  }

  // ----- Mount -----
  document.addEventListener('DOMContentLoaded', async function () {
    await LF.renderLayout({ active: 'closed' });
    await load();
    bind();
    render();
  });
})();
