// Contacts page: real per-user contacts (Postgres-backed CRUD).
(function () {
  let contacts = [];
  let query = '';
  let editingId = null;   // contact being edited, if any
  const STD_TAGS = ['Buyer', 'Seller', 'Investor'];

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function initials(name) {
    return (name || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?';
  }
  // Shared, format-tolerant phone helpers (accept +1, (xxx), E.164, etc.).
  function waLink(phone) { return LF.waLink(phone); }
  function smsLink(phone) { return LF.smsLink(phone); }
  function gmailCompose(to) {
    const compose = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to);
    return 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(compose);
  }

  // ----- "Contact" popup menu (Call / Text / WhatsApp / Email) -----
  let menuContact = null;
  function menuItem(icon, label, color) {
    return `<button class="flex items-center gap-2.5 w-full text-left rounded-md px-3 py-2 hover:bg-[#FAFAFC]" data-action="${label}" style="font-size:13px;">
      <i data-lucide="${icon}" style="width:15px;height:15px;color:${color};pointer-events:none;"></i><span>${label}</span></button>`;
  }
  function openContactMenu(contact, anchor) {
    menuContact = contact;
    const menu = document.getElementById('contact-menu');
    const items = [];
    if (contact.phone) {
      items.push(menuItem('phone', 'Call', '#2255a3'));
      items.push(menuItem('message-square', 'Text (SMS)', '#2255a3'));
      items.push(menuItem('message-circle', 'WhatsApp', '#138A4B'));
    }
    if (contact.email) items.push(menuItem('mail', 'Email', '#2255a3'));
    menu.innerHTML = items.join('');
    menu.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    const mw = 190;
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - mw - 8)) + 'px';
    menu.style.top = (r.bottom + 4) + 'px';
    if (window.lucide) lucide.createIcons();
  }
  function closeContactMenu() {
    const menu = document.getElementById('contact-menu');
    if (menu) menu.classList.add('hidden');
    menuContact = null;
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
                ${(c.phone || c.email) ? `<button class="btn-secondary" title="Contact" data-contact="${c.id}" style="padding:5px 11px;font-size:12px;display:inline-flex;align-items:center;gap:5px;">
                  <i data-lucide="message-circle" style="width:13px;height:13px;pointer-events:none;"></i> Contact
                  <i data-lucide="chevron-down" style="width:12px;height:12px;pointer-events:none;opacity:.7;"></i>
                </button>` : ''}
                <button class="btn-icon" title="Edit contact" data-edit="${c.id}" style="width:30px;height:30px;">
                  <i data-lucide="pencil" style="width:13px;height:13px;color:var(--text-muted);pointer-events:none;"></i>
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
  function openModal(contact) {
    const form = document.getElementById('contact-form');
    form.reset();
    editingId = contact ? contact.id : null;
    document.getElementById('contact-modal-title').textContent = contact ? 'Edit contact' : 'Add contact';
    document.getElementById('contact-submit').textContent = contact ? 'Save changes' : 'Add contact';
    if (contact) {
      form.elements['name'].value = contact.name || '';
      form.elements['email'].value = contact.email || '';
      form.elements['phone'].value = contact.phone || '';
      form.elements['company'].value = contact.company || '';
      // A non-standard tag means it was a custom "Other" value.
      if (STD_TAGS.includes(contact.tag)) {
        form.elements['tag'].value = contact.tag;
      } else {
        form.elements['tag'].value = 'Other';
        form.elements['otherTag'].value = contact.tag === 'Other' ? '' : (contact.tag || '');
      }
    } else {
      form.elements['tag'].value = 'Buyer';
    }
    syncOtherBox();
    document.getElementById('contact-form-msg').textContent = '';
    document.getElementById('contact-modal').classList.remove('hidden');
    form.elements['name'].focus();
  }
  function closeModal() { document.getElementById('contact-modal').classList.add('hidden'); }

  function bind() {
    document.getElementById('add-contact-btn').addEventListener('click', () => openModal(null));
    document.getElementById('contact-modal-close').addEventListener('click', closeModal);
    document.getElementById('contact-cancel').addEventListener('click', closeModal);
    document.getElementById('contact-modal-backdrop').addEventListener('click', closeModal);
    document.getElementById('contact-tag').addEventListener('change', syncOtherBox);

    document.getElementById('contact-search').addEventListener('input', e => {
      query = e.target.value;
      render();
    });

    // Delegated table actions: contact menu + edit + delete.
    document.getElementById('contacts-table').addEventListener('click', async e => {
      const contactBtn = e.target.closest('[data-contact]');
      if (contactBtn) {
        const c = contacts.find(x => String(x.id) === contactBtn.getAttribute('data-contact'));
        if (c) openContactMenu(c, contactBtn);
        return;
      }
      const editBtn = e.target.closest('[data-edit]');
      if (editBtn) {
        const c = contacts.find(x => String(x.id) === editBtn.getAttribute('data-edit'));
        if (c) openModal(c);
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

    // Contact menu: run the chosen action, then close.
    document.getElementById('contact-menu').addEventListener('click', e => {
      const item = e.target.closest('[data-action]');
      if (!item || !menuContact) return;
      const c = menuContact, action = item.getAttribute('data-action');
      if (action === 'Call') { const tel = LF.telLink(c.phone); if (tel) window.location.href = tel; }
      else if (action === 'Text (SMS)') { window.location.href = smsLink(c.phone); }
      else if (action === 'WhatsApp') { window.open(waLink(c.phone), '_blank'); }
      else if (action === 'Email') { window.open(gmailCompose(c.email), '_blank'); }
      closeContactMenu();
    });
    // Close the menu on an outside click or when scrolling.
    document.addEventListener('click', e => {
      if (document.getElementById('contact-menu').classList.contains('hidden')) return;
      if (e.target.closest('#contact-menu') || e.target.closest('[data-contact]')) return;
      closeContactMenu();
    });
    window.addEventListener('scroll', closeContactMenu, true);

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
      const payload = { name: data.name, email: data.email || '', phone: data.phone || '', company: data.company || '', tag };
      try {
        const res = await fetch(editingId ? '/api/contacts/' + editingId : '/api/contacts', {
          method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify(payload)
        });
        const raw = await res.text();
        let body = {};
        try { body = raw ? JSON.parse(raw) : {}; } catch (err) {}
        if (!res.ok) { msg.textContent = body.error || `Request failed (HTTP ${res.status}).`; return; }
        if (editingId) {
          const i = contacts.findIndex(x => String(x.id) === String(editingId));
          if (i >= 0) contacts[i] = body;
        } else {
          contacts.push(body);
        }
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
