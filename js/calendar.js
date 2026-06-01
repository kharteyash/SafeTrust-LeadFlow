// Calendar page: Day View, Week View, and Meetings (grouped by type).
(function () {
  const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]; // 8 AM – 6 PM
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  // ----- Date helpers (local-time safe) -----
  function parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function toKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }
  function sameDay(a, b) { return toKey(a) === toKey(b); }
  function startOfWeek(date) { return addDays(date, -date.getDay()); } // Sunday
  function weekDays(date) {
    const s = startOfWeek(date);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }
  function fmtDayLong(date) {
    return `${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }
  function fmtTime(hhmm) {
    let [h, m] = hhmm.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ap}`;
  }
  function fmtRange(s, e) {
    const nextDay = e < s ? ' (next day)' : '';
    return `${fmtTime(s)} – ${fmtTime(e)}${nextDay}`;
  }
  function startHour(ev) { return parseInt(ev.start.split(':')[0], 10); }
  function addHour(hhmm) {
    let [h, m] = hhmm.split(':').map(Number);
    h = Math.min(h + 1, 23);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  function nowHHMM(d) { return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

  // Today, normalized to local midnight.
  const _n = new Date();
  const TODAY = new Date(_n.getFullYear(), _n.getMonth(), _n.getDate());

  // ----- Type styling -----
  function typeStyle(type) {
    if (type === 'meeting')  return { bg: '#EFEAFF', fg: '#6D5BFF', label: 'Meeting',   icon: 'users' };
    if (type === 'call')     return { bg: '#E7EEFF', fg: '#2B57D9', label: 'Call',      icon: 'phone' };
    if (type === 'followup') return { bg: '#E6F8EC', fg: '#138A4B', label: 'Follow-up', icon: 'repeat' };
    return { bg: 'var(--chip)', fg: '#5C5C75', label: 'Event', icon: 'calendar' };
  }

  // Working event list = the user's saved events (DB only).
  // Each gets a client-side _uid so delete buttons can reference any event.
  let uidCounter = 0;
  function withUid(e) { return Object.assign({ _uid: ++uidCounter }, e); }
  let events = [];
  let tasks = [];

  function eventsOn(date) {
    const key = toKey(date);
    return events
      .filter(e => e.date === key)
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  // ----- Tasks on the calendar (shown as all-day items on their due date) -----
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function openTasksOn(date) {
    const key = toKey(date);
    return tasks.filter(t => t.status !== 'done' && t.due === key);
  }
  function taskColor(p) { return p === 'High' ? '#D63333' : p === 'Medium' ? '#B07A00' : '#5C5C75'; }
  function taskPill(p) { return p === 'High' ? 'pill-red' : p === 'Medium' ? 'pill-yellow' : 'pill-gray'; }
  // A clickable all-day task chip (links to the Tasks page).
  function taskChip(t, compact, withDate) {
    const pc = taskColor(t.priority);
    if (compact) {
      return `<a href="tasks.html" title="${escAttr(t.title)} — ${esc(t.priority)}"
        class="rounded-md px-2 py-1 mb-1 flex items-center gap-1" style="background:var(--surface-3);border-left:3px solid ${pc};">
        <i data-lucide="check-square" style="width:10px;height:10px;color:${pc};flex-shrink:0;pointer-events:none;"></i>
        <span class="text-[10.5px] font-medium truncate">${esc(t.title)}</span>
      </a>`;
    }
    const d = parseDate(t.due);
    const dateLabel = sameDay(d, TODAY) ? 'Today' : `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
    return `<a href="tasks.html" class="rounded-lg px-3 py-2 flex items-center gap-2" style="background:var(--surface-3);border-left:3px solid ${pc};">
      <i data-lucide="check-square" style="width:14px;height:14px;color:${pc};flex-shrink:0;pointer-events:none;"></i>
      <span class="text-[12.5px] font-semibold truncate">${esc(t.title)}</span>
      ${withDate
        ? `<span class="text-[11px] text-muted ml-auto flex-shrink-0">${dateLabel}</span>`
        : `<span class="pill ${taskPill(t.priority)} ml-auto" style="font-size:10px;flex-shrink:0;">${esc(t.priority)}</span>`}
    </a>`;
  }

  // Hour rows to render: the default 8 AM–6 PM window, expanded to include
  // any events that start earlier or later (e.g. an 8 PM meeting).
  function hoursForEvents(list) {
    let min = HOURS[0];
    let max = HOURS[HOURS.length - 1];
    list.forEach(e => {
      const h = startHour(e);
      if (h < min) min = h;
      if (h > max) max = h;
    });
    const out = [];
    for (let h = min; h <= max; h++) out.push(h);
    return out;
  }

  const TABS = [
    { id: 'day',      label: 'Day View' },
    { id: 'week',     label: 'Week View' },
    { id: 'meetings', label: 'Meetings' }
  ];

  const state = { view: 'day', cursor: new Date(TODAY) };

  // ----- Tabs -----
  function renderTabs() {
    document.getElementById('cal-tabs').innerHTML = TABS.map(t => `
      <div class="tab ${state.view === t.id ? 'active' : ''}" data-view="${t.id}">${t.label}</div>
    `).join('');
    document.querySelectorAll('#cal-tabs .tab').forEach(el => {
      el.addEventListener('click', () => {
        state.view = el.dataset.view;
        state.cursor = new Date(TODAY);
        render();
      });
    });
  }

  // ----- Toolbar (nav buttons + label) -----
  function renderToolbar() {
    const bar = document.getElementById('cal-toolbar');
    if (state.view === 'meetings') { bar.innerHTML = ''; return; }

    let label;
    if (state.view === 'day') {
      label = fmtDayLong(state.cursor);
    } else {
      const days = weekDays(state.cursor);
      const a = days[0], b = days[6];
      const left = `${MONTHS[a.getMonth()].slice(0,3)} ${a.getDate()}`;
      const right = a.getMonth() === b.getMonth()
        ? `${b.getDate()}, ${b.getFullYear()}`
        : `${MONTHS[b.getMonth()].slice(0,3)} ${b.getDate()}, ${b.getFullYear()}`;
      label = `${left} – ${right}`;
    }

    bar.innerHTML = `
      <button class="btn-icon" data-nav="prev" style="width:32px;height:32px;">
        <i data-lucide="chevron-left" style="width:15px;height:15px;color:var(--text-muted);"></i>
      </button>
      <span class="text-[13.5px] font-semibold px-2 min-w-[180px] text-center">${label}</span>
      <button class="btn-icon" data-nav="next" style="width:32px;height:32px;">
        <i data-lucide="chevron-right" style="width:15px;height:15px;color:var(--text-muted);"></i>
      </button>
      <button class="btn-secondary" data-nav="today" style="padding:6px 12px;font-size:12.5px;">Today</button>
    `;

    bar.querySelectorAll('button[data-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        const step = state.view === 'day' ? 1 : 7;
        if (btn.dataset.nav === 'prev')  state.cursor = addDays(state.cursor, -step);
        if (btn.dataset.nav === 'next')  state.cursor = addDays(state.cursor, step);
        if (btn.dataset.nav === 'today') state.cursor = new Date(TODAY);
        render();
      });
    });
  }

  // ----- Event block (used in day/week grids) -----
  function eventBlock(ev, compact) {
    const s = typeStyle(ev.type);
    if (compact) {
      return `
        <div class="rounded-md px-2 py-1 mb-1" style="position:relative;background:${s.bg};border-left:3px solid ${s.fg};">
          <button data-delete-uid="${ev._uid}" title="Remove event"
                  style="position:absolute;top:1px;right:1px;width:15px;height:15px;display:flex;align-items:center;justify-content:center;color:${s.fg};opacity:.65;">
            <i data-lucide="x" style="width:10px;height:10px;pointer-events:none;"></i>
          </button>
          <div class="text-[11px] font-semibold truncate" style="color:${s.fg};padding-right:12px;">${ev.title}</div>
          <div class="text-[10px]" style="color:${s.fg};opacity:.8;">${fmtTime(ev.start)}</div>
        </div>`;
    }
    return `
      <div class="rounded-lg px-3 py-2" style="background:${s.bg};border-left:3px solid ${s.fg};">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[13px] font-semibold" style="color:${s.fg};">${ev.title}</span>
          <div class="flex items-center gap-1.5">
            <span class="pill" style="background:var(--surface);color:${s.fg};font-size:10.5px;">${s.label}</span>
            <button data-delete-uid="${ev._uid}" title="Remove event" class="btn-icon"
                    style="width:26px;height:26px;border:none;background:transparent;">
              <i data-lucide="trash-2" style="width:13px;height:13px;color:${s.fg};pointer-events:none;"></i>
            </button>
          </div>
        </div>
        <div class="text-[12px] mt-0.5" style="color:${s.fg};opacity:.85;">
          ${fmtRange(ev.start, ev.end)} · ${ev.with}
        </div>
      </div>`;
  }

  // ----- Day View -----
  function renderDay() {
    const dayEvents = eventsOn(state.cursor);
    const rows = hoursForEvents(dayEvents).map(h => {
      const evs = dayEvents.filter(e => startHour(e) === h);
      return `
        <div class="flex" style="border-top:1px solid var(--border-soft);min-height:56px;">
          <div class="w-[72px] flex-shrink-0 pt-2 pr-3 text-right text-[11.5px] text-soft">${fmtTime(h + ':00')}</div>
          <div class="flex-1 py-2 pl-3" style="border-left:1px solid var(--border-soft);">
            ${evs.map(e => eventBlock(e, false)).join('') || ''}
          </div>
        </div>`;
    }).join('');

    const dayTasks = openTasksOn(state.cursor);
    const allDay = dayTasks.length ? `
      <div class="rounded-xl p-3 mb-3" style="border:1px solid var(--border);">
        <div class="text-[12px] font-semibold text-muted mb-2 flex items-center gap-1.5">
          <i data-lucide="check-square" style="width:13px;height:13px;"></i> Tasks due (${dayTasks.length})
        </div>
        <div class="flex flex-col gap-1.5">${dayTasks.map(t => taskChip(t, false, false)).join('')}</div>
      </div>` : '';

    const total = dayEvents.length;
    document.getElementById('cal-body').innerHTML = `
      <div class="mb-3 text-[12.5px] text-muted">${total} event${total === 1 ? '' : 's'} scheduled</div>
      ${allDay}
      <div class="rounded-xl overflow-hidden" style="border:1px solid var(--border);">${rows}</div>
    `;
  }

  // ----- Week View -----
  function renderWeek() {
    const days = weekDays(state.cursor);
    const weekEvents = days.reduce((acc, d) => acc.concat(eventsOn(d)), []);

    const header = `
      <div style="display:grid;grid-template-columns:60px repeat(7,1fr);">
        <div></div>
        ${days.map(d => {
          const today = sameDay(d, TODAY);
          return `
            <div class="text-center py-2" style="border-left:1px solid var(--border-soft);">
              <div class="text-[11px] text-soft">${DOW[d.getDay()]}</div>
              <div class="text-[15px] font-semibold mt-0.5 mx-auto ${today ? 'text-white' : ''}"
                   style="${today ? 'background:#6D5BFF;width:28px;height:28px;border-radius:999px;display:flex;align-items:center;justify-content:center;' : ''}">
                ${d.getDate()}
              </div>
            </div>`;
        }).join('')}
      </div>`;

    const anyTasks = days.some(d => openTasksOn(d).length);
    const allDayRow = anyTasks ? `
      <div style="display:grid;grid-template-columns:60px repeat(7,1fr);border-top:1px solid var(--border-soft);background:var(--surface-2);">
        <div class="pt-1 pr-2 text-right text-[10.5px] text-soft">Tasks</div>
        ${days.map(d => `<div class="p-1" style="border-left:1px solid var(--border-soft);">${openTasksOn(d).map(t => taskChip(t, true)).join('')}</div>`).join('')}
      </div>` : '';

    const rows = hoursForEvents(weekEvents).map(h => `
      <div style="display:grid;grid-template-columns:60px repeat(7,1fr);border-top:1px solid var(--border-soft);min-height:54px;">
        <div class="pt-1 pr-2 text-right text-[11px] text-soft">${fmtTime(h + ':00')}</div>
        ${days.map(d => {
          const evs = eventsOn(d).filter(e => startHour(e) === h);
          return `<div class="p-1" style="border-left:1px solid var(--border-soft);">${evs.map(e => eventBlock(e, true)).join('')}</div>`;
        }).join('')}
      </div>`).join('');

    document.getElementById('cal-body').innerHTML = `
      <div class="overflow-x-auto">
        <div style="min-width:760px;">
          ${header}
          ${allDayRow}
          ${rows}
        </div>
      </div>
    `;
  }

  // ----- Meetings (grouped by type) -----
  function renderMeetings() {
    const upcoming = events
      .filter(e => parseDate(e.date).getTime() >= TODAY.getTime())
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

    const groups = [
      { type: 'meeting',  title: 'Customer Meetings' },
      { type: 'call',     title: 'Calls' },
      { type: 'followup', title: 'Follow-ups' }
    ];

    const cols = groups.map(g => {
      const s = typeStyle(g.type);
      const items = upcoming.filter(e => e.type === g.type);
      const list = items.length ? items.map(e => {
        const d = parseDate(e.date);
        const dayLabel = sameDay(d, TODAY) ? 'Today' : `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()].slice(0,3)} ${d.getDate()}`;
        return `
          <div class="rounded-lg p-3 mb-2" style="border:1px solid var(--border);">
            <div class="flex items-start justify-between gap-2">
              <div class="text-[13px] font-semibold">${e.title}</div>
              <button data-delete-uid="${e._uid}" title="Remove event" class="btn-icon"
                      style="width:26px;height:26px;border:none;background:transparent;flex-shrink:0;">
                <i data-lucide="trash-2" style="width:13px;height:13px;color:#D63333;pointer-events:none;"></i>
              </button>
            </div>
            <div class="flex items-center gap-2 text-[12px] text-muted mt-1">
              <i data-lucide="calendar" style="width:12px;height:12px;"></i>${dayLabel}
              <span class="text-soft">·</span>
              <i data-lucide="clock" style="width:12px;height:12px;"></i>${fmtRange(e.start, e.end)}
            </div>
            <div class="flex items-center gap-1.5 text-[12px] text-muted mt-1">
              <i data-lucide="user" style="width:12px;height:12px;"></i>${e.with}
            </div>
          </div>`;
      }).join('') : `<div class="text-[12.5px] text-soft py-4 text-center">Nothing scheduled.</div>`;

      return `
        <div class="col-span-12 md:col-span-4">
          <div class="flex items-center gap-2 mb-3">
            <span class="stat-icon" style="background:${s.bg};width:30px;height:30px;border-radius:8px;">
              <i data-lucide="${s.icon}" style="width:15px;height:15px;color:${s.fg};"></i>
            </span>
            <h3 class="text-[14.5px] font-semibold">${g.title}</h3>
            <span class="pill pill-gray" style="font-size:11px;">${items.length}</span>
          </div>
          ${list}
        </div>`;
    }).join('');

    // Upcoming open tasks (due today or later), shown below the meeting columns.
    const upcomingTasks = tasks
      .filter(t => t.status !== 'done' && t.due && parseDate(t.due).getTime() >= TODAY.getTime())
      .sort((a, b) => a.due.localeCompare(b.due));
    const tasksSection = `
      <div class="mt-6">
        <div class="flex items-center gap-2 mb-3">
          <span class="stat-icon" style="background:#EFEAFF;width:30px;height:30px;border-radius:8px;">
            <i data-lucide="check-square" style="width:15px;height:15px;color:#6D5BFF;"></i>
          </span>
          <h3 class="text-[14.5px] font-semibold">Upcoming Tasks</h3>
          <span class="pill pill-gray" style="font-size:11px;">${upcomingTasks.length}</span>
        </div>
        ${upcomingTasks.length
          ? `<div class="grid grid-cols-12 gap-2">${upcomingTasks.map(t => `<div class="col-span-12 md:col-span-6 lg:col-span-4">${taskChip(t, false, true)}</div>`).join('')}</div>`
          : `<div class="text-[12.5px] text-soft">No upcoming tasks.</div>`}
      </div>`;

    document.getElementById('cal-body').innerHTML = `<div class="grid grid-cols-12 gap-5">${cols}</div>${tasksSection}`;
  }

  // ----- Render dispatcher -----
  function render() {
    renderTabs();
    renderToolbar();
    if (state.view === 'day')      renderDay();
    else if (state.view === 'week') renderWeek();
    else                            renderMeetings();
    if (window.lucide) lucide.createIcons();
  }

  // ----- Load the user's saved events + tasks from the DB -----
  async function loadEvents() {
    try {
      const res = await fetch('/api/events', { credentials: 'same-origin' });
      if (res.ok) {
        const saved = await res.json();
        events = saved.map(withUid);
      }
    } catch (e) { events = []; }
  }
  async function loadTasks() {
    try {
      const res = await fetch('/api/tasks', { credentials: 'same-origin' });
      tasks = res.ok ? await res.json() : [];
    } catch (e) { tasks = []; }
  }

  // ----- Delete an event -----
  async function deleteEvent(uid) {
    const idx = events.findIndex(e => String(e._uid) === String(uid));
    if (idx === -1) return;
    const ev = events[idx];

    if (!window.confirm(`Remove "${ev.title}"?`)) return;

    // Events created by the user have a DB id — delete them server-side too.
    if (ev.id) {
      try {
        const res = await fetch('/api/events/' + ev.id, { method: 'DELETE', credentials: 'same-origin' });
        if (!res.ok && res.status !== 404) {
          window.alert('Could not remove the event. Please try again.');
          return;
        }
      } catch (e) {
        window.alert('Network error while removing the event.');
        return;
      }
    }

    events.splice(idx, 1);
    render();
  }

  function bindDelete() {
    // Delegated — survives #cal-body re-renders.
    document.getElementById('cal-body').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-delete-uid]');
      if (!btn) return;
      deleteEvent(btn.getAttribute('data-delete-uid'));
    });
  }

  // ----- New event modal -----
  function openModal() {
    const modal = document.getElementById('event-modal');
    const form = document.getElementById('event-form');
    form.reset();

    const now = new Date();
    const todayStr = toKey(now);
    // Default to the day being viewed, but never earlier than today.
    const cursorStr = toKey(state.view === 'meetings' ? TODAY : state.cursor);
    const dateVal = cursorStr >= todayStr ? cursorStr : todayStr;

    const dateEl = form.elements['date'];
    dateEl.value = dateVal;
    dateEl.min = todayStr; // browser blocks earlier dates in the picker

    // Pick a start time that isn't already in the past when the date is today.
    let startVal = '09:00';
    if (dateVal === todayStr && startVal <= nowHHMM(now)) {
      const h = Math.min(now.getHours() + 1, 22);
      startVal = `${String(h).padStart(2, '0')}:00`;
    }
    form.elements['start'].value = startVal;
    form.elements['end'].value = addHour(startVal);

    document.getElementById('event-form-msg').textContent = '';
    modal.classList.remove('hidden');
    form.elements['title'].focus();
  }
  function closeModal() {
    document.getElementById('event-modal').classList.add('hidden');
  }

  function bindModal() {
    document.getElementById('new-event-btn').addEventListener('click', openModal);
    document.getElementById('event-modal-close').addEventListener('click', closeModal);
    document.getElementById('event-cancel').addEventListener('click', closeModal);
    document.getElementById('event-modal-backdrop').addEventListener('click', closeModal);

    const form = document.getElementById('event-form');
    const msg = document.getElementById('event-form-msg');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = '';
      const data = Object.fromEntries(new FormData(form));

      if (!data.title.trim()) { msg.textContent = 'Title is required.'; return; }

      const now = new Date();
      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const selDate = parseDate(data.date);
      if (selDate.getTime() < todayMidnight.getTime()) {
        msg.textContent = 'Date cannot be in the past.'; return;
      }
      if (selDate.getTime() === todayMidnight.getTime()) {
        const [sh, sm] = data.start.split(':').map(Number);
        const startDt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm);
        if (startDt.getTime() <= now.getTime()) {
          msg.textContent = 'Start time cannot be in the past.'; return;
        }
      }
      if (data.end === data.start) { msg.textContent = 'End time must be different from the start time.'; return; }

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.style.opacity = '0.7';

      try {
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            title: data.title, type: data.type, with: data.with || '',
            date: data.date, start: data.start, end: data.end
          })
        });
        const raw = await res.text();
        let body = {};
        try { body = raw ? JSON.parse(raw) : {}; } catch (err) { /* non-JSON */ }

        if (!res.ok) {
          msg.textContent = body.error || `Request failed (HTTP ${res.status}).`;
          return;
        }

        events.push(withUid(body));
        closeModal();
        // Jump to the new event's date so it's visible in the current view.
        state.cursor = parseDate(body.date);
        render();
      } catch (err) {
        msg.textContent = 'Network error. Is the server running?';
      } finally {
        btn.disabled = false;
        btn.style.opacity = '';
      }
    });
  }

  // ----- Mount -----
  document.addEventListener('DOMContentLoaded', async function () {
    await LF.renderLayout({ active: 'calendar' });
    await Promise.all([loadEvents(), loadTasks()]);
    bindModal();
    bindDelete();
    render();
  });
})();
