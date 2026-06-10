// Realtors page: the realtor contacts (from RETR + leads' realtors).
(function () {
  const esc = LF.People.esc, escAttr = LF.People.escAttr;
  let realtors = [];   // normalized people (group 'realtor')
  let query = '';

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
      if (window.lucide) lucide.createIcons();
      return;
    }
    table.innerHTML = `
      <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Company</th><th>Relationship</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map(p => `
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
    if (window.lucide) lucide.createIcons();
  }

  function openModal(p) {
    document.getElementById('person-title').textContent = p.name || 'Realtor';
    document.getElementById('person-body').innerHTML = LF.People.detailBodyHTML(p);
    document.getElementById('person-modal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }
  function closeModal() { document.getElementById('person-modal').classList.add('hidden'); }

  function bind() {
    document.getElementById('realtor-search').addEventListener('input', e => { query = e.target.value; render(); });
    document.getElementById('realtors-table').addEventListener('click', e => {
      const row = e.target.closest('[data-view]');
      if (!row) return;
      const p = realtors.find(x => String(x.id) === row.getAttribute('data-view'));
      if (p) openModal(p);
    });
    document.getElementById('person-close').addEventListener('click', closeModal);
    document.getElementById('person-backdrop').addEventListener('click', closeModal);
  }

  document.addEventListener('DOMContentLoaded', async function () {
    await LF.renderLayout({ active: 'realtors' });
    await load();
    bind();
    render();
  });
})();
