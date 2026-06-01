// Campaigns page: real per-user campaigns (Postgres-backed CRUD).
(function () {
  let campaigns = [];

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function channelMeta(ch) {
    return ch === 'SMS'
      ? { icon: 'message-square', fg: '#2B57D9', bg: '#E7EEFF', pill: 'pill-blue' }
      : { icon: 'mail', fg: '#6D5BFF', bg: '#EFEAFF', pill: 'pill-purple' };
  }

  async function load() {
    try {
      const res = await fetch('/api/campaigns', { credentials: 'same-origin' });
      campaigns = res.ok ? await res.json() : [];
    } catch (e) { campaigns = []; }
  }

  function render() {
    const createCards = [
      { label: 'Email campaign', icon: 'mail',           ch: 'Email' },
      { label: 'SMS campaign',   icon: 'message-square', ch: 'SMS' }
    ].map(c => {
      const m = channelMeta(c.ch);
      return `
        <div class="col-span-12 md:col-span-6 rounded-xl p-5 flex items-center gap-3 cursor-pointer hover:bg-[#FAFAFC]" style="border:1px solid var(--border);" data-create="${c.ch}">
          <span class="stat-icon" style="background:${m.bg};width:40px;height:40px;">
            <i data-lucide="${c.icon}" style="width:18px;height:18px;color:${m.fg};"></i>
          </span>
          <div class="flex-1">
            <div class="text-[14px] font-semibold">${c.label}</div>
            <div class="text-[12px] text-muted">Create a new ${c.ch} campaign</div>
          </div>
          <i data-lucide="plus" style="width:16px;height:16px;color:#6D5BFF;pointer-events:none;"></i>
        </div>`;
    }).join('');

    const tracking = campaigns.length ? `
      <div class="overflow-x-auto rounded-xl" style="border:1px solid var(--border);">
        <table class="lf-table">
          <thead><tr><th>Campaign</th><th>Type</th><th>Status</th><th>Delivered</th><th>Opened</th><th>Clicked</th><th>Replied</th><th></th></tr></thead>
          <tbody>
            ${campaigns.map(c => `
              <tr>
                <td class="font-semibold">${esc(c.name)}</td>
                <td><span class="pill ${channelMeta(c.type).pill}">${esc(c.type)}</span></td>
                <td><span class="pill ${LF.statusPill(c.status)}">${esc(c.status)}</span></td>
                <td class="text-muted">${LF.fmtNum(c.sent)}</td>
                <td class="text-muted">${LF.fmtNum(c.opens)}</td>
                <td class="text-muted">${LF.fmtNum(c.clicks)}</td>
                <td class="text-muted">${LF.fmtNum(c.replies)}</td>
                <td>
                  <button data-del="${c.id}" class="btn-icon" title="Delete campaign" style="width:30px;height:30px;border:none;">
                    <i data-lucide="trash-2" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i>
                  </button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`
      : `
      <div class="text-center py-12 rounded-xl" style="border:1px dashed var(--border-strong);">
        <div class="text-[13px] text-muted">No campaigns yet. Create one above to start tracking it.</div>
      </div>`;

    document.getElementById('campaigns-body').innerHTML = `
      <h3 class="text-[15px] font-semibold mb-3">Create a campaign</h3>
      <div class="grid grid-cols-12 gap-4 mb-6">${createCards}</div>
      <h3 class="text-[15px] font-semibold mb-3">Tracking</h3>
      ${tracking}`;
    if (window.lucide) lucide.createIcons();
  }

  // ----- Modal -----
  function openModal(channel) {
    const form = document.getElementById('campaign-form');
    form.reset();
    if (channel) form.elements['channel'].value = channel;
    form.elements['status'].value = 'Draft';
    document.getElementById('campaign-form-msg').textContent = '';
    document.getElementById('campaign-modal').classList.remove('hidden');
    form.elements['name'].focus();
  }
  function closeModal() { document.getElementById('campaign-modal').classList.add('hidden'); }

  function bind() {
    document.getElementById('campaign-modal-close').addEventListener('click', closeModal);
    document.getElementById('campaign-cancel').addEventListener('click', closeModal);
    document.getElementById('campaign-modal-backdrop').addEventListener('click', closeModal);

    // Delegated: create cards + delete buttons (body re-renders).
    document.getElementById('campaigns-body').addEventListener('click', async e => {
      const createCard = e.target.closest('[data-create]');
      if (createCard) { openModal(createCard.getAttribute('data-create')); return; }

      const del = e.target.closest('[data-del]');
      if (del) {
        const id = del.getAttribute('data-del');
        const c = campaigns.find(x => String(x.id) === String(id));
        if (!c || !window.confirm(`Delete campaign "${c.name}"?`)) return;
        try {
          const res = await fetch('/api/campaigns/' + id, { method: 'DELETE', credentials: 'same-origin' });
          if (!res.ok && res.status !== 404) { window.alert('Could not delete the campaign.'); return; }
        } catch (err) { window.alert('Network error.'); return; }
        campaigns = campaigns.filter(x => String(x.id) !== String(id));
        render();
      }
    });

    const form = document.getElementById('campaign-form');
    const msg = document.getElementById('campaign-form-msg');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      msg.textContent = '';
      const data = Object.fromEntries(new FormData(form));
      if (!data.name.trim()) { msg.textContent = 'Campaign name is required.'; return; }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.style.opacity = '0.7';
      try {
        const res = await fetch('/api/campaigns', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ name: data.name, channel: data.channel, status: data.status })
        });
        const raw = await res.text();
        let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (err) {}
        if (!res.ok) { msg.textContent = body.error || `Request failed (HTTP ${res.status}).`; return; }
        campaigns.unshift(body);
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
    await LF.renderLayout({ active: 'campaigns' });
    await load();
    bind();
    render();
  });
})();
