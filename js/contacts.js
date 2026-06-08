// Contacts page: real per-user contacts (Postgres-backed CRUD).
(function () {
  let contacts = [];
  let query = '';

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function initials(name) {
    return (name || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?';
  }
  function tagPill(tag) {
    if (tag === 'Buyer')    return 'pill-blue';
    if (tag === 'Seller')   return 'pill-purple';
    if (tag === 'Investor') return 'pill-green';
    return 'pill-gray';
  }

  // ----- Load -----
  async function load() {
    try {
      const res = await fetch('/api/contacts', { credentials: 'same-origin' });
      contacts = res.ok ? await res.json() : [];
    } catch (e) { contacts = []; }
  }

  function filtered() {
    const term = query.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter(c =>
      c.name.toLowerCase().includes(term) ||
      c.email.toLowerCase().includes(term) ||
      c.phone.toLowerCase().includes(term) ||
      c.company.toLowerCase().includes(term)
    );
  }

  // ----- Render -----
  function render() {
    const rows = filtered();
    document.getElementById('contact-count').textContent = `(${contacts.length})`;

    const table = document.getElementById('contacts-table');
    if (contacts.length === 0) {
      table.innerHTML = `
        <tbody><tr><td>
          <div class="text-center py-16">
            <div class="mx-auto mb-3 stat-icon" style="background:var(--surface-3);width:48px;height:48px;border-radius:12px;">
              <i data-lucide="contact" style="width:22px;height:22px;color:#8A8AA0;"></i>
            </div>
            <div class="text-[14px] font-semibold mb-1">No contacts yet</div>
            <div class="text-[13px] text-muted mb-4">Add your first contact to get started.</div>
            <button class="btn-primary" onclick="document.getElementById('add-contact-btn').click()">
              <i data-lucide="plus" style="width:14px;height:14px;"></i> Add Contact
            </button>
          </div>
        </td></tr></tbody>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    table.innerHTML = `
      <thead>
        <tr><th>Name</th><th>Email</th><th>Phone</th><th>Company</th><th>Type</th><th>Action</th></tr>
      </thead>
      <tbody>
        ${rows.length ? rows.map(c => `
          <tr>
            <td>
              <div class="flex items-center gap-2">
                <div class="avatar avatar-sm">${initials(c.name)}</div>
                <span class="font-semibold text-[13px]">${esc(c.name)}</span>
              </div>
            </td>
            <td class="text-muted">${esc(c.email)}</td>
            <td>${esc(c.phone)}</td>
            <td class="text-muted">${esc(c.company)}</td>
            <td><span class="pill ${tagPill(c.tag)}">${esc(c.tag)}</span></td>
            <td>
              <div class="flex items-center gap-1">
                <button class="btn-icon" title="Call" data-call="${escAttr(c.phone)}" style="width:30px;height:30px;" ${c.phone ? '' : 'disabled'}>
                  <i data-lucide="phone" style="width:13px;height:13px;color:#2255a3;pointer-events:none;"></i>
                </button>
                <button class="btn-icon" title="Send email" data-email="${escAttr(c.email)}" style="width:30px;height:30px;" ${c.email ? '' : 'disabled'}>
                  <i data-lucide="mail" style="width:13px;height:13px;color:#2255a3;pointer-events:none;"></i>
                </button>
                <button class="btn-icon" title="Delete contact" data-del="${c.id}" style="width:30px;height:30px;border:none;">
                  <i data-lucide="trash-2" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i>
                </button>
              </div>
            </td>
          </tr>
        `).join('') : `<tr><td colspan="6" class="text-center py-8 text-muted">No contacts match that search.</td></tr>`}
      </tbody>`;
    if (window.lucide) lucide.createIcons();
  }

  // ----- Modal -----
  // Show the "specify type" box only when the Type is "Other".
  function syncOtherBox() {
    const form = document.getElementById('contact-form');
    const wrap = document.getElementById('contact-other-wrap');
    const isOther = form.elements['tag'].value === 'Other';
    wrap.classList.toggle('hidden', !isOther);
    if (!isOther) form.elements['otherTag'].value = '';
  }
  function openModal() {
    const form = document.getElementById('contact-form');
    form.reset();
    form.elements['tag'].value = 'Buyer';
    syncOtherBox();
    document.getElementById('contact-form-msg').textContent = '';
    document.getElementById('contact-modal').classList.remove('hidden');
    form.elements['name'].focus();
  }
  function closeModal() { document.getElementById('contact-modal').classList.add('hidden'); }

  function bind() {
    document.getElementById('add-contact-btn').addEventListener('click', openModal);
    document.getElementById('contact-modal-close').addEventListener('click', closeModal);
    document.getElementById('contact-cancel').addEventListener('click', closeModal);
    document.getElementById('contact-modal-backdrop').addEventListener('click', closeModal);
    document.getElementById('contact-tag').addEventListener('change', syncOtherBox);

    document.getElementById('contact-search').addEventListener('input', e => {
      query = e.target.value;
      render();
    });

    // Delegated table actions: email + delete.
    document.getElementById('contacts-table').addEventListener('click', async e => {
      const callBtn = e.target.closest('[data-call]');
      if (callBtn) {
        const tel = LF.telLink(callBtn.getAttribute('data-call'));
        if (tel) window.location.href = tel;
        return;
      }
      const emailBtn = e.target.closest('[data-email]');
      if (emailBtn && emailBtn.getAttribute('data-email')) {
        // Open Google's account chooser, then compose under the chosen account.
        const compose = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(emailBtn.getAttribute('data-email'));
        window.open('https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(compose), '_blank');
        return;
      }
      const delBtn = e.target.closest('[data-del]');
      if (delBtn) {
        const id = delBtn.getAttribute('data-del');
        const c = contacts.find(x => String(x.id) === String(id));
        if (!c || !window.confirm(`Delete contact "${c.name}"?`)) return;
        try {
          const res = await fetch('/api/contacts/' + id, { method: 'DELETE', credentials: 'same-origin' });
          if (!res.ok && res.status !== 404) { window.alert('Could not delete the contact.'); return; }
        } catch (err) { window.alert('Network error.'); return; }
        contacts = contacts.filter(x => String(x.id) !== String(id));
        render();
      }
    });

    const form = document.getElementById('contact-form');
    const msg = document.getElementById('contact-form-msg');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      msg.textContent = '';
      const data = Object.fromEntries(new FormData(form));
      if (!data.name.trim()) { msg.textContent = 'Name is required.'; return; }
      // When "Other" is chosen, use whatever they typed (falls back to "Other").
      let tag = data.tag;
      if (tag === 'Other') {
        const other = (data.otherTag || '').trim();
        if (other) tag = other;
      }

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.style.opacity = '0.7';
      try {
        const res = await fetch('/api/contacts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ name: data.name, email: data.email || '', phone: data.phone || '', company: data.company || '', tag })
        });
        const raw = await res.text();
        let body = {};
        try { body = raw ? JSON.parse(raw) : {}; } catch (err) {}
        if (!res.ok) { msg.textContent = body.error || `Request failed (HTTP ${res.status}).`; return; }
        contacts.push(body);
        contacts.sort((a, b) => a.name.localeCompare(b.name));
        closeModal();
        render();
      } catch (err) {
        msg.textContent = 'Network error. Is the server running?';
      } finally {
        btn.disabled = false; btn.style.opacity = '';
      }
    });
  }

  // ----- Mount -----
  document.addEventListener('DOMContentLoaded', async function () {
    await LF.renderLayout({ active: 'contacts' });
    await load();
    bind();
    render();
  });
})();
