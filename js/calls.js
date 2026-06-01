// Calls page: High Priority, Call Queue, Call History, Analytics.
// Everything is from real per-user data (Postgres): queue, logged calls, leads.
(function () {
  const TABS = [
    { id: 'priority', label: 'High Priority' },
    { id: 'queue',    label: 'Call Queue' },
    { id: 'history',  label: 'Call History' },
    { id: 'analytics',label: 'Analytics' }
  ];

  const state = { tab: 'priority', historyQuery: '' };

  let callQueue = [];
  let callHistory = [];
  let leads = [];
  let pendingQueueId = null; // queue item being logged, if any

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function initials(name) { return (name || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?'; }

  function priorityPill(p) { return p === 'High' ? 'pill-red' : p === 'Medium' ? 'pill-yellow' : 'pill-gray'; }
  function outcomePill(o) { return o === 'Connected' ? 'pill-green' : o === 'Voicemail' ? 'pill-yellow' : o === 'Missed' ? 'pill-red' : 'pill-gray'; }
  function scorePill(s) { return s >= 80 ? 'pill-green' : s >= 60 ? 'pill-yellow' : 'pill-red'; }

  function waLink(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.length === 10) d = '1' + d;
    return 'https://wa.me/' + d;
  }

  // ----- Load all data -----
  async function loadAll() {
    const get = async (url) => { try { const r = await fetch(url, { credentials: 'same-origin' }); return r.ok ? await r.json() : []; } catch (e) { return []; } };
    [callQueue, callHistory, leads] = await Promise.all([
      get('/api/call-queue'), get('/api/call-log'), get('/api/leads')
    ]);
  }

  // ----- Tabs -----
  function renderTabs() {
    document.getElementById('calls-tabs').innerHTML = TABS.map(t =>
      `<div class="tab ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</div>`
    ).join('');
    document.querySelectorAll('#calls-tabs .tab').forEach(el => {
      el.addEventListener('click', () => { state.tab = el.dataset.tab; render(); });
    });
  }

  // A WhatsApp + log trigger button.
  function logBtn(name, phone, queueId) {
    return `<button class="btn-icon" title="Call or text on WhatsApp"
      data-log-name="${escAttr(name)}" data-log-phone="${escAttr(phone || '')}"
      ${queueId != null ? `data-log-queue="${queueId}"` : ''} style="width:32px;height:32px;">
      <i data-lucide="message-circle" style="width:14px;height:14px;color:#138A4B;pointer-events:none;"></i>
    </button>`;
  }

  // ----- High Priority (derived from leads + call history) -----
  function emptyCardBody(msg) {
    return `<div class="text-[12.5px] text-soft py-4 text-center">${msg}</div>`;
  }
  function personRow(name, phone, rightHTML) {
    return `
      <div class="flex items-center gap-3 py-2.5" style="border-bottom:1px solid var(--border-soft);">
        <div class="avatar">${initials(name)}</div>
        <div class="flex-1 min-w-0">
          <div class="text-[13.5px] font-semibold truncate">${esc(name)}</div>
          <div class="text-[12px] text-muted">${esc(phone) || '—'}</div>
        </div>
        ${rightHTML || ''}
        ${logBtn(name, phone, null)}
      </div>`;
  }
  function priorityCard(title, icon, tint, color, bodyHTML, count) {
    return `
      <div class="col-span-12 md:col-span-6 panel p-5" style="box-shadow:none;">
        <div class="flex items-center gap-2 mb-3">
          <span class="stat-icon" style="background:${tint};width:32px;height:32px;border-radius:9px;">
            <i data-lucide="${icon}" style="width:16px;height:16px;color:${color};"></i>
          </span>
          <h3 class="text-[14.5px] font-semibold">${title}</h3>
          <span class="pill pill-gray" style="font-size:11px;">${count}</span>
        </div>
        ${bodyHTML}
      </div>`;
  }

  function renderPriority() {
    const calledNames = new Set(callHistory.map(c => (c.name || '').toLowerCase()));
    const notContacted = leads.filter(l => !calledNames.has((l.name || '').toLowerCase())).slice(0, 5);
    const hotLeads = leads.filter(l => l.score >= 80).sort((a, b) => b.score - a.score).slice(0, 5);
    const missed = callHistory.filter(c => c.outcome === 'Missed').slice(0, 5);

    // AI-style recommendations derived from the data above.
    const recs = [];
    if (hotLeads[0]) recs.push({ text: `Call ${hotLeads[0].name} now — lead score ${hotLeads[0].score}.`, meta: 'High intent' });
    if (missed[0]) recs.push({ text: `Retry ${missed[0].name} — last call was missed.`, meta: 'Missed callback' });
    if (notContacted[0]) recs.push({ text: `Reach out to ${notContacted[0].name} — no call logged yet.`, meta: 'New lead' });

    const notContactedBody = notContacted.length
      ? notContacted.map(l => personRow(l.name, l.phone, `<span class="pill ${scorePill(l.score)} mr-1" style="font-size:11px;">${l.score}</span>`)).join('')
      : emptyCardBody('All your leads have been contacted.');
    const hotBody = hotLeads.length
      ? hotLeads.map(l => personRow(l.name, l.phone, `<span class="pill pill-green mr-1" style="font-size:11px;">${l.score}</span>`)).join('')
      : emptyCardBody('No hot leads yet (score 80+).');
    const missedBody = missed.length
      ? missed.map(c => personRow(c.name, c.phone, `<span class="text-[11.5px] mr-1" style="color:#D63333;">${esc(c.date)}</span>`)).join('')
      : emptyCardBody('No missed calls.');
    const aiBody = recs.length
      ? recs.map(r => `
        <div class="flex items-start gap-3 py-2.5" style="border-bottom:1px solid var(--border-soft);">
          <span class="stat-icon" style="background:#EFEAFF;width:30px;height:30px;border-radius:8px;flex-shrink:0;">
            <i data-lucide="sparkles" style="width:15px;height:15px;color:#6D5BFF;"></i>
          </span>
          <div class="flex-1 min-w-0">
            <div class="text-[13px] font-medium">${esc(r.text)}</div>
            <div class="text-[11.5px] text-soft mt-0.5">${r.meta}</div>
          </div>
        </div>`).join('')
      : emptyCardBody('Add leads and log calls to get recommendations.');

    document.getElementById('calls-body').innerHTML = `
      <div class="grid grid-cols-12 gap-5">
        ${priorityCard('Not contacted yet', 'clock', '#FFF4D6', '#B07A00', notContactedBody, notContacted.length)}
        ${priorityCard('Hot leads', 'flame', '#FEECEC', '#D63333', hotBody, hotLeads.length)}
        ${priorityCard('Missed callbacks', 'phone-missed', '#FEECEC', '#D63333', missedBody, missed.length)}
        ${priorityCard('AI recommendations', 'sparkles', '#EFEAFF', '#6D5BFF', aiBody, recs.length)}
      </div>`;
  }

  // ----- Call Queue (real) -----
  // Parse a "9:30 AM" label to minutes since midnight; no/invalid time sorts last.
  function queueTimeMinutes(label) {
    const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(label || '');
    if (!m) return Infinity;
    let h = parseInt(m[1], 10) % 12;
    if (/PM/i.test(m[3])) h += 12;
    return h * 60 + parseInt(m[2], 10);
  }
  function renderQueue() {
    // Earliest call at the top; untimed entries fall to the bottom.
    const sorted = callQueue.slice().sort((a, b) => queueTimeMinutes(a.time) - queueTimeMinutes(b.time));
    const rows = sorted.length ? sorted.map(c => `
      <tr>
        <td>
          <div class="flex items-center gap-2">
            <div class="avatar avatar-sm">${initials(c.name)}</div>
            <span class="font-semibold text-[13px]">${esc(c.name)}</span>
          </div>
        </td>
        <td class="text-muted">${esc(c.time) || '—'}</td>
        <td><span class="pill ${priorityPill(c.priority)}">${esc(c.priority)}</span></td>
        <td class="text-muted">${esc(c.reason) || '—'}</td>
        <td>
          <div class="flex items-center gap-1">
            ${logBtn(c.name, c.phone, c.id)}
            <button data-del-queue="${c.id}" class="btn-icon" title="Remove from queue" style="width:30px;height:30px;border:none;">
              <i data-lucide="x" style="width:14px;height:14px;color:#8A8AA0;pointer-events:none;"></i>
            </button>
          </div>
        </td>
      </tr>`).join('')
      : `<tr><td colspan="5" class="text-center py-10 text-muted text-[13px]">Queue is empty. Add someone to call.</td></tr>`;

    document.getElementById('calls-body').innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-[15px] font-semibold">Today's calls <span class="text-muted font-normal">(${callQueue.length})</span></h3>
        <button id="add-queue-btn" class="btn-primary" style="padding:7px 14px;font-size:12.5px;">
          <i data-lucide="plus" style="width:14px;height:14px;"></i> Add to queue
        </button>
      </div>
      <div class="rounded-xl overflow-hidden" style="border:1px solid var(--border);">
        <table class="lf-table">
          <thead><tr><th>Name</th><th>Time</th><th>Priority</th><th>Reason</th><th>Action</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    document.getElementById('add-queue-btn').addEventListener('click', openQueueModal);
  }

  // ----- Call History (real) -----
  function historyRowsHTML(list) {
    if (!list.length) return `<tr><td colspan="6" class="text-center py-8 text-muted">No calls match.</td></tr>`;
    return list.map(c => `
      <tr>
        <td>
          <div class="flex items-center gap-2">
            <i data-lucide="${c.direction === 'inbound' ? 'phone-incoming' : 'phone-outgoing'}"
               style="width:14px;height:14px;color:${c.direction === 'inbound' ? '#2B57D9' : '#138A4B'};"></i>
            <span class="font-semibold text-[13px]">${esc(c.name)}</span>
          </div>
        </td>
        <td class="text-muted">${esc(c.date)}</td>
        <td class="text-muted">${esc(c.duration)}</td>
        <td><span class="pill ${outcomePill(c.outcome)}">${esc(c.outcome)}</span></td>
        <td class="text-muted">${esc(c.notes)}</td>
        <td>
          <div class="flex items-center gap-2">
            <div class="avatar avatar-sm">${initials(c.agent)}</div>
            <span class="text-[13px]">${esc(c.agent)}</span>
          </div>
        </td>
      </tr>`).join('');
  }
  function filteredHistory() {
    const term = state.historyQuery.trim().toLowerCase();
    return term ? callHistory.filter(c => (c.name || '').toLowerCase().includes(term)) : callHistory;
  }
  function renderHistory() {
    const list = filteredHistory();
    if (callHistory.length === 0) {
      document.getElementById('calls-body').innerHTML = `
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-[15px] font-semibold">Call history</h3>
          <button data-log-new class="btn-secondary" style="padding:6px 12px;font-size:12.5px;"><i data-lucide="phone-call" style="width:13px;height:13px;pointer-events:none;"></i> Log call</button>
        </div>
        <div class="text-center py-16">
          <div class="mx-auto mb-3 stat-icon" style="background:var(--surface-3);width:48px;height:48px;border-radius:12px;">
            <i data-lucide="phone" style="width:22px;height:22px;color:#8A8AA0;"></i>
          </div>
          <div class="text-[14px] font-semibold mb-1">No calls logged yet</div>
          <div class="text-[13px] text-muted">Log a call from the queue or with the “Log call” button.</div>
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }
    document.getElementById('calls-body').innerHTML = `
      <div class="flex items-center justify-between mb-3 flex-wrap gap-3">
        <h3 class="text-[15px] font-semibold">Call history</h3>
        <div class="flex items-center gap-3">
          <div class="relative">
            <i data-lucide="search" style="width:14px;height:14px;color:#8A8AA0;position:absolute;left:12px;top:50%;transform:translateY(-50%);"></i>
            <input id="history-search" class="input pl-9" style="padding-top:7px;padding-bottom:7px;font-size:12.5px;width:220px;" placeholder="Search contact..." value="${escAttr(state.historyQuery)}" />
          </div>
          <span id="history-count" class="text-[12.5px] text-muted">${list.length} calls</span>
          <button data-log-new class="btn-secondary" style="padding:6px 12px;font-size:12.5px;"><i data-lucide="phone-call" style="width:13px;height:13px;pointer-events:none;"></i> Log call</button>
        </div>
      </div>
      <div class="overflow-x-auto rounded-xl" style="border:1px solid var(--border);">
        <table class="lf-table">
          <thead><tr><th>Contact</th><th>Date</th><th>Duration</th><th>Outcome</th><th>Notes</th><th>Agent</th></tr></thead>
          <tbody id="history-tbody">${historyRowsHTML(list)}</tbody>
        </table>
      </div>`;
    const input = document.getElementById('history-search');
    input.addEventListener('input', e => {
      state.historyQuery = e.target.value;
      const f = filteredHistory();
      document.getElementById('history-tbody').innerHTML = historyRowsHTML(f);
      document.getElementById('history-count').textContent = `${f.length} calls`;
      if (window.lucide) lucide.createIcons();
    });
  }

  // ----- Analytics (derived from call history) -----
  function durToSec(d) { const m = /(\d+):(\d+)/.exec(d || ''); return m ? +m[1] * 60 + +m[2] : 0; }
  function secToDur(s) { return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`; }
  function hourFromLogged(s) {
    const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(s || '');
    if (!m) return null;
    let h = parseInt(m[1], 10) % 12;
    if (/PM/i.test(m[3])) h += 12;
    return h;
  }
  function windowFor(h) {
    if (h < 8) return 'Before 8 AM';
    if (h < 10) return '8–10 AM';
    if (h < 12) return '10 AM–12 PM';
    if (h < 14) return '12–2 PM';
    if (h < 16) return '2–4 PM';
    if (h < 18) return '4–6 PM';
    return 'After 6 PM';
  }

  function renderAnalytics() {
    const total = callHistory.length;
    if (total === 0) {
      document.getElementById('calls-body').innerHTML = `
        <div class="text-center py-16">
          <div class="mx-auto mb-3 stat-icon" style="background:var(--surface-3);width:48px;height:48px;border-radius:12px;">
            <i data-lucide="bar-chart-3" style="width:22px;height:22px;color:#8A8AA0;"></i>
          </div>
          <div class="text-[14px] font-semibold mb-1">No call data yet</div>
          <div class="text-[13px] text-muted">Log some calls to see connect rates and best contact times.</div>
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const connected = callHistory.filter(c => c.outcome === 'Connected').length;
    const connectRate = Math.round((connected / total) * 100);
    const durations = callHistory.map(c => durToSec(c.duration)).filter(s => s > 0);
    const avgDur = durations.length ? secToDur(durations.reduce((a, b) => a + b, 0) / durations.length) : '0:00';

    const buckets = {};
    callHistory.forEach(c => {
      const h = hourFromLogged(c.date);
      if (h == null) return;
      const w = windowFor(h);
      buckets[w] = buckets[w] || { total: 0, connected: 0 };
      buckets[w].total++;
      if (c.outcome === 'Connected') buckets[w].connected++;
    });
    const windows = Object.keys(buckets)
      .map(w => ({ window: w, rate: Math.round((buckets[w].connected / buckets[w].total) * 100), total: buckets[w].total }))
      .sort((a, b) => b.rate - a.rate);

    const cards = [
      { label: 'Total calls',   value: total,             icon: 'phone',      tint: '#EFEAFF', color: '#6D5BFF' },
      { label: 'Connect rate',  value: connectRate + '%', icon: 'phone-call', tint: '#E6F8EC', color: '#138A4B' },
      { label: 'Avg. duration', value: avgDur,            icon: 'timer',      tint: '#E7EEFF', color: '#2B57D9' },
      { label: 'Missed',        value: callHistory.filter(c => c.outcome === 'Missed').length, icon: 'phone-missed', tint: '#FEECEC', color: '#D63333' }
    ].map(c => `
      <div class="stat-card col-span-6 md:col-span-3">
        <div class="flex items-center gap-3 mb-3">
          <div class="stat-icon" style="background:${c.tint};"><i data-lucide="${c.icon}" style="width:18px;height:18px;color:${c.color};"></i></div>
          <span class="text-[13px] text-muted font-medium">${c.label}</span>
        </div>
        <div class="text-[26px] font-bold tracking-tight leading-tight">${c.value}</div>
      </div>`).join('');

    const bars = windows.length ? windows.map(t => `
      <div class="mb-3">
        <div class="flex items-center justify-between text-[12.5px] mb-1">
          <span class="font-medium">${t.window}</span>
          <span class="text-muted">${t.rate}% connect · ${t.total} call${t.total === 1 ? '' : 's'}</span>
        </div>
        <div class="rounded-full" style="height:8px;background:var(--chip);">
          <div class="rounded-full" style="height:8px;width:${t.rate}%;background:#6D5BFF;"></div>
        </div>
      </div>`).join('') : `<div class="text-[12.5px] text-muted">Not enough data yet.</div>`;

    document.getElementById('calls-body').innerHTML = `
      <div class="grid grid-cols-12 gap-4 mb-6">${cards}</div>
      <div class="panel p-5" style="box-shadow:none;">
        <h3 class="text-[14.5px] font-semibold mb-1">Best contact times</h3>
        <p class="text-[12.5px] text-muted mb-4">Connect rate by time window, from your logged calls.</p>
        ${bars}
      </div>`;
  }

  // ----- Log call modal -----
  function openLogModal(prefill, queueId) {
    pendingQueueId = queueId != null ? queueId : null;
    const form = document.getElementById('log-form');
    form.reset();
    form.elements['name'].value = (prefill && prefill.name) || '';
    form.elements['phone'].value = (prefill && prefill.phone) || '';
    form.elements['outcome'].value = 'Connected';
    form.elements['duration'].value = '0:00';
    document.getElementById('log-form-msg').textContent = '';
    document.getElementById('log-modal').classList.remove('hidden');
    form.elements[prefill ? 'outcome' : 'name'].focus();
  }
  function closeLogModal() { document.getElementById('log-modal').classList.add('hidden'); pendingQueueId = null; }

  // ----- Add to queue modal -----
  function openQueueModal() {
    const form = document.getElementById('queue-form');
    form.reset();
    form.elements['priority'].value = 'Medium';
    document.getElementById('queue-form-msg').textContent = '';
    document.getElementById('queue-modal').classList.remove('hidden');
    form.elements['name'].focus();
  }
  function closeQueueModal() { document.getElementById('queue-modal').classList.add('hidden'); }

  function bind() {
    // Log modal controls
    document.getElementById('log-modal-close').addEventListener('click', closeLogModal);
    document.getElementById('log-cancel').addEventListener('click', closeLogModal);
    document.getElementById('log-modal-backdrop').addEventListener('click', closeLogModal);
    // Queue modal controls
    document.getElementById('queue-modal-close').addEventListener('click', closeQueueModal);
    document.getElementById('queue-cancel').addEventListener('click', closeQueueModal);
    document.getElementById('queue-modal-backdrop').addEventListener('click', closeQueueModal);

    // Delegated clicks inside the body (log triggers, log-new, queue removal).
    document.getElementById('calls-body').addEventListener('click', async e => {
      const newBtn = e.target.closest('[data-log-new]');
      if (newBtn) { openLogModal(null, null); return; }

      const trigger = e.target.closest('[data-log-name]');
      if (trigger) {
        const phone = trigger.getAttribute('data-log-phone');
        if (phone) window.open(waLink(phone), '_blank');
        openLogModal({ name: trigger.getAttribute('data-log-name'), phone }, trigger.getAttribute('data-log-queue'));
        return;
      }

      const delQ = e.target.closest('[data-del-queue]');
      if (delQ) {
        const id = delQ.getAttribute('data-del-queue');
        try {
          const res = await fetch('/api/call-queue/' + id, { method: 'DELETE', credentials: 'same-origin' });
          if (!res.ok && res.status !== 404) { window.alert('Could not remove from queue.'); return; }
        } catch (err) { window.alert('Network error.'); return; }
        callQueue = callQueue.filter(c => String(c.id) !== String(id));
        render();
      }
    });

    // Log form submit
    const logForm = document.getElementById('log-form');
    const logMsg = document.getElementById('log-form-msg');
    logForm.addEventListener('submit', async e => {
      e.preventDefault();
      logMsg.textContent = '';
      const data = Object.fromEntries(new FormData(logForm));
      if (!data.name.trim()) { logMsg.textContent = 'Contact name is required.'; return; }
      const btn = logForm.querySelector('button[type="submit"]');
      btn.disabled = true; btn.style.opacity = '0.7';
      try {
        const res = await fetch('/api/call-log', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ name: data.name, phone: data.phone || '', outcome: data.outcome, duration: data.duration || '0:00', notes: data.notes || '' })
        });
        const raw = await res.text();
        let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (err) {}
        if (!res.ok) { logMsg.textContent = body.error || `Request failed (HTTP ${res.status}).`; return; }

        callHistory.unshift(body);
        // If logged from the queue, remove that queue item (server-side too).
        if (pendingQueueId != null) {
          const qid = pendingQueueId;
          try { await fetch('/api/call-queue/' + qid, { method: 'DELETE', credentials: 'same-origin' }); } catch (e) {}
          callQueue = callQueue.filter(c => String(c.id) !== String(qid));
        }
        closeLogModal();
        state.tab = 'history';
        render();
      } catch (err) {
        logMsg.textContent = 'Network error. Is the server running?';
      } finally {
        btn.disabled = false; btn.style.opacity = '';
      }
    });

    // Queue form submit
    const queueForm = document.getElementById('queue-form');
    const queueMsg = document.getElementById('queue-form-msg');
    queueForm.addEventListener('submit', async e => {
      e.preventDefault();
      queueMsg.textContent = '';
      const data = Object.fromEntries(new FormData(queueForm));
      if (!data.name.trim()) { queueMsg.textContent = 'Name is required.'; return; }
      // Show the time in 12-hour format if provided.
      let timeLabel = '';
      if (data.time) {
        const [h, m] = data.time.split(':').map(Number);
        const ap = h >= 12 ? 'PM' : 'AM';
        timeLabel = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
      }
      const btn = queueForm.querySelector('button[type="submit"]');
      btn.disabled = true; btn.style.opacity = '0.7';
      try {
        const res = await fetch('/api/call-queue', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ name: data.name, phone: data.phone || '', priority: data.priority, time: timeLabel, reason: data.reason || '' })
        });
        const raw = await res.text();
        let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (err) {}
        if (!res.ok) { queueMsg.textContent = body.error || `Request failed (HTTP ${res.status}).`; return; }
        callQueue.unshift(body);
        closeQueueModal();
        render();
      } catch (err) {
        queueMsg.textContent = 'Network error. Is the server running?';
      } finally {
        btn.disabled = false; btn.style.opacity = '';
      }
    });
  }

  // ----- Dispatcher -----
  function render() {
    renderTabs();
    if (state.tab === 'priority')       renderPriority();
    else if (state.tab === 'queue')     renderQueue();
    else if (state.tab === 'history')   renderHistory();
    else                                renderAnalytics();
    if (window.lucide) lucide.createIcons();
  }

  // ----- Mount -----
  document.addEventListener('DOMContentLoaded', async function () {
    await LF.renderLayout({ active: 'calls' });
    await loadAll();
    bind();
    render();
  });
})();
