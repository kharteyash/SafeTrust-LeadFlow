// Campaigns page: create a campaign for a lead audience and send it (personalized)
// through the sender's own connected Gmail. Real per-user, Postgres-backed.
(function () {
  let campaigns = [];
  let audiences = [];   // [{ key, label, count }]

  let editingId = null;   // null = creating, otherwise the campaign being edited
  let tab = 'active';     // 'active' = ongoing, 'past' = Completed campaigns

  // Completed campaigns live in the Past tab so the active list stays uncluttered.
  function isPast(c) { return c.status === 'Completed'; }

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
      // Once a campaign has been sent (or is sending), it can't be sent again or edited.
      const locked = c.status === 'Sending' || c.status === 'Completed';
      const failedBadge = c.failed ? ` <span class="text-[11px]" style="color:#D63333;">(${c.failed} failed)</span>` : '';
      const sendBtn = locked ? '' : `
        <button data-send="${c.id}" class="btn-icon" title="Send campaign" style="width:30px;height:30px;border:none;">
          <i data-lucide="send" style="width:14px;height:14px;color:#2255a3;pointer-events:none;"></i>
        </button>`;
      const editBtn = locked ? '' : `
        <button data-edit="${c.id}" class="btn-icon" title="Edit campaign" style="width:30px;height:30px;border:none;">
          <i data-lucide="pencil" style="width:14px;height:14px;color:var(--text-muted);pointer-events:none;"></i>
        </button>`;
      const recurLabel = (d) => d === 7 ? 'Weekly' : d === 14 ? 'Every 2 weeks' : d === 30 ? 'Monthly' : d === 90 ? 'Quarterly' : d ? `Every ${d}d` : '';
      const recurBadge = c.recurDays ? ` <span class="pill pill-blue" style="font-size:10px;" title="${c.nextRun ? 'Next send ' + c.nextRun : ''}">🔁 ${recurLabel(c.recurDays)}</span>` : '';
      return `
        <tr>
          <td><span class="font-semibold" data-detail="${c.id}" style="cursor:pointer;color:var(--accent);">${esc(c.name)}</span>${recurBadge}</td>
          <td class="text-muted">${esc(c.audienceLabel || '—')}</td>
          <td class="text-muted">${LF.fmtNum(c.recipients)}</td>
          <td class="text-muted">${LF.fmtNum(c.sent)}${failedBadge}</td>
          <td><span class="pill ${LF.statusPill(c.status)}">${esc(c.status)}</span></td>
          <td>
            <div class="flex items-center gap-1">
              ${sendBtn}${editBtn}
              <button data-del="${c.id}" class="btn-icon" title="Delete campaign" style="width:30px;height:30px;border:none;">
                <i data-lucide="trash-2" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i>
              </button>
            </div>
          </td>
        </tr>`;
    };

    const activeCount = campaigns.filter(c => !isPast(c)).length;
    const pastCount = campaigns.filter(isPast).length;
    const shown = campaigns.filter(c => (tab === 'past') === isPast(c));

    const tabs = `
      <div class="flex items-center gap-5 flex-wrap mb-4" style="border-bottom:1px solid var(--border);">
        <div class="tab ${tab === 'active' ? 'active' : ''}" data-tab="active">Active${activeCount ? ` (${activeCount})` : ''}</div>
        <div class="tab ${tab === 'past' ? 'active' : ''}" data-tab="past">Past campaigns${pastCount ? ` (${pastCount})` : ''}</div>
      </div>`;

    const emptyMsg = tab === 'past'
      ? 'No past campaigns yet. Completed campaigns show up here.'
      : 'No active campaigns. Create one above to start sending.';
    const tracking = shown.length ? `
      <div class="overflow-x-auto rounded-xl" style="border:1px solid var(--border);">
        <table class="lf-table">
          <thead><tr><th>Campaign</th><th>Audience</th><th>Recipients</th><th>Sent</th><th>Status</th><th></th></tr></thead>
          <tbody>${shown.map(rowFor).join('')}</tbody>
        </table>
      </div>`
      : `
      <div class="text-center py-12 rounded-xl" style="border:1px dashed var(--border-strong);">
        <div class="text-[13px] text-muted">${emptyMsg}</div>
      </div>`;

    document.getElementById('campaigns-body').innerHTML = `
      <h3 class="text-[15px] font-semibold mb-3">Create a campaign</h3>
      <div class="mb-6">${createCard}</div>
      ${tabs}
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
      form.elements['note'].value = campaign.note || '';
      if (form.elements['recurDays']) form.elements['recurDays'].value = String(campaign.recurDays || 0);
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

  // ----- Detail modal (all details + the recipient list) -----
  function detailRow(label, val) {
    return `<div class="flex justify-between gap-4 py-2" style="border-bottom:1px solid var(--border-soft);">
      <span class="text-[12.5px] text-muted flex-shrink-0">${label}</span>
      <span class="text-[13px] font-medium text-right" style="word-break:break-word;">${val}</span>
    </div>`;
  }
  async function openDetail(id) {
    const c = campaigns.find(x => String(x.id) === String(id));
    if (!c) return;
    const sentRow = (c.status === 'Completed' || c.status === 'Sending')
      ? detailRow('Sent', `${LF.fmtNum(c.sent)}${c.failed ? ` · <span style="color:#D63333;">${c.failed} failed</span>` : ''}`) : '';
    const noteBlock = c.note
      ? `<div class="mt-3"><div class="text-[12.5px] text-muted mb-1">Note</div><div class="text-[13px]" style="white-space:pre-wrap;">${esc(c.note)}</div></div>` : '';
    document.getElementById('campaign-detail-body').innerHTML = `
      <div class="mb-3">
        <div class="text-[16px] font-bold mb-1">${esc(c.name)}</div>
        <span class="pill ${LF.statusPill(c.status)}" style="font-size:11px;">${esc(c.status)}</span>
      </div>
      ${detailRow('Audience', esc(c.audienceLabel || '—'))}
      ${sentRow}
      ${detailRow('Subject', esc(c.subject) || '—')}
      <div class="mt-3"><div class="text-[12.5px] text-muted mb-1">Message</div>
        <div class="text-[13px] rounded-lg p-3" style="white-space:pre-wrap;background:var(--surface-2);border:1px solid var(--border-soft);">${esc(c.body) || '—'}</div></div>
      ${noteBlock}
      <div class="mt-4">
        <div id="campaign-detail-rcount" class="text-[12.5px] text-muted mb-2">Recipients…</div>
        <div id="campaign-detail-recipients" class="text-[13px] text-muted">Loading…</div>
      </div>`;
    document.getElementById('campaign-detail-modal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();

    try {
      const res = await fetch('/api/campaigns/' + id + '/recipients', { credentials: 'same-origin' });
      const list = res.ok ? await res.json() : [];
      const head = document.getElementById('campaign-detail-rcount');
      const el = document.getElementById('campaign-detail-recipients');
      if (head) head.textContent = `Recipients (${LF.fmtNum(list.length)})`;
      if (!el) return;
      el.innerHTML = list.length ? `
        <div class="rounded-xl" style="border:1px solid var(--border);max-height:240px;overflow-y:auto;">
          ${list.map((r, i) => `
            <div class="flex items-center justify-between gap-3 px-3 py-2 ${i > 0 ? 'border-t' : ''}" style="border-color:var(--border-soft);">
              <span class="font-medium text-[13px] truncate">${esc(r.name) || '—'}</span>
              <span class="text-[12px] text-muted truncate">${esc(r.email)}</span>
            </div>`).join('')}
        </div>`
        : 'No recipients with an email in this audience.';
    } catch (e) {
      const el = document.getElementById('campaign-detail-recipients');
      if (el) el.innerHTML = '<span style="color:#D63333;">Could not load recipients.</span>';
    }
  }
  function closeDetail() { document.getElementById('campaign-detail-modal').classList.add('hidden'); }

  function bind() {
    document.getElementById('campaign-modal-close').addEventListener('click', closeModal);
    document.getElementById('campaign-cancel').addEventListener('click', closeModal);
    document.getElementById('campaign-modal-backdrop').addEventListener('click', closeModal);
    document.getElementById('campaign-detail-close').addEventListener('click', closeDetail);
    document.getElementById('campaign-detail-backdrop').addEventListener('click', closeDetail);

    // Delegated: name (detail) + create card + send + edit + delete (body re-renders).
    document.getElementById('campaigns-body').addEventListener('click', async e => {
      const tabEl = e.target.closest('[data-tab]');
      if (tabEl) { tab = tabEl.getAttribute('data-tab'); render(); return; }

      const detail = e.target.closest('[data-detail]');
      if (detail) { openDetail(detail.getAttribute('data-detail')); return; }

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
      const payload = { name: data.name, audience: data.audience, subject: data.subject, body: data.body, note: data.note || '', recurDays: Number(data.recurDays) || 0 };
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
