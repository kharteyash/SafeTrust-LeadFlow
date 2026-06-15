// Realtors page: the realtor contacts (from RETR + leads' realtors).
(function () {
  const esc = LF.People.esc, escAttr = LF.People.escAttr;
  let realtors = [];   // normalized people (group 'realtor')
  let logins = [];     // realtor portal accounts this user created
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
    // A "give this realtor a portal login" action, pre-filled from the contact so
    // the login email always matches the realtor email saved on their leads.
    const email = (p.email || '').trim();
    let loginBlock = '';
    if (!email) {
      loginBlock = `<div class="mt-4 pt-3 text-[12.5px] text-muted" style="border-top:1px solid var(--border-soft);">
        Add an email to this realtor to give them a portal login.</div>`;
    } else if (logins.some(l => (l.email || '').toLowerCase() === email.toLowerCase())) {
      loginBlock = `<div class="mt-4 pt-3 flex items-center gap-2 text-[12.5px]" style="border-top:1px solid var(--border-soft);color:#138A4B;">
        <i data-lucide="check-circle" style="width:14px;height:14px;"></i> This realtor already has a portal login.</div>`;
    } else {
      loginBlock = `<div class="mt-4 pt-3 flex items-center justify-between gap-2 flex-wrap" style="border-top:1px solid var(--border-soft);">
        <span class="text-[12.5px] text-muted">Let this realtor follow their shared clients.</span>
        <button id="person-give-login" class="btn-secondary" style="padding:6px 12px;font-size:12.5px;"><i data-lucide="key-round" style="width:13px;height:13px;"></i> Create portal login</button>
      </div>`;
    }
    document.getElementById('person-body').innerHTML = LF.People.detailBodyHTML(p) + loginBlock;
    document.getElementById('person-modal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
    const giveBtn = document.getElementById('person-give-login');
    if (giveBtn) giveBtn.addEventListener('click', () => {
      closeModal();
      openLoginModal({ email, name: p.name || '' });
    });
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

  // ----- Realtor logins (portal accounts) -----
  async function loadLogins() {
    try { const r = await fetch('/api/realtor-accounts', { credentials: 'same-origin' }); logins = r.ok ? await r.json() : []; }
    catch (e) { logins = []; }
  }
  function renderLogins() {
    const host = document.getElementById('realtor-logins');
    const countEl = document.getElementById('realtor-login-count');
    if (countEl) countEl.textContent = logins.length ? `(${logins.length})` : '';
    if (!host) return;
    if (!logins.length) {
      host.innerHTML = `<div class="text-[13px] text-muted py-2">No realtor logins yet. Click “Create realtor login” to give a realtor portal access.</div>`;
      return;
    }
    host.innerHTML = `<div class="rounded-xl overflow-hidden" style="border:1px solid var(--border);">
      ${logins.map((l, i) => `
        <div class="flex items-center justify-between gap-3 px-4 py-3 ${i > 0 ? 'border-t' : ''}" style="border-color:var(--border);">
          <div class="flex items-center gap-2 min-w-0">
            <div class="avatar avatar-sm">${initials(l.name)}</div>
            <div class="min-w-0">
              <div class="font-semibold text-[13px] flex items-center gap-1.5 flex-wrap">${esc(l.name)}
                ${l.pending ? '<span class="pill pill-yellow" style="font-size:10px;">Awaiting first sign-in</span>' : '<span class="pill pill-green" style="font-size:10px;">Active</span>'}
                ${l.locked ? '<span class="pill pill-red" style="font-size:10px;">Locked</span>' : ''}
              </div>
              <div class="text-[11.5px] text-muted truncate">${esc(l.email)}</div>
            </div>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            <button class="btn-secondary" data-reset-login="${l.id}" style="padding:5px 10px;font-size:12px;" title="Email a new temporary password">Reset password</button>
            <button class="btn-icon" data-del-login="${l.id}" data-login-name="${escAttr(l.name)}" title="Remove login" style="width:30px;height:30px;border:none;">
              <i data-lucide="trash-2" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i>
            </button>
          </div>
        </div>`).join('')}
    </div>`;
    if (window.lucide) lucide.createIcons();
  }
  function openLoginModal(prefill) {
    document.getElementById('rlogin-email').value = (prefill && prefill.email) || '';
    document.getElementById('rlogin-name').value = (prefill && prefill.name) || '';
    const m = document.getElementById('rlogin-msg'); m.textContent = '';
    document.getElementById('rlogin-modal').classList.remove('hidden');
    document.getElementById((prefill && prefill.email) ? 'rlogin-name' : 'rlogin-email').focus();
  }
  function closeLoginModal() { document.getElementById('rlogin-modal').classList.add('hidden'); }
  function bindLogins() {
    document.getElementById('realtor-login-btn').addEventListener('click', openLoginModal);
    document.getElementById('rlogin-close').addEventListener('click', closeLoginModal);
    document.getElementById('rlogin-cancel').addEventListener('click', closeLoginModal);
    document.getElementById('rlogin-backdrop').addEventListener('click', closeLoginModal);

    document.getElementById('rlogin-submit').addEventListener('click', async () => {
      const email = document.getElementById('rlogin-email').value.trim();
      const name = document.getElementById('rlogin-name').value.trim();
      const m = document.getElementById('rlogin-msg');
      if (!email) { m.style.color = '#D63333'; m.textContent = 'Enter an email address.'; return; }
      const btn = document.getElementById('rlogin-submit');
      btn.disabled = true; btn.style.opacity = '0.7';
      m.style.color = 'var(--text-muted)'; m.textContent = 'Creating…';
      try {
        const res = await fetch('/api/realtor-accounts/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ email, name })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { m.style.color = '#D63333'; m.textContent = body.error || 'Could not create the login.'; return; }
        await loadLogins(); renderLogins();
        if (body.emailed) {
          closeLoginModal();
        } else {
          m.style.color = '#B07A00';
          m.innerHTML = `Created, but the email couldn't be sent${body.emailError ? ` (${esc(body.emailError)})` : ''}. Share this temporary password: <b>${esc(body.tempPassword)}</b>`;
        }
      } catch (e) { m.style.color = '#D63333'; m.textContent = 'Network error.'; }
      finally { btn.disabled = false; btn.style.opacity = ''; }
    });

    // Delegated reset / delete on the logins list.
    document.getElementById('realtor-logins').addEventListener('click', async (e) => {
      const resetBtn = e.target.closest('[data-reset-login]');
      if (resetBtn) {
        const id = resetBtn.getAttribute('data-reset-login');
        resetBtn.disabled = true;
        try {
          const res = await fetch('/api/realtor-accounts/' + id + '/reset-password', { method: 'POST', credentials: 'same-origin' });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) { window.alert(body.error || 'Could not reset the password.'); }
          else if (body.emailed) { window.alert('A new temporary password was emailed to the realtor.'); }
          else { window.alert(`Couldn't email it. Share this temporary password with them:\n\n${body.tempPassword}`); }
          await loadLogins(); renderLogins();
        } catch (err) { window.alert('Network error.'); }
        finally { resetBtn.disabled = false; }
        return;
      }
      const delBtn = e.target.closest('[data-del-login]');
      if (delBtn) {
        const id = delBtn.getAttribute('data-del-login');
        const name = delBtn.getAttribute('data-login-name') || 'this realtor';
        if (!window.confirm(`Remove ${name}'s login? They'll no longer be able to sign in.`)) return;
        try {
          const res = await fetch('/api/realtor-accounts/' + id, { method: 'DELETE', credentials: 'same-origin' });
          if (!res.ok && res.status !== 404) { window.alert('Could not remove the login.'); return; }
          await loadLogins(); renderLogins();
        } catch (err) { window.alert('Network error.'); }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    await LF.renderLayout({ active: 'realtors' });
    await Promise.all([load(), loadLogins()]);
    bind();
    bindLogins();
    render();
    renderLogins();
  });
})();
