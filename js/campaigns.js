// Campaigns page: create a campaign for a lead audience and send it (personalized)
// through the sender's own connected Gmail. Real per-user, Postgres-backed.
(function () {
  let campaigns = [];
  let audiences = [];   // [{ key, label, count }]

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function channelMeta(ch) {
    return ch === 'SMS'
      ? { icon: 'message-square', fg: '#2B57D9', bg: '#E7EEFF', pill: 'pill-blue' }
      : { icon: 'mail', fg: '#2255a3', bg: '#EFEAFF', pill: 'pill-purple' };
  }

  async function load() {
    try {
      const res = await fetch('/api/campaigns', { credentials: 'same-origin' });
      campaigns = res.ok ? await res.json() : [];
    } catch (e) { campaigns = []; }
  }
  async function loadAudiences() {
    try {
      const res = await fetch('/api/campaigns/audiences', { credentials: 'same-origin' });
      audiences = res.ok ? await res.json() : [];
    } catch (e) { audiences = []; }
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
          <i data-lucide="plus" style="width:16px;height:16px;color:#2255a3;pointer-events:none;"></i>
        </div>`;
    }).join('');

    const rowFor = (c) => {
      const sending = c.status === 'Sending';
      const canSend = c.type === 'Email' && c.status !== 'Sending';
      const failedBadge = c.failed ? ` <span class="text-[11px]" style="color:#D63333;">(${c.failed} failed)</span>` : '';
      return `
        <tr>
          <td class="font-semibold">${esc(c.name)}</td>
          <td><span class="pill ${channelMeta(c.type).pill}">${esc(c.type)}</span></td>
          <td class="text-muted">${esc(c.audienceLabel || '—')}</td>
          <td class="text-muted">${LF.fmtNum(c.recipients)}</td>
          <td class="text-muted">${LF.fmtNum(c.sent)}${failedBadge}</td>
          <td><span class="pill ${LF.statusPill(c.status)}">${esc(c.status)}</span></td>
          <td>
            <div class="flex items-center gap-1">
              <button data-send="${c.id}" class="btn-icon" title="${c.type === 'Email' ? 'Send campaign' : 'SMS sending not available'}" style="width:30px;height:30px;border:none;" ${canSend ? '' : 'disabled style="opacity:.4;cursor:not-allowed;width:30px;height:30px;border:none;"'}>
                <i data-lucide="${sending ? 'loader' : 'send'}" style="width:14px;height:14px;color:#2255a3;pointer-events:none;"></i>
              </button>
              <button data-del="${c.id}" class="btn-icon" title="Delete campaign" style="width:30px;height:30px;border:none;">
                <i data-lucide="trash-2" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i>
              </button>
            </div>
          </td>
        </tr>`;
    };

    const tracking = campaigns.length ? `
      <div class="overflow-x-auto rounded-xl" style="border:1px solid var(--border);">
        <table class="lf-table">
          <thead><tr><th>Campaign</th><th>Type</th><th>Audience</th><th>Recipients</th><th>Sent</th><th>Status</th><th></th></tr></thead>
          <tbody>${campaigns.map(rowFor).join('')}</tbody>
        </table>
      </div>`
      : `
      <div class="text-center py-12 rounded-xl" style="border:1px dashed var(--border-strong);">
        <div class="text-[13px] text-muted">No campaigns yet. Create one above to start sending.</div>
      </div>`;

    document.getElementById('campaigns-body').innerHTML = `
      <h3 class="text-[15px] font-semibold mb-3">Create a campaign</h3>
      <div class="grid grid-cols-12 gap-4 mb-6">${createCards}</div>
      <h3 class="text-[15px] font-semibold mb-3">Campaigns</h3>
      ${tracking}`;
    if (window.lucide) lucide.createIcons();
  }

  // ----- Modal -----
  function fillAudienceSelect() {
    const sel = document.getElementById('campaign-audience');
    if (!sel) return;
    sel.innerHTML = (audiences.length ? audiences : [{ key: 'all', label: 'All leads', count: 0 }])
      .map(a => `<option value="${a.key}">${esc(a.label)} (${a.count})</option>`).join('');
  }
  function openModal(channel) {
    const form = document.getElementById('campaign-form');
    form.reset();
    fillAudienceSelect();
    if (channel) form.elements['channel'].value = channel;
    document.getElementById('campaign-form-msg').textContent = '';
    document.getElementById('campaign-modal').classList.remove('hidden');
    form.elements['name'].focus();
  }
  function closeModal() { document.getElementById('campaign-modal').classList.add('hidden'); }

  async function sendCampaign(id) {
    const c = campaigns.find(x => String(x.id) === String(id));
    if (!c) return;
    if (!c.subject || !c.body) { window.alert('Add a subject and message to this campaign first (delete and recreate it with content).'); return; }
    const aud = audiences.find(a => a.key === c.audience);
    const count = aud ? aud.count : c.recipients;
    if (!window.confirm(`Send "${c.name}" to ${count} recipient(s) in "${c.audienceLabel}"?\n\nEach email is sent from your connected Google account.`)) return;
    try {
      const res = await fetch('/api/campaigns/' + id + '/send', { method: 'POST', credentials: 'same-origin' });
      const raw = await res.text(); let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (e) {}
      if (!res.ok) { window.alert(body.error || `Could not send (HTTP ${res.status}).`); return; }
      c.status = 'Sending'; c.recipients = body.recipients || count;
      render();
      // Sending happens in the background — refresh a few times to show progress.
      let polls = 0;
      const timer = setInterval(async () => {
        polls++;
        await load(); render();
        const cur = campaigns.find(x => String(x.id) === String(id));
        if (!cur || cur.status !== 'Sending' || polls > 12) clearInterval(timer);
      }, 2500);
    } catch (err) { window.alert('Network error.'); }
  }

  function bind() {
    document.getElementById('campaign-modal-close').addEventListener('click', closeModal);
    document.getElementById('campaign-cancel').addEventListener('click', closeModal);
    document.getElementById('campaign-modal-backdrop').addEventListener('click', closeModal);

    // Delegated: create cards + send + delete buttons (body re-renders).
    document.getElementById('campaigns-body').addEventListener('click', async e => {
      const createCard = e.target.closest('[data-create]');
      if (createCard) { openModal(createCard.getAttribute('data-create')); return; }

      const send = e.target.closest('[data-send]');
      if (send && !send.disabled) { sendCampaign(send.getAttribute('data-send')); return; }

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
      if (data.channel === 'Email' && (!data.subject.trim() || !data.body.trim())) {
        msg.textContent = 'Add a subject and message for an email campaign.'; return;
      }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.style.opacity = '0.7';
      try {
        const res = await fetch('/api/campaigns', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ name: data.name, channel: data.channel, audience: data.audience, subject: data.subject, body: data.body })
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
    await Promise.all([load(), loadAudiences()]);
    bind();
    render();
  });
})();
