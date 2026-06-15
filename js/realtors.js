// Realtors page: the realtor contacts (from RETR + leads' realtors).
(function () {
  const esc = LF.People.esc, escAttr = LF.People.escAttr;
  let realtors = [];   // normalized people (group 'realtor')
  let query = '';
  let page = 1;
  let pageSize = 10;   // show 10 by default, like the Leads table

  function initials(name) {
    const p = String(name || '').trim().split(/\s+/);
    return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
  }

  async function load() {
    let contacts = [];
    try { const r = await fetch('/api/contacts', { credentials: 'same-origin' }); contacts = r.ok ? await r.json() : []; }
    catch (e) { contacts = []; }
    realtors = contacts.filter(c => c.tag === 'Realtor').map(LF.People.fromContact);
  }

  function filtered() {
    const t = query.trim().toLowerCase();
    if (!t) return realtors;
    return realtors.filter(p =>
      p.name.toLowerCase().includes(t) || p.email.toLowerCase().includes(t) ||
      p.phone.toLowerCase().includes(t) || (p.company || '').toLowerCase().includes(t));
  }

  function render() {
    const rows = filtered();
    document.getElementById('realtor-count').textContent = realtors.length ? `(${realtors.length})` : '';
    const table = document.getElementById('realtors-table');
    if (realtors.length === 0) {
      table.innerHTML = `<tbody><tr><td>
        <div class="text-center py-16">
          <div class="mx-auto mb-3 stat-icon" style="background:var(--surface-3);width:48px;height:48px;border-radius:12px;">
            <i data-lucide="home" style="width:22px;height:22px;color:#8A8AA0;"></i>
          </div>
          <div class="text-[14px] font-semibold mb-1">No realtors yet</div>
          <div class="text-[13px] text-muted">Realtors appear here when you push them from RETR or attach one to a lead.</div>
        </div>
      </td></tr></tbody>`;
      renderFooter(0, 0, 0);
      if (window.lucide) lucide.createIcons();
      return;
    }
    // Paginate (10 per page by default), like the Leads table.
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    if (page > totalPages) page = totalPages;
    const start = (page - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);
    table.innerHTML = `
      <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Company</th><th>Relationship</th></tr></thead>
      <tbody>
        ${pageRows.length ? pageRows.map(p => `
          <tr data-view="${p.id}" style="cursor:pointer;">
            <td>
              <div class="flex items-center gap-2">
                <div class="avatar avatar-sm">${initials(p.name)}</div>
                <span class="font-semibold text-[13px]" style="color:var(--accent);">${esc(p.name)}</span>
              </div>
            </td>
            <td class="text-muted">${esc(p.email)}</td>
            <td>${esc(p.phone)}</td>
            <td class="text-muted">${esc(p.company)}</td>
            <td><span class="pill ${LF.People.typePill('realtor')}">${esc(LF.People.relLabel((p.raw.relationship) || 'unknown'))}</span></td>
          </tr>`).join('') : `<tr><td colspan="5" class="text-center py-8 text-muted">No realtors match that search.</td></tr>`}
      </tbody>`;
    renderFooter(rows.length, start, pageRows.length);
    if (window.lucide) lucide.createIcons();
  }

  // ----- Summary + pager (mirrors the Leads table) -----
  function renderFooter(total, start, shown) {
    const summary = document.getElementById('realtor-summary');
    const pager = document.getElementById('realtor-pager');
    if (!summary || !pager) return;
    summary.textContent = total === 0 ? 'No realtors to show' : `Showing ${start + 1} to ${start + shown} of ${total}`;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (total <= pageSize) { pager.innerHTML = ''; return; }
    const pages = [];
    for (let p = 1; p <= totalPages; p++) pages.push(p);
    pager.innerHTML = `
      <button class="btn-icon" data-page="prev" style="width:30px;height:30px;" ${page === 1 ? 'disabled' : ''}>
        <i data-lucide="chevron-left" style="width:14px;height:14px;color:var(--text-muted);"></i>
      </button>
      ${pages.map(p => {
        const active = p === page;
        const style = active
          ? 'background:#2255a3;color:#FFF;'
          : 'background:var(--surface);color:var(--text);border:1px solid var(--border-strong);';
        return `<button data-page="${p}" class="rounded-md text-[12.5px] font-semibold" style="width:30px;height:30px;${style}">${p}</button>`;
      }).join('')}
      <button class="btn-icon" data-page="next" style="width:30px;height:30px;" ${page === totalPages ? 'disabled' : ''}>
        <i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text-muted);"></i>
      </button>`;
    pager.querySelectorAll('button[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.page;
        if (v === 'prev' && page > 1) page--;
        else if (v === 'next' && page < totalPages) page++;
        else if (!isNaN(parseInt(v, 10))) page = parseInt(v, 10);
        render();
      });
    });
  }

  function openModal(p) {
    document.getElementById('person-title').textContent = p.name || 'Realtor';
    document.getElementById('person-body').innerHTML = LF.People.detailBodyHTML(p);
    document.getElementById('person-modal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }
  function closeModal() { document.getElementById('person-modal').classList.add('hidden'); }

  // ----- Add realtor -----
  function openAddModal() {
    const form = document.getElementById('realtor-form');
    form.reset();
    form.elements['relationship'].value = 'established';
    document.getElementById('realtor-form-msg').textContent = '';
    document.getElementById('realtor-modal').classList.remove('hidden');
    form.elements['name'].focus();
  }
  function closeAddModal() { document.getElementById('realtor-modal').classList.add('hidden'); }

  function bind() {
    document.getElementById('realtor-search').addEventListener('input', e => { query = e.target.value; page = 1; render(); });
    const rpp = document.getElementById('realtor-rows-per-page');
    if (rpp) {
      rpp.value = String(pageSize);
      rpp.addEventListener('change', e => { pageSize = parseInt(e.target.value, 10) || 10; page = 1; render(); });
    }
    document.getElementById('realtors-table').addEventListener('click', e => {
      const row = e.target.closest('[data-view]');
      if (!row) return;
      const p = realtors.find(x => String(x.id) === row.getAttribute('data-view'));
      if (p) openModal(p);
    });
    document.getElementById('person-close').addEventListener('click', closeModal);
    document.getElementById('person-backdrop').addEventListener('click', closeModal);

    // Add realtor modal.
    document.getElementById('add-realtor-btn').addEventListener('click', openAddModal);
    document.getElementById('realtor-modal-close').addEventListener('click', closeAddModal);
    document.getElementById('realtor-cancel').addEventListener('click', closeAddModal);
    document.getElementById('realtor-modal-backdrop').addEventListener('click', closeAddModal);
    const form = document.getElementById('realtor-form');
    const msg = document.getElementById('realtor-form-msg');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      msg.textContent = '';
      const data = Object.fromEntries(new FormData(form));
      if (!data.name.trim()) { msg.textContent = 'Name is required.'; return; }
      const btn = document.getElementById('realtor-submit');
      btn.disabled = true; btn.style.opacity = '0.7';
      try {
        const res = await fetch('/api/contacts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({
            name: data.name, email: data.email || '', phone: data.phone || '',
            company: data.company || '', tag: 'Realtor', relationship: data.relationship || 'established',
            birthday: data.birthday || ''
          })
        });
        const raw = await res.text(); let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (err) {}
        if (!res.ok) { msg.textContent = body.error || `Request failed (HTTP ${res.status}).`; return; }
        realtors.push(LF.People.fromContact(body));
        realtors.sort((a, b) => a.name.localeCompare(b.name));
        closeAddModal();
        render();
      } catch (err) { msg.textContent = 'Network error. Is the server running?'; }
      finally { btn.disabled = false; btn.style.opacity = ''; }
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    await LF.renderLayout({ active: 'realtors' });
    await load();
    bind();
    render();
  });
})();
