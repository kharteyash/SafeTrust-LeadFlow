// Dashboard — everything computed from the user's real data (Postgres).
(function () {
  const TIMELINES = [
    { label: 'Buying Immediately', color: '#3FBE6D' },
    { label: '1-3 Months',         color: '#F5B940' },
    { label: '3-6 Months',         color: '#E64B4B' },
    { label: '6+ Months',          color: '#5BA8FF' }
  ];

  let leads = [], calls = [], tasks = [], contacts = [], closedLeads = [], callQueue = [];
  const state = { page: 1, pageSize: 5, tab: 'all', trendDays: 7 };
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Closed-lead (CSV) column pickers — same detection the Clients page uses.
  function closedField(data, patterns) {
    const keys = Object.keys(data || {});
    for (const p of patterns) { const c = keys.find(k => p.test(k)); if (c) return data[c]; }
    return '';
  }
  function closedName(data) {
    const keys = Object.keys(data || {});
    return closedField(data, [/^primary borrower$/i, /borrower name/i, /full name/i, /^name$/i, /^customer$/i, /^client$/i]) || data[keys[0]] || '';
  }
  const closedEmail = (d) => closedField(d, [/e-?mail/i]);
  const closedPhone = (d) => closedField(d, [/phone|mobile|\bcell\b|\btel\b/i]);

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function initials(name) { return (name || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?'; }
  function timelinePill(t) {
    if (t === 'Buying Immediately') return 'pill-green';
    if (t === '1-3 Months') return 'pill-yellow';
    if (t === '3-6 Months') return 'pill-red';
    if (t === '6+ Months') return 'pill-blue';
    return 'pill-gray';
  }
  function scorePill(s) { return s >= 80 ? 'pill-green' : s >= 60 ? 'pill-yellow' : 'pill-red'; }
  function waLink(phone) { return LF.waLink(phone); }

  // ----- Load -----
  async function loadAll() {
    const get = async (u) => { try { const r = await fetch(u, { credentials: 'same-origin' }); return r.ok ? await r.json() : []; } catch (e) { return []; } };
    [leads, calls, tasks, contacts, closedLeads, callQueue] = await Promise.all([
      get('/api/leads'), get('/api/call-log'), get('/api/tasks'), get('/api/contacts'), get('/api/closed'), get('/api/call-queue')
    ]);
    leads = leads.map((l, i) => Object.assign({ _uid: i + 1 }, l));
  }

  // ----- Today at a glance (in-app daily digest) -----
  function renderDigest() {
    const host = document.getElementById('today-digest');
    if (!host) return;
    const today = todayKey();
    const callsToday = callQueue.filter(c => !c.date || c.date <= today);
    const tasksDue = tasks.filter(t => t.status !== 'done' && t.due && t.due <= today);
    const hot = leads.filter(l => l.stars === 5);
    const first = ((window.LF_DATA && LF_DATA.user && LF_DATA.user.name) || '').trim().split(/\s+/)[0] || 'there';

    const col = (icon, color, tint, title, count, items, href, empty) => `
      <div class="col-span-12 md:col-span-4">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="stat-icon" style="background:${tint};width:30px;height:30px;border-radius:8px;">
              <i data-lucide="${icon}" style="width:15px;height:15px;color:${color};"></i>
            </span>
            <h4 class="text-[13.5px] font-semibold">${title}</h4>
            <span class="pill pill-gray" style="font-size:11px;">${count}</span>
          </div>
          <a href="${href}" class="text-[12px] font-semibold" style="color:#2255a3;">View</a>
        </div>
        ${items.length
          ? `<div class="flex flex-col gap-1">${items.slice(0, 5).map(t => `
              <div class="text-[12.5px] truncate" style="padding:3px 0;border-bottom:1px solid var(--border-soft);">${esc(t)}</div>`).join('')}
              ${items.length > 5 ? `<div class="text-[11.5px] text-soft mt-1">+ ${items.length - 5} more</div>` : ''}</div>`
          : `<div class="text-[12.5px] text-soft py-2">${empty}</div>`}
      </div>`;

    host.innerHTML = `
      <div class="panel p-5">
        <div class="flex items-center gap-2 mb-4">
          <i data-lucide="sunrise" style="width:18px;height:18px;color:#B07A00;"></i>
          <h3 class="text-[15px] font-semibold">Today at a glance</h3>
          <span class="text-[12.5px] text-muted">— good to see you, ${esc(first)}</span>
        </div>
        <div class="grid grid-cols-12 gap-5">
          ${col('phone', '#2255a3', '#E7EEFF', 'Calls to make today', callsToday.length, callsToday.map(c => `${c.name}${c.reason ? ' — ' + c.reason : ''}`), 'calls.html', 'No calls queued for today. 🎉')}
          ${col('check-square', '#138A4B', '#E6F8EC', 'Tasks due', tasksDue.length, tasksDue.map(t => `${t.title}${t.due && t.due < today ? ' (overdue)' : ''}`), 'tasks.html', 'No tasks due. 🎉')}
          ${col('flame', '#D63333', '#FEECEC', 'Hot leads', hot.length, hot.map(l => l.name), 'leads.html', 'No hot leads right now.')}
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  }

  // ----- Stat cards -----
  function renderStatCards() {
    const interested = leads.filter(l => l.timeline === 'Buying Immediately').length;
    const openTasks = tasks.filter(t => t.status !== 'done').length;
    const cards = [
      { label: 'Total Leads',      value: leads.length,    icon: 'users',          tint: '#EFEAFF', color: '#2255a3', href: 'leads.html' },
      { label: 'Contacts',         value: contacts.length, icon: 'contact',        tint: '#E7EEFF', color: '#2B57D9', href: 'contacts.html' },
      { label: 'Calls Made',       value: calls.length,    icon: 'phone',          tint: '#E7EEFF', color: '#2B57D9', href: 'calls.html' },
      { label: 'Interested Leads', value: interested,      icon: 'check-circle-2', tint: '#E6F8EC', color: '#138A4B', href: 'leads.html' },
      { label: 'Open Tasks',       value: openTasks,       icon: 'list-checks',    tint: '#FFF4D6', color: '#B07A00', href: 'tasks.html' }
    ];
    document.getElementById('stat-cards').innerHTML = cards.map(c => `
      <a href="${c.href}" class="stat-card block" style="cursor:pointer;text-decoration:none;color:inherit;">
        <div class="flex items-center gap-3 mb-3">
          <div class="stat-icon" style="background:${c.tint};"><i data-lucide="${c.icon}" style="width:18px;height:18px;color:${c.color};"></i></div>
          <span class="text-[13px] text-muted font-medium">${c.label}</span>
        </div>
        <div class="text-[26px] font-bold tracking-tight leading-tight">${LF.fmtNum(c.value)}</div>
      </a>`).join('');
  }

  // ----- Donut: leads by timeline -----
  function renderDonut() {
    const data = TIMELINES.map(t => ({ ...t, value: leads.filter(l => l.timeline === t.label).length }));
    const total = data.reduce((a, b) => a + b.value, 0);
    const host = document.getElementById('buying-donut');

    if (total === 0) {
      host.innerHTML = `<div class="text-[13px] text-muted py-10 text-center w-full">No leads yet — add leads to see the breakdown.</div>`;
      return;
    }
    const size = 180, stroke = 28, r = (size - stroke) / 2, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r;
    let offset = 0;
    const segs = data.filter(d => d.value > 0).map(d => {
      const len = C * (d.value / total);
      const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${d.color}" stroke-width="${stroke}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
      offset += len; return seg;
    }).join('');
    const legend = data.map(d => {
      const pct = total ? ((d.value / total) * 100).toFixed(1) : 0;
      return `<div class="mb-3">
        <div class="flex items-center gap-2 mb-0.5"><span class="w-2.5 h-2.5 rounded-full" style="background:${d.color};"></span><span class="text-[13px] text-muted">${d.label}</span></div>
        <div class="text-[15px] font-semibold ml-[18px]">${LF.fmtNum(d.value)} (${pct}%)</div>
      </div>`;
    }).join('');
    host.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="flex-shrink-0">${segs}</svg><div class="flex-1">${legend}</div>`;
  }

  // ----- Trend: leads added per day -----
  function dayKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function renderTrendSelect() {
    const sel = document.getElementById('trend-week');
    sel.innerHTML = `<option value="7">Last 7 days</option><option value="30">Last 30 days</option>`;
    sel.value = String(state.trendDays);
    sel.addEventListener('change', e => { state.trendDays = parseInt(e.target.value, 10); renderTrend(); });
  }
  function renderTrend() {
    const days = state.trendDays;
    const counts = {};
    leads.forEach(l => {
      if (!l.created) return;
      const k = dayKey(new Date(l.created));
      counts[k] = (counts[k] || 0) + 1;
    });
    const labels = [], dataArr = [];
    const MS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const today = new Date();
    const step = days === 30 ? 5 : 1; // label every day for 7, every 5 for 30
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      dataArr.push(counts[dayKey(d)] || 0);
      labels.push((i % step === 0) ? `${MS[d.getMonth()]} ${d.getDate()}` : '');
    }

    const w = 560, h = 240, padL = 32, padR = 14, padT = 14, padB = 28;
    const innerW = w - padL - padR, innerH = h - padT - padB;
    const maxData = Math.max(...dataArr, 1);
    const steps = [1, 2, 5, 10, 20, 50, 100];
    const tickStep = steps.find(s => maxData / s <= 5) || 200;
    const top = Math.max(tickStep, Math.ceil(maxData / tickStep) * tickStep);
    const yTicks = []; for (let v = 0; v <= top; v += tickStep) yTicks.push(v);

    const xStep = innerW / Math.max(1, dataArr.length - 1);
    const pts = dataArr.map((v, i) => [padL + i * xStep, padT + innerH - (v / top) * innerH]);
    const path = pts.map((p, i) => (i ? 'L' : 'M') + ` ${p[0]} ${p[1]}`).join(' ');
    const area = `${path} L ${pts[pts.length - 1][0]} ${padT + innerH} L ${pts[0][0]} ${padT + innerH} Z`;
    const grid = yTicks.map(t => { const y = padT + innerH - (t / top) * innerH; return `<line x1="${padL}" x2="${w - padR}" y1="${y}" y2="${y}" style="stroke:var(--chip)"/>`; }).join('');
    const yLab = yTicks.map(t => { const y = padT + innerH - (t / top) * innerH; return `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#8A8AA0">${t}</text>`; }).join('');
    const xLab = labels.map((l, i) => l ? `<text x="${padL + i * xStep}" y="${h - 8}" text-anchor="middle" font-size="11" fill="#8A8AA0">${l}</text>` : '').join('');
    const dots = days === 7 ? pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#2255a3" style="stroke:var(--surface)" stroke-width="2"/>`).join('') : '';

    document.getElementById('trend-chart').innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">
        <defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2255a3" stop-opacity="0.18"/><stop offset="100%" stop-color="#2255a3" stop-opacity="0"/></linearGradient></defs>
        ${grid}${yLab}${xLab}
        <path d="${area}" fill="url(#trendFill)"/>
        <path d="${path}" fill="none" stroke="#2255a3" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}
      </svg>`;
  }

  // ----- High priority: leads not yet contacted -----
  function renderHighPriority() {
    const calledNames = new Set(calls.map(c => (c.name || '').toLowerCase()));
    const list = leads.filter(l => !calledNames.has((l.name || '').toLowerCase())).slice(0, 5);
    const host = document.getElementById('high-priority');
    if (list.length === 0) {
      host.innerHTML = `<div class="text-[13px] text-muted py-6 text-center">${leads.length ? 'All leads have been contacted.' : 'No leads yet.'}</div>`;
      return;
    }
    host.innerHTML = list.map(p => `
      <div class="flex items-center gap-3">
        <div class="avatar">${initials(p.name)}</div>
        <div class="flex-1 min-w-0">
          <div class="text-[13.5px] font-semibold truncate">${esc(p.name)}</div>
          <div class="text-[12px] text-muted">${esc(p.phone) || '—'}</div>
        </div>
        <span class="mr-1">${LF.scoreStarsHTML(p, 12)}</span>
        <button class="btn-icon" title="Call" data-call="${esc(p.phone)}" style="width:32px;height:32px;" ${p.phone ? '' : 'disabled'}>
          <i data-lucide="phone" style="width:14px;height:14px;color:#2255a3;pointer-events:none;"></i>
        </button>
        <button class="btn-icon" title="WhatsApp" data-wa="${esc(p.phone)}" style="width:32px;height:32px;" ${p.phone ? '' : 'disabled'}>
          <i data-lucide="message-circle" style="width:14px;height:14px;color:#138A4B;pointer-events:none;"></i>
        </button>
      </div>`).join('');
    host.querySelectorAll('[data-call]').forEach(b => b.addEventListener('click', () => {
      const tel = LF.telLink(b.getAttribute('data-call')); if (tel) window.location.href = tel;
    }));
    host.querySelectorAll('[data-wa]').forEach(b => b.addEventListener('click', () => {
      const ph = b.getAttribute('data-wa'); if (ph) window.open(waLink(ph), '_blank');
    }));
  }

  // ----- Lead table (real, with timeline tabs) -----
  const LEAD_TABS = [
    { id: 'all',    label: 'All Leads',          match: () => true },
    { id: 'hot',    label: 'Hot Leads',          match: l => l.stars === 5 },
    { id: 'buying', label: 'Buying Immediately', match: l => l.timeline === 'Buying Immediately' },
    { id: '1-3',    label: '1-3 Months',         match: l => l.timeline === '1-3 Months' },
    { id: '3-6',    label: '3-6 Months',         match: l => l.timeline === '3-6 Months' },
    { id: '6plus',  label: '6+ Months',          match: l => l.timeline === '6+ Months' },
    { id: 'closed', label: 'Closed Leads',       closed: true }
  ];
  function renderLeadTabs() {
    const el = document.getElementById('dash-lead-tabs');
    el.innerHTML = LEAD_TABS.map(t => `<div class="tab ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</div>`).join('');
    el.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
      state.tab = tab.dataset.tab; state.page = 1; renderLeadTabs(); renderLeadsTable();
    }));
  }
  function renderClosedTable() {
    const table = document.getElementById('leads-table');
    const rows = closedLeads;
    const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const pageRows = rows.slice(start, start + state.pageSize);
    if (rows.length === 0) {
      table.innerHTML = `<tbody><tr><td class="text-center py-10 text-muted text-[13px]">No closed leads yet — import them on the Past Clients page.</td></tr></tbody>`;
      document.getElementById('lead-summary').textContent = 'No closed leads to show';
      document.getElementById('pager').innerHTML = '';
      return;
    }
    table.innerHTML = `
      <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Loan Purpose</th><th>State</th></tr></thead>
      <tbody>
        ${pageRows.map(r => {
          const d = r.data || {};
          return `
          <tr>
            <td><a href="clients.html" class="font-semibold" style="color:var(--accent);" title="Open in Past Clients">${esc(closedName(d)) || '(no name)'}</a></td>
            <td class="text-muted">${esc(closedEmail(d))}</td>
            <td>${esc(closedPhone(d))}</td>
            <td class="text-muted">${esc(closedField(d, [/loan purpose|^purpose$/i]))}</td>
            <td class="text-muted">${esc(closedField(d, [/subject state|^state$/i]))}</td>
          </tr>`;
        }).join('')}
      </tbody>`;
    document.getElementById('lead-summary').textContent =
      `Showing ${start + 1} to ${Math.min(start + state.pageSize, rows.length)} of ${LF.fmtNum(rows.length)} closed leads`;
    renderPager(totalPages);
  }
  function renderLeadsTable() {
    const tab = LEAD_TABS.find(t => t.id === state.tab) || LEAD_TABS[0];
    if (tab.closed) return renderClosedTable();
    const rows = leads.filter(tab.match);
    const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const pageRows = rows.slice(start, start + state.pageSize);
    const table = document.getElementById('leads-table');

    if (rows.length === 0) {
      table.innerHTML = `<tbody><tr><td class="text-center py-10 text-muted text-[13px]">${leads.length ? 'No leads in this category.' : 'No leads yet — add one on the Leads page.'}</td></tr></tbody>`;
      document.getElementById('lead-summary').textContent = 'No leads to show';
      document.getElementById('pager').innerHTML = '';
      return;
    }

    table.innerHTML = `
      <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Buying Timeline</th><th>Lead Score</th><th>Owner</th></tr></thead>
      <tbody>
        ${pageRows.map(l => `
          <tr>
            <td><span class="font-semibold" data-detail-uid="${l._uid}" style="cursor:pointer;color:var(--accent);">${esc(l.name)}</span></td>
            <td class="text-muted">${esc(l.email)}</td>
            <td>${esc(l.phone)}</td>
            <td><span class="pill ${timelinePill(l.timeline)}">${esc(l.timeline)}</span></td>
            <td>${LF.scoreStarsHTML(l, 13)}</td>
            <td>
              <div class="flex items-center gap-2">
                <div class="avatar avatar-sm">${initials(l.owner)}</div>
                <span class="text-[13px]">${esc(l.owner) || '—'}</span>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>`;

    document.getElementById('lead-summary').textContent =
      `Showing ${start + 1} to ${Math.min(start + state.pageSize, rows.length)} of ${LF.fmtNum(rows.length)} leads`;
    renderPager(totalPages);
  }
  function renderPager(totalPages) {
    const pager = document.getElementById('pager');
    const pages = []; for (let p = 1; p <= totalPages; p++) pages.push(p);
    pager.innerHTML = `
      <button class="btn-icon" data-page="prev" style="width:30px;height:30px;" ${state.page === 1 ? 'disabled' : ''}><i data-lucide="chevron-left" style="width:14px;height:14px;color:var(--text-muted);"></i></button>
      ${pages.map(p => `<button data-page="${p}" class="rounded-md text-[12.5px] font-semibold" style="width:30px;height:30px;${p === state.page ? 'background:#2255a3;color:#FFF;' : 'background:var(--surface);color:var(--text);border:1px solid var(--border-strong);'}">${p}</button>`).join('')}
      <button class="btn-icon" data-page="next" style="width:30px;height:30px;" ${state.page === totalPages ? 'disabled' : ''}><i data-lucide="chevron-right" style="width:14px;height:14px;color:var(--text-muted);"></i></button>`;
    pager.querySelectorAll('button[data-page]').forEach(btn => btn.addEventListener('click', () => {
      const v = btn.dataset.page;
      if (v === 'prev' && state.page > 1) state.page--;
      else if (v === 'next' && state.page < totalPages) state.page++;
      else if (!isNaN(parseInt(v, 10))) state.page = parseInt(v, 10);
      renderLeadsTable(); if (window.lucide) lucide.createIcons();
    }));
  }
  function bindRowsPerPage() {
    const sel = document.getElementById('rows-per-page');
    sel.value = String(state.pageSize);
    sel.addEventListener('change', e => { state.pageSize = parseInt(e.target.value, 10); state.page = 1; renderLeadsTable(); if (window.lucide) lucide.createIcons(); });
  }

  // ----- Lead detail modal (read-only, opened by clicking a name) -----
  function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function realtorLabel(s) { return s === 'has' ? 'Has a realtor' : s === 'unavailable' ? 'Not available' : 'None'; }
  function detailRow(label, value) {
    return `<div class="flex justify-between gap-4 py-2" style="border-bottom:1px solid var(--border-soft);">
      <span class="text-[12.5px] text-muted flex-shrink-0">${label}</span>
      <span class="text-[13px] font-medium text-right" style="word-break:break-word;">${value}</span>
    </div>`;
  }
  function openLeadDetail(lead) {
    const type = lead.leadType || 'Purchase';
    const tel = (lead.phone && LF.telLink) ? LF.telLink(lead.phone) : '';
    const rows = [];
    rows.push(detailRow('Email', lead.email ? `<a href="mailto:${escAttr(lead.email)}" style="color:var(--accent);">${esc(lead.email)}</a>` : '—'));
    rows.push(detailRow('Phone', (lead.phone && tel) ? `<a href="${tel}" style="color:var(--accent);font-weight:600;">${esc(lead.phone)}</a>` : (esc(lead.phone) || '—')));
    rows.push(detailRow('Buying timeline', `<span class="pill ${timelinePill(lead.timeline)}">${esc(lead.timeline)}</span>`));
    rows.push(detailRow('Lead score', LF.scoreStarsHTML(lead, 13)));
    rows.push(detailRow('Pre-approved', lead.preapproved ? 'Yes' : 'No'));
    rows.push(detailRow('Lead type', esc(type)));
    if (type === 'Refinance') {
      rows.push(detailRow('Refinance type', esc(lead.refiType) || '—'));
    } else {
      rows.push(detailRow('Realtor', realtorLabel(lead.realtorStatus)));
      if (lead.realtorStatus === 'has') {
        rows.push(detailRow('Realtor name', esc(lead.realtorName) || '—'));
        rows.push(detailRow('Realtor email', esc(lead.realtorEmail) || '—'));
        const rtel = (lead.realtorPhone && LF.telLink) ? LF.telLink(lead.realtorPhone) : '';
        rows.push(detailRow('Realtor phone', (lead.realtorPhone && rtel) ? `<a href="${rtel}" style="color:var(--accent);font-weight:600;">${esc(lead.realtorPhone)}</a>` : (esc(lead.realtorPhone) || '—')));
      }
    }
    rows.push(detailRow('State', esc(lead.state) || '—'));
    rows.push(detailRow('Owner', esc(lead.owner) || '—'));
    const notesBlock = lead.notes
      ? `<div class="mt-3"><div class="text-[12.5px] text-muted mb-1">Notes</div><div class="text-[13px]" style="white-space:pre-wrap;">${esc(lead.notes)}</div></div>` : '';

    document.getElementById('dash-lead-body').innerHTML = `
      <div class="flex items-center gap-3 mb-3">
        <div class="avatar avatar-lg">${esc(initials(lead.name))}</div>
        <div>
          <div class="text-[16px] font-bold">${esc(lead.name)}</div>
          ${lead.preapproved ? '<span class="pill pill-green" style="font-size:10.5px;">Pre-approved</span>' : ''}
        </div>
      </div>
      ${rows.join('')}${notesBlock}`;
    document.getElementById('dash-lead-modal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }
  function closeLeadDetail() { document.getElementById('dash-lead-modal').classList.add('hidden'); }
  function bindLeadDetail() {
    document.getElementById('dash-lead-close').addEventListener('click', closeLeadDetail);
    document.getElementById('dash-lead-backdrop').addEventListener('click', closeLeadDetail);
    // Delegated on the table element (survives re-renders / paging).
    document.getElementById('leads-table').addEventListener('click', e => {
      const el = e.target.closest('[data-detail-uid]');
      if (!el) return;
      const lead = leads.find(l => String(l._uid) === String(el.getAttribute('data-detail-uid')));
      if (lead) openLeadDetail(lead);
    });
  }

  // ----- Tasks overview (real counts) -----
  function renderTasksOverview() {
    const open = tasks.filter(t => t.status !== 'done');
    const today = new Date(); const todayKey = dayKey(today);
    const due = open.filter(t => t.due && t.due === todayKey).length;
    const rows = [
      { label: 'Open tasks',     count: open.length,                              icon: 'list-checks', tint: '#EFEAFF', color: '#2255a3' },
      { label: 'Due today',      count: due,                                      icon: 'alarm-clock', tint: '#FFF4D6', color: '#B07A00' },
      { label: 'High priority',  count: open.filter(t => t.priority === 'High').length, icon: 'flag', tint: '#FEECEC', color: '#D63333' },
      { label: 'Completed',      count: tasks.filter(t => t.status === 'done').length,  icon: 'check-circle-2', tint: '#E6F8EC', color: '#138A4B' }
    ];
    const countsHTML = rows.map(t => `
      <div class="flex items-center gap-3 py-3" style="border-bottom:1px solid var(--border-soft);">
        <div class="stat-icon" style="background:${t.tint};width:36px;height:36px;border-radius:10px;"><i data-lucide="${t.icon}" style="width:16px;height:16px;color:${t.color};"></i></div>
        <span class="flex-1 text-[13.5px] font-medium">${t.label}</span>
        <span class="text-[18px] font-bold">${t.count}</span>
      </div>`).join('');

    // A short list of open tasks, tagging any that were assigned by a leader/admin.
    const openList = open.slice(0, 5);
    const listHTML = openList.length ? `
      <div class="mt-3 pt-3" style="border-top:1px solid var(--border-soft);">
        <div class="text-[12px] font-semibold text-muted mb-1">Your tasks</div>
        ${openList.map(t => `
          <div class="flex items-center gap-2 py-1.5">
            <span class="text-[13px] truncate flex-1">${esc(t.title)}</span>
            ${t.assignedByName ? `<span class="pill pill-blue" style="font-size:10px;flex-shrink:0;">From ${esc(t.assignedByName)}</span>` : ''}
          </div>`).join('')}
      </div>` : '';

    document.getElementById('tasks-overview').innerHTML = countsHTML + listHTML;
  }

  // ----- Header date range (current week, Sunday–Saturday) -----
  function renderDateRange() {
    const el = document.getElementById('dash-date-range');
    if (!el) return;
    const MS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    const left = `${MS[start.getMonth()]} ${start.getDate()}`;
    const right = start.getMonth() === end.getMonth()
      ? `${end.getDate()}` : `${MS[end.getMonth()]} ${end.getDate()}`;
    el.textContent = `${left} – ${right}, ${end.getFullYear()}`;
  }

  // ----- Mount -----
  document.addEventListener('DOMContentLoaded', async function () {
    await LF.renderLayout({ active: 'dashboard' });
    const first = ((LF_DATA.user && LF_DATA.user.name) || '').split(' ')[0] || 'there';
    const wm = document.getElementById('welcome-msg');
    if (wm) wm.textContent = `Welcome back, ${first}! Here's what's happening with your leads.`;
    renderDateRange();

    await loadAll();
    renderDigest();
    renderStatCards();
    renderDonut();
    renderTrendSelect();
    renderTrend();
    renderHighPriority();
    renderLeadTabs();
    renderLeadsTable();
    bindRowsPerPage();
    bindLeadDetail();
    renderTasksOverview();
    if (window.lucide) lucide.createIcons();
  });
})();
