// Campaigns page: create a campaign for a lead audience and send it (personalized)
// through the sender's own connected Gmail. Real per-user, Postgres-backed.
(function () {
  let campaigns = [];
  let audiences = [];   // [{ key, label, count }]

  let editingId = null;   // null = creating, otherwise the campaign being edited

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

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
    const createCard = `
      <div class="rounded-xl p-5 flex items-center gap-3 cursor-pointer hover:bg-[#FAFAFC]" style="border:1px solid var(--border);" data-create="1">
        <span class="stat-icon" style="background:#EFEAFF;width:40px;height:40px;">
          <i data-lucide="mail" style="width:18px;height:18px;color:#2255a3;"></i>
        </span>
        <div class="flex-1">
          <div class="text-[14px] font-semibold">New email campaign</div>
          <div class="text-[12px] text-muted">Write once, send personalized to a lead audience</div>
        </div>
        <i data-lucide="plus" style="width:16px;height:16px;color:#2255a3;pointer-events:none;"></i>
      </div>`;

    const rowFor = (c) => {
      const sending = c.status === 'Sending';
      const canSend = c.status !== 'Sending';
      const failedBadge = c.failed ? ` <span class="text-[11px]" style="color:#D63333;">(${c.failed} failed)</span>` : '';
      return `
        <tr>
          <td class="font-semibold">${esc(c.name)}</td>
          <td class="text-muted">${esc(c.audienceLabel || '—')}</td>
          <td class="text-muted">${LF.fmtNum(c.recipients)}</td>
          <td class="text-muted">${LF.fmtNum(c.sent)}${failedBadge}</td>
          <td><span class="pill ${LF.statusPill(c.status)}">${esc(c.status)}</span></td>
          <td>
            <div class="flex items-center gap-1">
              <button data-send="${c.id}" class="btn-icon" title="Send campaign" style="width:30px;height:30px;border:none;" ${canSend ? '' : 'disabled style="opacity:.4;cursor:not-allowed;width:30px;height:30px;border:none;"'}>
                <i data-lucide="${sending ? 'loader' : 'send'}" style="width:14px;height:14px;color:#2255a3;pointer-events:none;"></i>
              </button>
              <button data-edit="${c.id}" class="btn-icon" title="Edit campaign" style="width:30px;height:30px;border:none;">
                <i data-lucide="pencil" style="width:14px;height:14px;color:var(--text-muted);pointer-events:none;"></i>
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
          <thead><tr><th>Campaign</th><th>Audience</th><th>Recipients</th><th>Sent</th><th>Status</th><th></th></tr></thead>
          <tbody>${campaigns.map(rowFor).join('')}</tbody>
        </table>
      </div>`
      : `
      <div class="text-center py-12 rounded-xl" style="border:1px dashed var(--border-strong);">
        <div class="text-[13px] text-muted">No campaigns yet. Create one above to start sending.</div>
      </div>`;

    document.getElementById('campaigns-body').innerHTML = `
      <h3 class="text-[15px] font-semibold mb-3">Create a campaign</h3>
      <div class="mb-6">${createCard}</div>
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
  function openModal(campaign) {
    const form = document.getElementById('campaign-form');
    form.reset();
    fillAudienceSelect();
    editingId = campaign ? campaign.id : null;
    document.getElementById('campaign-modal-title').textContent = campaign ? 'Edit campaign' : 'New campaign';
    document.getElementById('campaign-submit').textContent = campaign ? 'Save changes' : 'Create campaign';
    if (campaign) {
      form.elements['name'].value = campaign.name || '';
      form.elements['audience'].value = campaign.audience || 'all';
      form.elements['subject'].value = campaign.subject || '';
      form.elements['body'].value = campaign.body || '';
    } else {
      // New campaigns start with a personalized greeting, ready to edit.
      form.elements['body'].value = 'Hi {{first_name}},\n\n';
    }
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

    // Delegated: create card + send + edit + delete buttons (body re-renders).
    document.getElementById('campaigns-body').addEventListener('click', async e => {
      const createCard = e.target.closest('[data-create]');
      if (createCard) { openModal(null); return; }

      const send = e.target.closest('[data-send]');
      if (send && !send.disabled) { sendCampaign(send.getAttribute('data-send')); return; }

      const edit = e.target.closest('[data-edit]');
      if (edit) {
        const c = campaigns.find(x => String(x.id) === String(edit.getAttribute('data-edit')));
        if (c) openModal(c);
        return;
      }

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
      if (!data.subject.trim() || !data.body.trim()) {
        msg.textContent = 'Add a subject and message.'; return;
      }
      const btn = document.getElementById('campaign-submit');
      btn.disabled = true; btn.style.opacity = '0.7';
      const payload = { name: data.name, audience: data.audience, subject: data.subject, body: data.body };
      try {
        const res = await fetch(editingId ? '/api/campaigns/' + editingId : '/api/campaigns', {
          method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify(payload)
        });
        const raw = await res.text();
        let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (err) {}
        if (!res.ok) { msg.textContent = body.error || `Request failed (HTTP ${res.status}).`; return; }
        if (editingId) {
          const i = campaigns.findIndex(x => String(x.id) === String(editingId));
          if (i >= 0) campaigns[i] = body;
        } else {
          campaigns.unshift(body);
        }
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
