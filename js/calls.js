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
  let reschedulingId = null; // queue item being rescheduled, if any

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function initials(name) { return (name || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?'; }

  function priorityPill(p) { return p === 'High' ? 'pill-red' : p === 'Medium' ? 'pill-yellow' : 'pill-gray'; }
  function isNoAnswer(o) { return o === 'No Answer' || o === 'Missed'; }
  function outcomePill(o) { return o === 'Connected' ? 'pill-green' : o === 'Voicemail' ? 'pill-yellow' : isNoAnswer(o) ? 'pill-red' : 'pill-gray'; }
  function scorePill(s) { return s >= 80 ? 'pill-green' : s >= 60 ? 'pill-yellow' : 'pill-red'; }

  function waLink(phone) { return LF.waLink(phone); }

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

  // A tel: dial button (opens the device dialer, then the log-call modal).
  function callBtn(name, phone, queueId, size) {
    size = size || 32;
    return `<button class="btn-icon" title="Call"
      data-call="${escAttr(phone || '')}" data-call-name="${escAttr(name || '')}"
      ${queueId != null ? `data-call-queue="${queueId}"` : ''}
      style="width:${size}px;height:${size}px;" ${phone ? '' : 'disabled'}>
      <i data-lucide="phone" style="width:14px;height:14px;color:#2255a3;pointer-events:none;"></i>
    </button>`;
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
        ${callBtn(name, phone, null)}
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
    // Only the user's own leads belong on their calling list. For the admin this
    // hides every other rep's leads (call queue/history are already per-user); for
    // a regular user every lead is theirs, so nothing changes.
    const myLeads = leads.filter(l => l.mine);
    const notContacted = myLeads.filter(l => !calledNames.has((l.name || '').toLowerCase())).slice(0, 5);
    const hotLeads = myLeads.filter(l => LF.scoreStars(l.score) === 5).sort((a, b) => b.score - a.score).slice(0, 5);
    const missed = callHistory.filter(c => isNoAnswer(c.outcome)).slice(0, 5);

    // AI-style recommendations derived from the data above.
    const recs = [];
    if (hotLeads[0]) recs.push({ text: `Call ${hotLeads[0].name} now — lead score ${LF.scoreStars(hotLeads[0].score)}/5.`, meta: 'High intent' });
    if (missed[0]) recs.push({ text: `Retry ${missed[0].name} — last call was missed.`, meta: 'Missed callback' });
    if (notContacted[0]) recs.push({ text: `Reach out to ${notContacted[0].name} — no call logged yet.`, meta: 'New lead' });

    const notContactedBody = notContacted.length
      ? notContacted.map(l => personRow(l.name, l.phone, `<span class="mr-1">${LF.scoreStarsHTML(l, 12)}</span>`)).join('')
      : emptyCardBody('All your leads have been contacted.');
    const hotBody = hotLeads.length
      ? hotLeads.map(l => personRow(l.name, l.phone, `<span class="mr-1">${LF.scoreStarsHTML(l, 12)}</span>`)).join('')
      : emptyCardBody('No hot leads yet (5 stars).');
    const missedBody = missed.length
      ? missed.map(c => personRow(c.name, c.phone, `<span class="text-[11.5px] mr-1" style="color:#D63333;">${fmtCallShort(c.date)}</span>`)).join('')
      : emptyCardBody('No missed calls.');
    const aiBody = recs.length
      ? recs.map(r => `
        <div class="flex items-start gap-3 py-2.5" style="border-bottom:1px solid var(--border-soft);">
          <span class="stat-icon" style="background:#EFEAFF;width:30px;height:30px;border-radius:8px;flex-shrink:0;">
            <i data-lucide="sparkles" style="width:15px;height:15px;color:#2255a3;"></i>
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
        ${priorityCard('AI recommendations', 'sparkles', '#EFEAFF', '#2255a3', aiBody, recs.length)}
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
  // "14:30" (24h input) -> "2:30 PM" label.
  function formatTimeLabel(hhmm) {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
  }
  // "2:30 PM" label -> "14:30" for a <input type="time"> default value.
  function labelToInputValue(label) {
    const t = queueTimeMinutes(label);
    if (t === Infinity) return '';
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }
  function nowMinutes() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function fmtDateShort(key) {
    const m = /(\d{4})-(\d{2})-(\d{2})/.exec(key || '');
    if (!m) return '';
    const MS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${MS[+m[2] - 1]} ${+m[3]}`;
  }
  // A queue item's effective date (legacy rows with no date are treated as today).
  function itemDate(c) { return (c.date && c.date.trim()) || todayKey(); }
  // Overdue = a past-dated call, or one dated today whose time has already passed.
  function isOverdue(c) {
    const d = itemDate(c), today = todayKey();
    if (d < today) return true;
    if (d > today) return false;
    const t = queueTimeMinutes(c.time);
    return t !== Infinity && t < nowMinutes();
  }

  function renderQueue() {
    // Daily queue: show today's calls plus carried-over (past-dated) ones, and
    // hide anything scheduled for a future day until that day arrives. Upcoming
    // calls sort soonest-first; overdue ones drop to the bottom, chronological.
    const today = todayKey();
    const visible = callQueue.filter(c => itemDate(c) <= today);
    const cmp = (a, b) => {
      const oa = isOverdue(a), ob = isOverdue(b);
      if (oa !== ob) return oa ? 1 : -1;                 // overdue last
      if (!oa) return queueTimeMinutes(a.time) - queueTimeMinutes(b.time); // soonest today first
      const da = itemDate(a), db = itemDate(b);          // both overdue: chronological
      if (da !== db) return da < db ? -1 : 1;
      return queueTimeMinutes(a.time) - queueTimeMinutes(b.time);
    };
    const sorted = visible.slice().sort(cmp);
    const overdueCount = visible.filter(isOverdue).length;
    const rows = sorted.length ? sorted.map(c => {
      const overdue = isOverdue(c);
      const carried = itemDate(c) < today; // from a previous day
      return `
      <tr ${overdue ? 'style="background:rgba(214,51,51,.06);"' : ''}>
        <td>
          <div class="flex items-center gap-2">
            <div class="avatar avatar-sm">${initials(c.name)}</div>
            <span class="font-semibold text-[13px]">${esc(c.name)}</span>
          </div>
        </td>
        <td>
          <div class="flex items-center gap-2">
            <span class="text-muted">${esc(c.time) || '—'}</span>
            ${carried ? `<span class="text-soft text-[11px]">${fmtDateShort(itemDate(c))}</span>` : ''}
            ${overdue ? '<span class="pill pill-red" style="font-size:10.5px;">Overdue</span>' : ''}
          </div>
        </td>
        <td><span class="pill ${priorityPill(c.priority)}">${esc(c.priority)}</span></td>
        <td class="text-muted">${esc(c.reason) || '—'}</td>
        <td>
          <div class="flex items-center gap-1">
            ${callBtn(c.name, c.phone, c.id, 30)}
            ${logBtn(c.name, c.phone, c.id)}
            <button data-resched="${c.id}" class="btn-icon" title="Reschedule" style="width:30px;height:30px;">
              <i data-lucide="clock" style="width:14px;height:14px;color:var(--text-muted);pointer-events:none;"></i>
            </button>
            <button data-del-queue="${c.id}" class="btn-icon" title="Remove from queue" style="width:30px;height:30px;border:none;">
              <i data-lucide="x" style="width:14px;height:14px;color:#8A8AA0;pointer-events:none;"></i>
            </button>
          </div>
        </td>
      </tr>`; }).join('')
      : `<tr><td colspan="5" class="text-center py-10 text-muted text-[13px]">Queue is empty. Add someone to call.</td></tr>`;

    document.getElementById('calls-body').innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-[15px] font-semibold">Today's calls
          <span class="text-muted font-normal">(${visible.length})</span>
          ${overdueCount ? `<span class="pill pill-red ml-1" style="font-size:11px;">${overdueCount} overdue</span>` : ''}
        </h3>
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
      <tr data-call-uid="${c.id}" style="cursor:pointer;">
        <td data-col="name">
          <div class="flex items-center gap-2">
            <i data-lucide="${c.direction === 'inbound' ? 'phone-incoming' : 'phone-outgoing'}"
               style="width:14px;height:14px;color:${c.direction === 'inbound' ? '#2B57D9' : '#138A4B'};"></i>
            <span class="font-semibold text-[13px]" style="color:var(--accent);">${esc(c.name)}</span>
            ${c.isRealtor ? '<span class="pill pill-purple" style="font-size:10px;">Realtor</span>' : ''}
          </div>
        </td>
        <td class="text-muted" data-label="Date">${fmtCallShort(c.date)}</td>
        <td class="text-muted" data-label="Duration">${esc(c.duration)}</td>
        <td data-label="Outcome"><span class="pill ${outcomePill(c.outcome)}">${esc(c.outcome)}</span></td>
        <td class="text-muted" data-label="Notes">${esc(c.notes)}</td>
        <td data-col="agent" data-label="Agent">
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

  // ----- Call detail modal -----
  // New call logs store an ISO instant (UTC); render it in the user's local
  // timezone. Old logs are a pre-formatted local string — show those as-is.
  function isISODate(v) { return /\d{4}-\d{2}-\d{2}T/.test(String(v || '')); }
  function fmtDateTime(v) {
    if (isISODate(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    return esc(String(v || '—'));
  }
  // Compact "Jun 10, 1:30 PM" for list rows.
  function fmtCallShort(v) {
    if (isISODate(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    return esc(String(v || ''));
  }
  function detailRow(label, value) {
    return `<div class="flex justify-between gap-4 py-2" style="border-bottom:1px solid var(--border-soft);">
      <span class="text-[12.5px] text-muted flex-shrink-0">${label}</span>
      <span class="text-[13px] font-medium text-right" style="word-break:break-word;">${value}</span>
    </div>`;
  }
  function openCallDetail(c) {
    const tel = (c.phone && LF.telLink) ? LF.telLink(c.phone) : '';
    const rows = [];
    rows.push(detailRow('Phone', (c.phone && tel) ? `<a href="${tel}" style="color:var(--accent);font-weight:600;">${esc(c.phone)}</a>` : (esc(c.phone) || '—')));
    rows.push(detailRow('Direction', c.direction === 'inbound' ? 'Inbound' : 'Outbound'));
    rows.push(detailRow('Date & time', fmtDateTime(c.date)));
    rows.push(detailRow('Duration', esc(c.duration) || '—'));
    rows.push(detailRow('Outcome', `<span class="pill ${outcomePill(c.outcome)}">${esc(c.outcome)}</span>`));
    rows.push(detailRow('Agent', esc(c.agent) || '—'));
    const notesBlock = c.notes
      ? `<div class="mt-3"><div class="text-[12.5px] text-muted mb-1">Notes</div><div class="text-[13px]" style="white-space:pre-wrap;">${esc(c.notes)}</div></div>`
      : `<div class="mt-3 text-[12.5px] text-soft">No notes were recorded for this call.</div>`;
    document.getElementById('call-detail-body').innerHTML = `
      <div class="flex items-center gap-3 mb-3">
        <div class="avatar avatar-lg">${initials(c.name)}</div>
        <div>
          <div class="text-[16px] font-bold">${esc(c.name)}</div>
          ${c.isRealtor ? '<span class="pill pill-purple" style="font-size:10.5px;">Realtor</span>' : ''}
        </div>
      </div>
      ${rows.join('')}${notesBlock}`;
    document.getElementById('call-detail-modal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }
  function closeCallDetail() { document.getElementById('call-detail-modal').classList.add('hidden'); }
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
        <table class="lf-table lf-cards">
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
    // ISO instant → the local hour; legacy string → parse the "h:mm AM/PM".
    if (isISODate(s)) { const d = new Date(s); return isNaN(d.getTime()) ? null : d.getHours(); }
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
      { label: 'Total calls',   value: total,             icon: 'phone',      tint: '#EFEAFF', color: '#2255a3' },
      { label: 'Connect rate',  value: connectRate + '%', icon: 'phone-call', tint: '#E6F8EC', color: '#138A4B' },
      { label: 'Avg. duration', value: avgDur,            icon: 'timer',      tint: '#E7EEFF', color: '#2B57D9' },
      { label: 'No Answer',     value: callHistory.filter(c => isNoAnswer(c.outcome)).length, icon: 'phone-missed', tint: '#FEECEC', color: '#D63333' }
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
          <div class="rounded-full" style="height:8px;width:${t.rate}%;background:#2255a3;"></div>
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
  // Voicemail / no answer = no conversation, so blank + disable the duration.
  function syncLogDuration(form) {
    const o = form.elements['outcome'].value;
    const dur = form.elements['duration'];
    if (o === 'No Answer' || o === 'Voicemail' || o === 'Missed') { dur.value = ''; dur.disabled = true; }
    else { dur.disabled = false; if (!dur.value) dur.value = '0:00'; }
  }
  let stopCallTimer = null;
  function openLogModal(prefill, queueId) {
    pendingQueueId = queueId != null ? queueId : null;
    const form = document.getElementById('log-form');
    form.reset();
    form.elements['name'].value = (prefill && prefill.name) || '';
    form.elements['phone'].value = (prefill && prefill.phone) || '';
    form.elements['outcome'].value = 'Connected';
    syncLogDuration(form);
    // If this log was opened right after dialing, auto-time the call's duration.
    if (stopCallTimer) { stopCallTimer(); stopCallTimer = null; }
    stopCallTimer = LF.startCallDurationTimer(form);
    document.getElementById('log-form-msg').textContent = '';
    document.getElementById('log-modal').classList.remove('hidden');
    form.elements[prefill ? 'outcome' : 'name'].focus();
  }
  function closeLogModal() {
    document.getElementById('log-modal').classList.add('hidden');
    pendingQueueId = null;
    if (stopCallTimer) { stopCallTimer(); stopCallTimer = null; }
    LF.callTimer.clear();
  }

  // ----- Add to queue modal -----
  function openQueueModal() {
    const form = document.getElementById('queue-form');
    form.reset();
    form.elements['priority'].value = 'Medium';
    form.elements['date'].value = todayKey();
    document.getElementById('queue-form-msg').textContent = '';
    document.getElementById('queue-modal').classList.remove('hidden');
    form.elements['name'].focus();
  }
  function closeQueueModal() { document.getElementById('queue-modal').classList.add('hidden'); }

  // ----- Reschedule modal -----
  function openRescheduleModal(item) {
    reschedulingId = item.id;
    const form = document.getElementById('reschedule-form');
    form.reset();
    document.getElementById('reschedule-name').textContent = item.name;
    form.elements['date'].value = itemDate(item);
    form.elements['time'].value = labelToInputValue(item.time);
    form.elements['reason'].value = item.reason || '';
    document.getElementById('reschedule-form-msg').textContent = '';
    document.getElementById('reschedule-modal').classList.remove('hidden');
    form.elements['time'].focus();
  }
  function closeRescheduleModal() { document.getElementById('reschedule-modal').classList.add('hidden'); reschedulingId = null; }

  function bind() {
    // Log modal controls
    document.getElementById('log-modal-close').addEventListener('click', closeLogModal);
    document.getElementById('log-cancel').addEventListener('click', closeLogModal);
    document.getElementById('log-modal-backdrop').addEventListener('click', closeLogModal);
    document.getElementById('log-form').elements['outcome'].addEventListener('change', e => syncLogDuration(e.target.form));
    // Queue modal controls
    document.getElementById('queue-modal-close').addEventListener('click', closeQueueModal);
    document.getElementById('queue-cancel').addEventListener('click', closeQueueModal);
    document.getElementById('queue-modal-backdrop').addEventListener('click', closeQueueModal);
    // Reschedule modal controls
    document.getElementById('reschedule-modal-close').addEventListener('click', closeRescheduleModal);
    document.getElementById('reschedule-cancel').addEventListener('click', closeRescheduleModal);
    document.getElementById('reschedule-modal-backdrop').addEventListener('click', closeRescheduleModal);

    // Detail/close for the call-detail modal.
    document.getElementById('call-detail-close').addEventListener('click', closeCallDetail);
    document.getElementById('call-detail-backdrop').addEventListener('click', closeCallDetail);

    // Delegated clicks inside the body (log triggers, log-new, reschedule, queue removal).
    document.getElementById('calls-body').addEventListener('click', async e => {
      // Clicking a Call History row opens its detail.
      const histRow = e.target.closest('[data-call-uid]');
      if (histRow) {
        const c = callHistory.find(x => String(x.id) === histRow.getAttribute('data-call-uid'));
        if (c) openCallDetail(c);
        return;
      }

      const callT = e.target.closest('[data-call]');
      if (callT) {
        const phone = callT.getAttribute('data-call');
        const tel = LF.telLink(phone);
        LF.callTimer.start(); // start timing the moment the call begins
        if (tel) window.location.href = tel;
        // Open the log-call modal so the call can be logged afterwards.
        openLogModal({ name: callT.getAttribute('data-call-name') || '', phone }, callT.getAttribute('data-call-queue'));
        return;
      }

      const newBtn = e.target.closest('[data-log-new]');
      if (newBtn) { LF.callTimer.clear(); openLogModal(null, null); return; } // manual log, no timer

      const trigger = e.target.closest('[data-log-name]');
      if (trigger) {
        const phone = trigger.getAttribute('data-log-phone');
        if (phone) window.open(waLink(phone), '_blank');
        LF.callTimer.clear(); // WhatsApp/manual log — duration is entered by hand
        openLogModal({ name: trigger.getAttribute('data-log-name'), phone }, trigger.getAttribute('data-log-queue'));
        return;
      }

      const resched = e.target.closest('[data-resched]');
      if (resched) {
        const item = callQueue.find(c => String(c.id) === resched.getAttribute('data-resched'));
        if (item) openRescheduleModal(item);
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
      const timeLabel = formatTimeLabel(data.time);
      const btn = queueForm.querySelector('button[type="submit"]');
      btn.disabled = true; btn.style.opacity = '0.7';
      try {
        const res = await fetch('/api/call-queue', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ name: data.name, phone: data.phone || '', priority: data.priority, time: timeLabel, date: data.date || todayKey(), reason: data.reason || '' })
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

    // Reschedule form submit
    const reschedForm = document.getElementById('reschedule-form');
    const reschedMsg = document.getElementById('reschedule-form-msg');
    reschedForm.addEventListener('submit', async e => {
      e.preventDefault();
      reschedMsg.textContent = '';
      if (reschedulingId == null) { closeRescheduleModal(); return; }
      const data = Object.fromEntries(new FormData(reschedForm));
      if (!data.time) { reschedMsg.textContent = 'Pick a time.'; return; }
      if (!data.date) { reschedMsg.textContent = 'Pick a date.'; return; }
      const timeLabel = formatTimeLabel(data.time);
      const reason = (data.reason || '').trim();
      const date = data.date;
      const id = reschedulingId;
      const btn = reschedForm.querySelector('button[type="submit"]');
      btn.disabled = true; btn.style.opacity = '0.7';
      try {
        const res = await fetch('/api/call-queue/' + id, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ time: timeLabel, date, reason })
        });
        const raw = await res.text();
        let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (err) {}
        if (!res.ok) { reschedMsg.textContent = body.error || `Request failed (HTTP ${res.status}).`; return; }
        const item = callQueue.find(c => String(c.id) === String(id));
        if (item) { item.time = timeLabel; item.date = date; item.reason = reason; }
        closeRescheduleModal();
        render();
      } catch (err) {
        reschedMsg.textContent = 'Network error. Is the server running?';
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
