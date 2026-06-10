// Reports — computed from the user's real data (leads, calls, tasks).
(function () {
  const TABS = [
    { id: 'leads',    label: 'Lead Reports' },
    { id: 'activity', label: 'Activity Reports' }
  ];
  const state = { tab: 'leads' };

  const TIMELINES = [
    { label: 'Buying Immediately', color: '#3FBE6D' },
    { label: '1-3 Months',         color: '#F5B940' },
    { label: '3-6 Months',         color: '#E64B4B' },
    { label: '6+ Months',          color: '#5BA8FF' }
  ];

  let leads = [], calls = [], tasks = [];

  async function loadAll() {
    const get = async (u) => { try { const r = await fetch(u, { credentials: 'same-origin' }); return r.ok ? await r.json() : []; } catch (e) { return []; } };
    [leads, calls, tasks] = await Promise.all([get('/api/leads'), get('/api/call-log'), get('/api/tasks')]);
  }

  function statCard(label, value, icon, tint, color) {
    return `
      <div class="stat-card col-span-6 md:col-span-3">
        <div class="flex items-center gap-3 mb-3">
          <div class="stat-icon" style="background:${tint};"><i data-lucide="${icon}" style="width:18px;height:18px;color:${color};"></i></div>
          <span class="text-[13px] text-muted font-medium">${label}</span>
        </div>
        <div class="text-[26px] font-bold tracking-tight leading-tight">${value}</div>
      </div>`;
  }
  function barRow(label, value, max, color, right) {
    const pct = max ? Math.round((value / max) * 100) : 0;
    return `
      <div class="mb-3">
        <div class="flex items-center justify-between text-[12.5px] mb-1">
          <span class="font-medium">${label}</span>
          <span class="text-muted">${right}</span>
        </div>
        <div class="rounded-full" style="height:8px;background:var(--chip);">
          <div class="rounded-full" style="height:8px;width:${pct}%;background:${color};"></div>
        </div>
      </div>`;
  }

  function renderTabs() {
    document.getElementById('rep-tabs').innerHTML = TABS.map(t =>
      `<div class="tab ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</div>`).join('');
    document.querySelectorAll('#rep-tabs .tab').forEach(el => el.addEventListener('click', () => { state.tab = el.dataset.tab; render(); }));
  }

  // ----- Lead Reports -----
  function renderLeads() {
    const now = new Date();
    const newThisMonth = leads.filter(l => { if (!l.created) return false; const d = new Date(l.created); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }).length;
    const hot = leads.filter(l => LF.scoreStars(l.score) >= 4).length;
    const interested = leads.filter(l => l.timeline === 'Buying Immediately').length;

    const cards =
      statCard('Total leads',  LF.fmtNum(leads.length), 'users',          '#EFEAFF', '#2255a3') +
      statCard('New this month', LF.fmtNum(newThisMonth), 'trending-up',  '#E6F8EC', '#138A4B') +
      statCard('Hot leads (4–5★)', LF.fmtNum(hot),      'flame',         '#FEECEC', '#D63333') +
      statCard('Interested',   LF.fmtNum(interested),    'check-circle-2','#E7EEFF', '#2B57D9');

    // Buying patterns
    const byTimeline = TIMELINES.map(t => ({ ...t, value: leads.filter(l => l.timeline === t.label).length }));
    const maxTl = Math.max(...byTimeline.map(t => t.value), 1);
    const patterns = byTimeline.map(t => barRow(t.label, t.value, maxTl, t.color, `${LF.fmtNum(t.value)} leads`)).join('');

    // Score distribution
    const starOf = (l) => LF.scoreStars(l.score);
    const hotN = leads.filter(l => starOf(l) >= 4).length;
    const warmN = leads.filter(l => starOf(l) === 3).length;
    const coldN = leads.filter(l => starOf(l) <= 2).length;
    const maxS = Math.max(hotN, warmN, coldN, 1);
    const scores =
      barRow('Hot (4–5★)',  hotN,  maxS, '#138A4B', `${hotN}`) +
      barRow('Warm (3★)',   warmN, maxS, '#B07A00', `${warmN}`) +
      barRow('Cold (1–2★)', coldN, maxS, '#D63333', `${coldN}`);

    const body = leads.length === 0
      ? `<div class="text-center py-12 text-muted text-[13px]">No leads yet — add leads to see reports.</div>`
      : `<div class="grid grid-cols-12 gap-5">
           <div class="col-span-12 lg:col-span-6 panel p-5" style="box-shadow:none;">
             <h3 class="text-[14.5px] font-semibold mb-4">Buying patterns</h3>${patterns}
           </div>
           <div class="col-span-12 lg:col-span-6 panel p-5" style="box-shadow:none;">
             <h3 class="text-[14.5px] font-semibold mb-4">Lead score distribution</h3>${scores}
           </div>
         </div>`;

    document.getElementById('rep-body').innerHTML = `<div class="grid grid-cols-12 gap-4 mb-6">${cards}</div>${body}`;
  }

  // ----- Activity Reports -----
  function renderActivity() {
    const connected = calls.filter(c => c.outcome === 'Connected').length;
    const connectRate = calls.length ? Math.round((connected / calls.length) * 100) : 0;
    const openTasks = tasks.filter(t => t.status !== 'done').length;
    const doneTasks = tasks.filter(t => t.status === 'done').length;

    const cards =
      statCard('Calls made',  LF.fmtNum(calls.length), 'phone',          '#EFEAFF', '#2255a3') +
      statCard('Connect rate', connectRate + '%',      'phone-call',     '#E6F8EC', '#138A4B') +
      statCard('Open tasks',  LF.fmtNum(openTasks),    'list-checks',    '#FFF4D6', '#B07A00') +
      statCard('Completed',   LF.fmtNum(doneTasks),    'check-circle-2', '#E7EEFF', '#2B57D9');

    // Monthly new leads (last 6 months)
    const MS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MS[d.getMonth()], count: 0 });
    }
    leads.forEach(l => {
      if (!l.created) return;
      const d = new Date(l.created);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      const m = months.find(x => x.key === k);
      if (m) m.count++;
    });
    const maxM = Math.max(...months.map(m => m.count), 1);
    const bars = months.map(m => {
      const h = Math.round((m.count / maxM) * 130);
      return `<div class="flex flex-col items-center justify-end gap-2 flex-1">
        <div class="w-full rounded-t-md mx-1" style="height:${Math.max(h, 2)}px;background:linear-gradient(180deg,#547ab2,#2255a3);" title="${m.count} leads"></div>
        <span class="text-[11px] text-soft">${m.label}</span>
      </div>`;
    }).join('');

    document.getElementById('rep-body').innerHTML = `
      <div class="grid grid-cols-12 gap-4 mb-6">${cards}</div>
      <div class="panel p-5" style="box-shadow:none;">
        <h3 class="text-[14.5px] font-semibold mb-4">New leads by month</h3>
        <div class="flex items-end gap-2" style="height:160px;">${bars}</div>
      </div>`;
  }

  function render() {
    renderTabs();
    if (state.tab === 'leads') renderLeads();
    else renderActivity();
    if (window.lucide) lucide.createIcons();
  }

  document.addEventListener('DOMContentLoaded', async function () {
    await LF.renderLayout({ active: 'reports' });
    await loadAll();
    render();
  });
})();
