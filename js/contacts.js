// Contacts page: a unified directory of every person — your leads, realtors,
// clients (previously closed leads), and saved contacts. Real contacts are
// editable here; leads and clients are view-only (manage them on their pages).
(function () {
  let contacts = [];   // raw contacts (editable)
  let leads = [];      // raw leads (view-only)
  let clients = [];    // raw closed leads (view-only)
  let query = '';
  let filterId = 'all';
  let editingId = null;
  const STD_TAGS = ['Buyer', 'Seller', 'Investor', 'Realtor'];

  const FILTERS = [
    { id: 'all',      label: 'All' },
    { id: 'lead',     label: 'Leads' },
    { id: 'contact',  label: 'Contacts' },
    { id: 'realtor',  label: 'Realtors' },
    { id: 'client',   label: 'Clients' }
  ];

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function initials(name) { return (name || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?'; }
  function waLink(phone) { return LF.waLink(phone); }
  function smsLink(phone) { return LF.smsLink(phone); }
  function gmailCompose(to) {
    const compose = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to);
    return 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(compose);
  }

  // ----- "Contact" popup menu (Call / Text / WhatsApp / Email / Meet) -----
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
    if (contact.email) {
      items.push(menuItem('mail', 'Email', '#2255a3'));
      items.push(menuItem('video', 'Google Meet', '#138A4B'));
    }
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

  // ----- Google Meet (pick a time, create a link, email it) -----
  let meetTarget = null;
  function pad2(n) { return String(n).padStart(2, '0'); }
  function createMeet(contact) {
    if (!contact || !contact.email) { window.alert('This contact has no email to send a Meet link to.'); return; }
    meetTarget = { to: contact.email, name: contact.name || '' };
    const now = new Date();
    const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const next = new Date(now.getTime() + 60 * 60000);
    document.getElementById('meet-to').textContent = contact.email;
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

  // ----- Load (contacts + leads + clients) -----
  async function loadAll() {
    const get = async (u) => { try { const r = await fetch(u, { credentials: 'same-origin' }); return r.ok ? await r.json() : []; } catch (e) { return []; } };
    [contacts, leads, clients] = await Promise.all([get('/api/contacts'), get('/api/leads'), get('/api/closed')]);
  }

  // Unified people list (each tagged with its group via LF.People).
  function allPeople() {
    return [].concat(
      contacts.map(LF.People.fromContact),
      leads.map(LF.People.fromLead),
      clients.map(LF.People.fromClient)
    );
  }
  function filteredPeople() {
    let list = allPeople();
    if (filterId !== 'all') list = list.filter(p => p.group === filterId);
    const t = query.trim().toLowerCase();
    if (t) list = list.filter(p =>
      p.name.toLowerCase().includes(t) || p.email.toLowerCase().includes(t) ||
      p.phone.toLowerCase().includes(t) || (p.company || '').toLowerCase().includes(t));
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ----- Render -----
  function renderFilters() {
    const counts = allPeople().reduce((m, p) => { m[p.group] = (m[p.group] || 0) + 1; m.all = (m.all || 0) + 1; return m; }, {});
    document.getElementById('contact-filters').innerHTML = FILTERS.map(f => `
      <div class="tab ${filterId === f.id ? 'active' : ''}" data-filter="${f.id}">
        ${f.label}
        <span class="ml-1.5 text-[11px] font-semibold rounded-full px-1.5 py-[1px]"
              style="background:${filterId === f.id ? 'rgba(34,85,163,0.12)' : 'var(--chip)'};color:${filterId === f.id ? '#2255a3' : 'var(--text-muted)'};">
          ${counts[f.id] || 0}
        </span>
      </div>`).join('');
    document.querySelectorAll('#contact-filters .tab').forEach(el => el.addEventListener('click', () => {
      filterId = el.dataset.filter; render();
    }));
  }
  function render() {
    renderFilters();
    const rows = filteredPeople();
    document.getElementById('contact-count').textContent = `(${allPeople().length})`;
    const table = document.getElementById('contacts-table');
    if (allPeople().length === 0) {
      table.innerHTML = `
        <tbody><tr><td>
          <div class="text-center py-16">
            <div class="mx-auto mb-3 stat-icon" style="background:var(--surface-3);width:48px;height:48px;border-radius:12px;">
              <i data-lucide="contact" style="width:22px;height:22px;color:#8A8AA0;"></i>
            </div>
            <div class="text-[14px] font-semibold mb-1">No people yet</div>
            <div class="text-[13px] text-muted mb-4">Add a contact, or your leads, realtors, and clients will show up here.</div>
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
        <tr><th>Name</th><th>Type</th><th>Email</th><th>Phone</th><th>Company</th><th>Action</th></tr>
      </thead>
      <tbody>
        ${rows.length ? rows.map(p => {
          const editable = p.group === 'contact' || p.group === 'realtor';
          const actions = editable ? `
            <div class="flex items-center gap-1">
              ${(p.phone || p.email) ? `<button class="btn-secondary" title="Contact" data-contact="${p.id}" style="padding:5px 11px;font-size:12px;display:inline-flex;align-items:center;gap:5px;">
                <i data-lucide="message-circle" style="width:13px;height:13px;pointer-events:none;"></i> Contact
                <i data-lucide="chevron-down" style="width:12px;height:12px;pointer-events:none;opacity:.7;"></i>
              </button>` : ''}
              <button class="btn-icon" title="Edit contact" data-edit="${p.id}" style="width:30px;height:30px;">
                <i data-lucide="pencil" style="width:13px;height:13px;color:var(--text-muted);pointer-events:none;"></i>
              </button>
              <button class="btn-icon" title="Delete contact" data-del="${p.id}" style="width:30px;height:30px;border:none;">
                <i data-lucide="trash-2" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i>
              </button>
            </div>`
            : `<button class="btn-secondary" data-person="${p.group}:${p.id}" style="padding:5px 11px;font-size:12px;">View</button>`;
          return `
          <tr>
            <td>
              <div class="flex items-center gap-2">
                <div class="avatar avatar-sm">${initials(p.name)}</div>
                <span class="font-semibold text-[13px]" data-person="${p.group}:${p.id}" style="cursor:pointer;color:var(--accent);">${esc(p.name)}</span>
              </div>
            </td>
            <td><span class="pill ${LF.People.typePill(p.group)}">${esc(p.type)}</span></td>
            <td class="text-muted">${esc(p.email)}</td>
            <td>${esc(p.phone)}</td>
            <td class="text-muted">${esc(p.company)}</td>
            <td>${actions}</td>
          </tr>`;
        }).join('') : `<tr><td colspan="6" class="text-center py-8 text-muted">No one matches that search.</td></tr>`}
      </tbody>`;
    if (window.lucide) lucide.createIcons();
  }

  // ----- Person detail modal (read-only, all fields) -----
  function openPerson(group, id) {
    const p = allPeople().find(x => x.group === group && String(x.id) === String(id));
    if (!p) return;
    document.getElementById('person-title').textContent = p.name || 'Details';
    const editBtn = (p.group === 'contact' || p.group === 'realtor')
      ? `<div class="mt-4 flex justify-end"><button id="person-edit" class="btn-secondary" style="font-size:12.5px;"><i data-lucide="pencil" style="width:13px;height:13px;"></i> Edit</button></div>` : '';
    document.getElementById('person-body').innerHTML = LF.People.detailBodyHTML(p) + editBtn;
    document.getElementById('person-modal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
    const eb = document.getElementById('person-edit');
    if (eb) eb.addEventListener('click', () => { closePerson(); openModal(p.raw); });
  }
  function closePerson() { document.getElementById('person-modal').classList.add('hidden'); }

  // ----- Add / Edit contact modal -----
  function syncTypeBoxes() {
    const form = document.getElementById('contact-form');
    const tag = form.elements['tag'].value;
    const isOther = tag === 'Other';
    const isRealtor = tag === 'Realtor';
    document.getElementById('contact-other-wrap').classList.toggle('hidden', !isOther);
    document.getElementById('contact-rel-wrap').classList.toggle('hidden', !isRealtor);
    if (!isOther) form.elements['otherTag'].value = '';
  }
  function setRelationshipValue(rel) {
    const sel = document.getElementById('contact-relationship');
    const unknownOpt = sel.querySelector('option[value="unknown"]');
    if (rel === 'unknown') {
      if (!unknownOpt) { const opt = document.createElement('option'); opt.value = 'unknown'; opt.textContent = 'Unknown (not set)'; sel.appendChild(opt); }
      sel.value = 'unknown';
    } else {
      if (unknownOpt) unknownOpt.remove();
      // Use the stored relationship if it's one of the real options, else default.
      sel.value = ['established', 'developing', 'dormant', 'past'].includes(rel) ? rel : 'established';
    }
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
      if (STD_TAGS.includes(contact.tag)) {
        form.elements['tag'].value = contact.tag;
      } else {
        form.elements['tag'].value = 'Other';
        form.elements['otherTag'].value = contact.tag === 'Other' ? '' : (contact.tag || '');
      }
      if (contact.tag === 'Realtor') setRelationshipValue(contact.relationship || 'unknown');
    } else {
      form.elements['tag'].value = 'Buyer';
      setRelationshipValue('established');
    }
    syncTypeBoxes();
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
    document.getElementById('contact-tag').addEventListener('change', syncTypeBoxes);
    document.getElementById('person-close').addEventListener('click', closePerson);
    document.getElementById('person-backdrop').addEventListener('click', closePerson);

    document.getElementById('contact-search').addEventListener('input', e => { query = e.target.value; render(); });

    // Delegated table actions.
    document.getElementById('contacts-table').addEventListener('click', async e => {
      const personEl = e.target.closest('[data-person]');
      if (personEl) { const [g, id] = personEl.getAttribute('data-person').split(':'); openPerson(g, id); return; }
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

    document.getElementById('contact-menu').addEventListener('click', e => {
      const item = e.target.closest('[data-action]');
      if (!item || !menuContact) return;
      const c = menuContact, action = item.getAttribute('data-action');
      if (action === 'Call') { const tel = LF.telLink(c.phone); if (tel) window.location.href = tel; }
      else if (action === 'Text (SMS)') { window.location.href = smsLink(c.phone); }
      else if (action === 'WhatsApp') { window.open(waLink(c.phone), '_blank'); }
      else if (action === 'Email') { window.open(gmailCompose(c.email), '_blank'); }
      else if (action === 'Google Meet') { createMeet(c); }
      closeContactMenu();
    });
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
      let tag = data.tag;
      if (tag === 'Other') { const other = (data.otherTag || '').trim(); if (other) tag = other; }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.style.opacity = '0.7';
      const payload = { name: data.name, email: data.email || '', phone: data.phone || '', company: data.company || '', tag };
      if (tag === 'Realtor') payload.relationship = data.relationship || 'established';
      try {
        const res = await fetch(editingId ? '/api/contacts/' + editingId : '/api/contacts', {
          method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify(payload)
        });
        const raw = await res.text(); let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (err) {}
        if (!res.ok) { msg.textContent = body.error || `Request failed (HTTP ${res.status}).`; return; }
        if (editingId) { const i = contacts.findIndex(x => String(x.id) === String(editingId)); if (i >= 0) contacts[i] = body; }
        else { contacts.push(body); }
        closeModal();
        render();
      } catch (err) {
        msg.textContent = 'Network error. Is the server running?';
      } finally {
        btn.disabled = false; btn.style.opacity = '';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    await LF.renderLayout({ active: 'contacts' });
    await loadAll();
    bind();
    bindMeet();
    render();
  });
})();
