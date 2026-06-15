// Realtor portal: a minimal, read-only view for realtors. They see their loan
// officer and the leads they're attached to. Realtors never get the CRM layout.
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function initials(name) { return (name || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?'; }
  function show(id, on) { const el = document.getElementById(id); if (el) el.classList.toggle('hidden', !on); }

  function timelinePill(t) {
    if (t === 'Buying Immediately') return 'pill-green';
    if (t === '1-3 Months') return 'pill-yellow';
    if (t === '3-6 Months') return 'pill-red';
    if (t === '6+ Months') return 'pill-blue';
    return 'pill-gray';
  }

  let me = null;

  async function api(url, opts) {
    const res = await fetch(url, Object.assign({ credentials: 'same-origin' }, opts || {}));
    return res;
  }

  function renderOfficer(o) {
    const host = document.getElementById('rp-officer');
    if (!o) { host.innerHTML = ''; return; }
    const tel = o.phone ? esc(o.phone) : '';
    host.innerHTML = `
      <div class="panel p-4 flex items-center gap-3 flex-wrap">
        <div class="avatar" style="width:44px;height:44px;">${initials(o.name)}</div>
        <div class="flex-1 min-w-0">
          <div class="text-[11.5px] text-muted">Your loan officer</div>
          <div class="text-[15px] font-semibold">${esc(o.name)}${o.title ? ` <span class="text-muted font-normal text-[12.5px]">· ${esc(o.title)}</span>` : ''}</div>
          <div class="text-[12.5px] text-muted">${esc(o.email)}${tel ? ` · ${tel}` : ''}</div>
        </div>
        <a href="mailto:${esc(o.email)}" class="btn-secondary" style="padding:6px 12px;font-size:12.5px;"><i data-lucide="mail" style="width:13px;height:13px;"></i> Email</a>
      </div>`;
  }

  function renderLeads(leads) {
    document.getElementById('rp-lead-count').textContent = leads.length ? `(${leads.length})` : '';
    const table = document.getElementById('rp-leads');
    if (!leads.length) {
      table.innerHTML = `<tbody><tr><td>
        <div class="text-center py-14">
          <div class="mx-auto mb-3 stat-icon" style="background:var(--surface-3);width:46px;height:46px;border-radius:12px;">
            <i data-lucide="users" style="width:20px;height:20px;color:#8A8AA0;"></i>
          </div>
          <div class="text-[14px] font-semibold mb-1">No shared clients yet</div>
          <div class="text-[13px] text-muted">When your loan officer attaches you to a lead, it'll show up here.</div>
        </div></td></tr></tbody>`;
      if (window.lucide) lucide.createIcons();
      return;
    }
    table.innerHTML = `
      <thead><tr><th>Name</th><th>Type</th><th>Timeline</th><th>Status</th><th>Contact</th></tr></thead>
      <tbody>
        ${leads.map(l => `
          <tr>
            <td>
              <div class="flex items-center gap-2">
                <div class="avatar avatar-sm">${initials(l.name)}</div>
                <span class="font-semibold text-[13px]">${esc(l.name)}</span>
              </div>
            </td>
            <td class="text-muted">${esc(l.leadType || 'Purchase')}</td>
            <td>${l.timeline ? `<span class="pill ${timelinePill(l.timeline)}">${esc(l.timeline)}</span>` : '<span class="text-soft">—</span>'}</td>
            <td>${l.preapproved ? '<span class="pill pill-green">Pre-approved</span>' : '<span class="text-soft">In progress</span>'}</td>
            <td class="text-muted">${[l.email, l.phone].filter(Boolean).map(esc).join('<br>') || '—'}</td>
          </tr>`).join('')}
      </tbody>`;
    if (window.lucide) lucide.createIcons();
  }

  async function loadPortal() {
    const res = await api('/api/realtor/portal');
    if (!res.ok) { document.getElementById('rp-loading').textContent = 'Could not load your portal.'; return; }
    const data = await res.json();
    document.getElementById('rp-greet').textContent = (data.realtor.name || '').split(/\s+/)[0] || 'there';
    if (data.officer) document.getElementById('rp-officer-name').textContent = (data.officer.name || '').split(/\s+/)[0] || 'your loan officer';
    renderOfficer(data.officer);
    renderLeads(data.leads || []);
    show('rp-loading', false);
    show('rp-gate', false);
    show('rp-content', true);
    if (window.lucide) lucide.createIcons();
    startChat();
  }

  // ----- Chat with the loan officer -----
  let chatCount = -1;
  function timeLabel(at) {
    const d = new Date(at);
    if (isNaN(d.getTime())) return '';
    let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
    const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return `${h}:${m} ${ap}`;
  }
  function renderChat(messages) {
    const host = document.getElementById('rp-chat');
    if (!host) return;
    if (!messages.length) {
      host.innerHTML = `<div class="text-[12.5px] text-muted text-center py-8">No messages yet. Say hello 👋</div>`;
      return;
    }
    host.innerHTML = messages.map(m => {
      const mine = m.mine;
      const align = mine ? 'align-items:flex-end;' : 'align-items:flex-start;';
      const bg = mine ? 'background:#2255a3;color:#fff;' : 'background:var(--surface-2);color:var(--text);';
      return `<div class="flex flex-col" style="${align}">
        <div style="max-width:80%;${bg}border-radius:12px;padding:7px 11px;font-size:13px;white-space:pre-wrap;word-break:break-word;">${esc(m.body)}</div>
        <div class="text-[10.5px] text-soft mt-0.5">${timeLabel(m.at)}</div>
      </div>`;
    }).join('');
  }
  async function loadChat() {
    try {
      const res = await api('/api/realtor/chat');
      if (!res.ok) return;
      const data = await res.json();
      const msgs = data.messages || [];
      renderChat(msgs);
      if (msgs.length !== chatCount) {   // only auto-scroll when the set changed
        chatCount = msgs.length;
        const host = document.getElementById('rp-chat');
        if (host) host.scrollTop = host.scrollHeight;
      }
    } catch (e) {}
  }
  async function sendChat() {
    const input = document.getElementById('rp-chat-input');
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    try {
      const res = await api('/api/realtor/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body })
      });
      if (!res.ok) { input.value = body; return; }
      await loadChat();
    } catch (e) { input.value = body; }
  }
  let chatStarted = false;
  function startChat() {
    if (chatStarted) return;
    chatStarted = true;
    document.getElementById('rp-chat-send').addEventListener('click', sendChat);
    document.getElementById('rp-chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } });
    loadChat();
    setInterval(loadChat, 5000);   // poll for new messages while the portal is open
  }

  function bindGate() {
    document.getElementById('rp-gate-save').addEventListener('click', async () => {
      const cur = document.getElementById('rp-cur').value;
      const nw = document.getElementById('rp-new').value;
      const nw2 = document.getElementById('rp-new2').value;
      const msg = document.getElementById('rp-gate-msg');
      msg.style.color = '#D63333';
      if (!cur || !nw) { msg.textContent = 'Fill in all fields.'; return; }
      if (nw.length < 6) { msg.textContent = 'New password must be at least 6 characters.'; return; }
      if (nw !== nw2) { msg.textContent = 'The new passwords don’t match.'; return; }
      const btn = document.getElementById('rp-gate-save');
      btn.disabled = true; btn.style.opacity = '0.7';
      try {
        const res = await api('/api/change-password', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword: cur, newPassword: nw })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { msg.textContent = body.error || 'Could not update your password.'; return; }
        await loadPortal();   // password set → show the portal
      } catch (e) { msg.textContent = 'Network error.'; }
      finally { btn.disabled = false; btn.style.opacity = ''; }
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    document.getElementById('rp-logout').addEventListener('click', async () => {
      try { await api('/api/logout', { method: 'POST' }); } catch (e) {}
      window.location.href = '/login.html';
    });
    bindGate();

    // Who am I? Realtors only; everyone else goes to the normal app.
    let res;
    try { res = await api('/api/me'); } catch (e) { window.location.href = '/login.html'; return; }
    if (!res.ok) { window.location.href = '/login.html'; return; }
    me = await res.json();
    if (me.role !== 'realtor') { window.location.href = '/index.html'; return; }
    document.getElementById('rp-name').textContent = me.name || '';

    if (me.mustChangePassword) {
      show('rp-loading', false);
      show('rp-gate', true);
      if (window.lucide) lucide.createIcons();
      return;
    }
    await loadPortal();
  });
})();
