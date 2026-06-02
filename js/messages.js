// Messages page: Scheduled (real) + AI Assistant.
(function () {
  const TABS = [
    { id: 'scheduled', label: 'Scheduled' },
    { id: 'ai',        label: 'AI Assistant' }
  ];

  const state = {
    tab: 'scheduled',
    aiType: 'reply'     // AI assistant mode
  };

  let aiIndex = 0;

  // AI draft templates (used to generate suggestions client-side).
  const AI_SAMPLES = {
    reply: [
      'Thanks so much for reaching out! Yes, that property is still available. Would mornings or afternoons work better for a viewing this week?',
      'Great question — I’d be happy to send over the full details and comparable listings. What’s the best email to reach you at?',
      'Absolutely, I can help with that. Let me pull the latest numbers and get back to you within the hour.'
    ],
    followup: [
      'Hi {name}, just checking in to see if you had any other questions after our last chat. I’m holding a couple of viewing slots open if you’d like one.',
      'Hi {name}, following up on the listing we discussed — it’s getting a lot of interest, so let me know if you’d like to move forward.',
      'Hi {name}, wanted to make sure you got the info I sent. Happy to jump on a quick call whenever works for you.'
    ],
    personalized: [
      'Hi {name}, based on your interest in the area, I found a few new listings that match your budget and timeline. Want me to send them over?',
      'Hi {name}, since you mentioned a flexible move-in date, I think the next listing could be a great fit — it has the home office you wanted.',
      'Hi {name}, given your investment goals, here’s a property with strong rental yield in a high-growth neighborhood. Worth a closer look?'
    ]
  };

  // Working scheduled list = the user's saved messages (DB only).
  let schedUid = 0;
  function withSchedUid(s) { return Object.assign({ _uid: ++schedUid }, s); }
  let scheduled = [];

  function pad(n) { return String(n).padStart(2, '0'); }
  function parseLocalDate(str) { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); }
  function whenLabel(dateStr) {
    const d = parseLocalDate(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((d - today) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${M[d.getMonth()]} ${d.getDate()}`;
  }
  function timeLabel(hhmm) {
    let [h, m] = hhmm.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${pad(m)} ${ap}`;
  }
  // Normalize a DB record into the display shape used by renderScheduled.
  function fromDb(item) {
    return {
      id: item.id, to: item.to, channel: item.channel, type: item.type,
      when: whenLabel(item.date), time: timeLabel(item.time24),
      status: item.status || 'pending', error: item.error || ''
    };
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // Status chip shown next to a scheduled message (pending shows nothing extra —
  // the channel pill already implies "waiting to send").
  function statusChip(s, error) {
    if (s === 'sent')    return '<span class="pill pill-green" style="font-size:11px;">Sent</span>';
    if (s === 'failed')  return `<span class="pill pill-red" title="${escAttr(error)}" style="font-size:11px;">Failed</span>`;
    if (s === 'sending') return '<span class="pill pill-yellow" style="font-size:11px;">Sending…</span>';
    return '';
  }

  async function copyToClipboard(str) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(str);
        return;
      }
    } catch (e) { /* fall through to legacy path */ }
    // Fallback for non-secure contexts / older browsers.
    const ta = document.createElement('textarea');
    ta.value = str;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  function channelMeta(ch) {
    switch (ch) {
      case 'SMS':   return { icon: 'message-square', fg: '#2B57D9', bg: '#E7EEFF', pill: 'pill-blue' };
      case 'Email': return { icon: 'mail',           fg: '#2255a3', bg: '#EFEAFF', pill: 'pill-purple' };
      default:      return { icon: 'message-square', fg: '#5C5C75', bg: 'var(--chip)', pill: 'pill-gray' };
    }
  }

  // ----- Tabs -----
  function renderTabs() {
    document.getElementById('msg-tabs').innerHTML = TABS.map(t => `
      <div class="tab ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</div>
    `).join('');
    document.querySelectorAll('#msg-tabs .tab').forEach(el => {
      el.addEventListener('click', () => { state.tab = el.dataset.tab; render(); });
    });
  }

  // ----- Scheduled -----
  function renderScheduled() {
    // Group by `when`.
    const groups = {};
    scheduled.forEach(s => { (groups[s.when] = groups[s.when] || []).push(s); });

    const sections = scheduled.length ? Object.keys(groups).map(when => `
      <div class="mb-5">
        <h4 class="text-[13px] font-semibold text-muted mb-2">${when}</h4>
        <div class="rounded-xl" style="border:1px solid var(--border);">
          ${groups[when].map((s, i) => {
            const m = channelMeta(s.channel);
            return `
              <div class="flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t' : ''}" style="border-color:var(--border);">
                <span class="text-[13px] font-semibold w-[72px] flex-shrink-0">${s.time}</span>
                <span class="stat-icon" style="background:${m.bg};width:30px;height:30px;border-radius:8px;flex-shrink:0;">
                  <i data-lucide="${m.icon}" style="width:14px;height:14px;color:${m.fg};"></i>
                </span>
                <div class="flex-1 min-w-0 text-[13.5px]">
                  <span class="font-medium">${esc(s.type)}</span>
                  <span class="text-muted"> to ${esc(s.to)}</span>
                </div>
                <span class="pill ${m.pill}">${s.channel}</span>
                ${statusChip(s.status, s.error)}
                ${(s.channel === 'Email' && s.status !== 'sent' && s.status !== 'sending') ? `
                <button class="btn-icon" title="Send now" data-send-uid="${s._uid}" style="width:30px;height:30px;">
                  <i data-lucide="send" style="width:13px;height:13px;color:#138A4B;pointer-events:none;"></i>
                </button>` : ''}
                <button class="btn-icon" title="Remove" data-remove-uid="${s._uid}" style="width:30px;height:30px;border:none;">
                  <i data-lucide="x" style="width:14px;height:14px;color:#8A8AA0;pointer-events:none;"></i>
                </button>
              </div>`;
          }).join('')}
        </div>
      </div>`).join('')
      : `<div class="text-center py-12 text-muted text-[13px]">No messages scheduled. Click “New message” to add one.</div>`;

    document.getElementById('msg-body').innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-[15px] font-semibold">Messages waiting to send</h3>
        <span class="text-[12.5px] text-muted">${scheduled.length} scheduled</span>
      </div>
      ${sections}`;
  }

  // ----- AI Assistant -----
  function renderAI() {
    const types = [
      { id: 'reply',        label: 'Replies',          icon: 'reply' },
      { id: 'followup',     label: 'Follow-up',        icon: 'repeat' },
      { id: 'personalized', label: 'Personalized',     icon: 'sparkles' }
    ];
    const chips = types.map(t => `
      <button class="settings-tab ${state.aiType === t.id ? 'active' : ''}" data-ai="${t.id}" style="border:1px solid var(--border);">
        <i data-lucide="${t.icon}"></i><span>${t.label}</span>
      </button>`).join('');

    document.getElementById('msg-body').innerHTML = `
      <div class="max-w-[760px]">
        <div class="flex items-center gap-2 mb-4">
          <span class="stat-icon" style="background:#EFEAFF;width:34px;height:34px;">
            <i data-lucide="sparkles" style="width:17px;height:17px;color:#2255a3;"></i>
          </span>
          <div>
            <h3 class="text-[15px] font-semibold">AI Assistant</h3>
            <p class="text-[12.5px] text-muted">Generate replies, follow-ups, and personalized content.</p>
          </div>
        </div>

        <label class="text-[12px] font-semibold text-muted">What should I generate?</label>
        <div class="flex flex-wrap gap-2 mt-1 mb-4">${chips}</div>

        <label class="text-[12px] font-semibold text-muted">Context (optional)</label>
        <input id="ai-context" class="input mt-1 mb-4" placeholder="e.g. Michael, interested in Bay St, budget $750k" />

        <button id="ai-generate" class="btn-primary"><i data-lucide="sparkles" style="width:14px;height:14px;"></i> Generate</button>

        <div id="ai-output" class="mt-5"></div>
      </div>`;

    document.querySelectorAll('[data-ai]').forEach(el => {
      el.addEventListener('click', () => { state.aiType = el.dataset.ai; renderAI(); });
    });
    document.getElementById('ai-generate').addEventListener('click', () => {
      const ctx = document.getElementById('ai-context').value.trim();
      const name = ctx ? ctx.split(/[ ,]/)[0] : 'there';
      const samples = AI_SAMPLES[state.aiType];
      const text = samples[aiIndex % samples.length].replace(/\{name\}/g, name);
      aiIndex++;
      document.getElementById('ai-output').innerHTML = `
        <div class="rounded-xl p-4" style="border:1px solid var(--border);background:var(--surface-2);">
          <div class="flex items-center gap-2 mb-2 text-[12px] font-semibold" style="color:#2255a3;">
            <i data-lucide="sparkles" style="width:13px;height:13px;"></i> AI suggestion
          </div>
          <p class="text-[13.5px] leading-relaxed">${esc(text)}</p>
          <div class="mt-3 flex items-center gap-2">
            <button id="ai-copy" class="btn-secondary" style="padding:6px 12px;font-size:12.5px;"><i data-lucide="copy" style="width:13px;height:13px;"></i> Copy</button>
            <button class="btn-secondary" style="padding:6px 12px;font-size:12.5px;" onclick="document.getElementById('ai-generate').click()">
              <i data-lucide="refresh-cw" style="width:13px;height:13px;"></i> Regenerate
            </button>
          </div>
        </div>`;
      if (window.lucide) lucide.createIcons();

      const copyBtn = document.getElementById('ai-copy');
      copyBtn.addEventListener('click', async () => {
        await copyToClipboard(text);
        copyBtn.innerHTML = '<i data-lucide="check" style="width:13px;height:13px;"></i> Copied';
        if (window.lucide) lucide.createIcons();
        setTimeout(() => {
          copyBtn.innerHTML = '<i data-lucide="copy" style="width:13px;height:13px;"></i> Copy';
          if (window.lucide) lucide.createIcons();
        }, 1500);
      });
    });
  }

  // ----- Dispatcher -----
  function render() {
    renderTabs();
    if (state.tab === 'scheduled') renderScheduled();
    else                           renderAI();
    if (window.lucide) lucide.createIcons();
  }

  // ----- Load the user's saved scheduled messages from the DB -----
  async function loadScheduled() {
    try {
      const res = await fetch('/api/scheduled', { credentials: 'same-origin' });
      if (res.ok) {
        const saved = await res.json();
        scheduled = saved.map(fromDb).map(withSchedUid);
      }
    } catch (e) { scheduled = []; }
  }

  // ----- New message modal -----
  function openMsgModal() {
    const form = document.getElementById('msg-form');
    form.reset();
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    form.elements['date'].value = todayStr;
    form.elements['date'].min = todayStr;
    form.elements['time'].value = '09:00';
    form.elements['channel'].value = 'Email';
    document.getElementById('msg-form-msg').textContent = '';
    document.getElementById('msg-modal').classList.remove('hidden');
    form.elements['recipient'].focus();
  }
  function closeMsgModal() { document.getElementById('msg-modal').classList.add('hidden'); }

  function bindCompose() {
    document.getElementById('new-msg-btn').addEventListener('click', openMsgModal);
    document.getElementById('msg-modal-close').addEventListener('click', closeMsgModal);
    document.getElementById('msg-cancel').addEventListener('click', closeMsgModal);
    document.getElementById('msg-modal-backdrop').addEventListener('click', closeMsgModal);

    const form = document.getElementById('msg-form');
    const msg = document.getElementById('msg-form-msg');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = '';
      const data = Object.fromEntries(new FormData(form));
      if (!data.recipient.trim()) { msg.textContent = 'Recipient is required.'; return; }
      if (!data.type.trim())      { msg.textContent = 'Subject / type is required.'; return; }
      // Email auto-send needs a real email address in the "To" field.
      if (data.channel === 'Email' && !/^\S+@\S+\.\S+$/.test(data.recipient.trim())) {
        msg.textContent = "Enter the recipient's email address (e.g. name@example.com) for an email.";
        return;
      }

      // Convert the chosen local date+time into a precise UTC instant so the
      // server can send it at the right moment regardless of timezone.
      let sendAt = '';
      if (data.date && data.time) {
        const [yy, mm, dd] = data.date.split('-').map(Number);
        const [hh, mi] = data.time.split(':').map(Number);
        const dt = new Date(yy, mm - 1, dd, hh, mi);
        if (!isNaN(dt.getTime())) sendAt = dt.toISOString();
      }

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.style.opacity = '0.7';
      try {
        const res = await fetch('/api/scheduled', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({
            recipient: data.recipient, channel: data.channel, type: data.type,
            date: data.date, time: data.time, sendAt, body: data.body || ''
          })
        });
        const raw = await res.text();
        let body = {};
        try { body = raw ? JSON.parse(raw) : {}; } catch (err) { /* non-JSON */ }
        if (!res.ok) { msg.textContent = body.error || `Request failed (HTTP ${res.status}).`; return; }

        scheduled.push(withSchedUid(fromDb(body)));
        closeMsgModal();
        state.tab = 'scheduled';
        render();
      } catch (err) {
        msg.textContent = 'Network error. Is the server running?';
      } finally {
        btn.disabled = false; btn.style.opacity = '';
      }
    });
  }

  // ----- Remove a scheduled message -----
  async function removeScheduled(uid) {
    const idx = scheduled.findIndex(s => String(s._uid) === String(uid));
    if (idx === -1) return;
    const item = scheduled[idx];
    if (item.id) {
      try {
        const res = await fetch('/api/scheduled/' + item.id, { method: 'DELETE', credentials: 'same-origin' });
        if (!res.ok && res.status !== 404) { window.alert('Could not remove the message. Please try again.'); return; }
      } catch (e) { window.alert('Network error while removing the message.'); return; }
    }
    scheduled.splice(idx, 1);
    render();
  }
  // ----- Send a scheduled email immediately -----
  async function sendNow(uid) {
    const item = scheduled.find(s => String(s._uid) === String(uid));
    if (!item || !item.id) return;
    if (!window.confirm(`Send this email to ${item.to} now?`)) return;
    item.status = 'sending'; render();
    try {
      const res = await fetch('/api/scheduled/' + item.id + '/send', { method: 'POST', credentials: 'same-origin' });
      const raw = await res.text();
      let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (e) {}
      if (!res.ok) {
        item.status = body.status || 'failed';
        item.error = body.error || '';
        render();
        window.alert(body.error || `Could not send (HTTP ${res.status}).`);
        return;
      }
      item.status = 'sent';
      render();
    } catch (e) {
      item.status = 'failed';
      render();
      window.alert('Network error. Is the server running?');
    }
  }

  function bindRemove() {
    // Delegated — survives #msg-body re-renders.
    document.getElementById('msg-body').addEventListener('click', (e) => {
      const sendBtn = e.target.closest('[data-send-uid]');
      if (sendBtn) { sendNow(sendBtn.getAttribute('data-send-uid')); return; }
      const btn = e.target.closest('[data-remove-uid]');
      if (btn) removeScheduled(btn.getAttribute('data-remove-uid'));
    });
  }

  // ----- Mount -----
  document.addEventListener('DOMContentLoaded', async function () {
    await LF.renderLayout({ active: 'messages' });
    await loadScheduled();
    bindCompose();
    bindRemove();
    render();
  });
})();
