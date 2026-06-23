// Tasks page: real per-user tasks (Postgres-backed CRUD).
(function () {
  let tasks = [];
  let queue = [], callLog = [], leads = [];
  const queuedLeadIds = new Set(); // leads added to the queue from here this session
  let editingId = null;            // task being edited, if any
  let assignInfo = { canAssign: false, canAssignAll: false, targets: [] };
  let assignedTasks = [];           // tasks this leader/admin assigned to others
  const assignSelected = new Set(); // ids chosen in the assign modal
  const state = { tab: 'all' };

  function isOverdueTask(t) { return t.status !== 'done' && t.due && t.due < todayStr(); }

  const TABS = [
    { id: 'all',       label: 'All',       match: () => true },
    { id: 'open',      label: 'Open',      match: t => t.status !== 'done' },
    { id: 'today',     label: 'Due today', match: t => t.status !== 'done' && isDueToday(t.due) },
    { id: 'overdue',   label: 'Overdue',   match: t => isOverdueTask(t) },
    { id: 'completed', label: 'Completed', match: t => t.status === 'done' },
    { id: 'assigned',  label: 'Assigned',  leaderOnly: true } // tasks I assigned to others
  ];
  function visibleTabs() { return TABS.filter(t => !t.leaderOnly || assignInfo.canAssign); }
  function tabCount(t) { return t.id === 'assigned' ? assignedTasks.length : tasks.filter(t.match).length; }

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function initials(name) { return (name || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?'; }
  function waLink(phone) { return LF.waLink(phone); }
  function scorePill(s) { return s >= 80 ? 'pill-green' : s >= 60 ? 'pill-yellow' : 'pill-red'; }

  // ----- Call-queue time helpers (mirror the Calls page) -----
  function queueTimeMinutes(label) {
    const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(label || '');
    if (!m) return Infinity;
    let h = parseInt(m[1], 10) % 12;
    if (/PM/i.test(m[3])) h += 12;
    return h * 60 + parseInt(m[2], 10);
  }
  function nowMinutes() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }
  function qItemDate(c) { return (c.date && c.date.trim()) || todayStr(); }
  function isQueueOverdue(c) {
    const d = qItemDate(c), today = todayStr();
    if (d < today) return true;
    if (d > today) return false;
    const t = queueTimeMinutes(c.time);
    return t !== Infinity && t < nowMinutes();
  }

  // ----- Date helpers -----
  function pad(n) { return String(n).padStart(2, '0'); }
  function todayStr() { const n = new Date(); return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`; }
  function parseLocalDate(str) { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); }
  function dueMeta(dateStr, status) {
    if (!dateStr) return { label: 'No date', pill: 'pill-gray' };
    const d = parseLocalDate(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((d - today) / 86400000);
    const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const label = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : `${M[d.getMonth()]} ${d.getDate()}`;
    if (status === 'done') return { label, pill: 'pill-gray' };
    if (diff < 0) return { label: label + ' (overdue)', pill: 'pill-red' };
    if (diff === 0) return { label, pill: 'pill-red' };
    if (diff === 1) return { label, pill: 'pill-yellow' };
    return { label, pill: 'pill-blue' };
  }
  function isDueToday(dateStr) {
    if (!dateStr) return false;
    const d = parseLocalDate(dateStr), now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }
  function priorityPill(p) { return p === 'High' ? 'pill-red' : p === 'Medium' ? 'pill-yellow' : 'pill-gray'; }

  // ----- Load -----
  async function load() {
    const get = async (u) => { try { const r = await fetch(u, { credentials: 'same-origin' }); return r.ok ? await r.json() : []; } catch (e) { return []; } };
    [tasks, queue, callLog, leads] = await Promise.all([
      get('/api/tasks'), get('/api/call-queue'), get('/api/call-log'), get('/api/leads')
    ]);
    try {
      const r = await fetch('/api/task-assign-targets', { credentials: 'same-origin' });
      if (r.ok) assignInfo = await r.json();
    } catch (e) {}
    await loadAssigned();
  }
  async function loadAssigned() {
    if (!assignInfo.canAssign) { assignedTasks = []; return; }
    try { const r = await fetch('/api/tasks/assigned', { credentials: 'same-origin' }); assignedTasks = r.ok ? await r.json() : []; }
    catch (e) { assignedTasks = []; }
  }

  // ----- Stats -----
  function renderStats() {
    const open = tasks.filter(t => t.status !== 'done').length;
    const dueToday = tasks.filter(t => t.status !== 'done' && isDueToday(t.due)).length;
    const overdue = tasks.filter(isOverdueTask).length;
    const done = tasks.filter(t => t.status === 'done').length;
    // Each card jumps to the matching tab in the task table below.
    const cards = [
      { label: 'Open',      value: open,     tab: 'open',      icon: 'list-checks',    tint: '#EFEAFF', color: '#2255a3' },
      { label: 'Due Today', value: dueToday, tab: 'today',     icon: 'alarm-clock',    tint: '#FFF4D6', color: '#B07A00' },
      { label: 'Overdue',   value: overdue,  tab: 'overdue',   icon: 'alert-triangle', tint: '#FEECEC', color: '#D63333' },
      { label: 'Completed', value: done,     tab: 'completed', icon: 'check-circle-2', tint: '#E6F8EC', color: '#138A4B' }
    ];
    document.getElementById('task-stats').innerHTML = cards.map(c => `
      <div class="stat-card" data-stat-tab="${c.tab}" role="button" tabindex="0" title="View ${c.label.toLowerCase()} tasks" style="cursor:pointer;">
        <div class="flex items-center gap-3 mb-3">
          <div class="stat-icon" style="background:${c.tint};">
            <i data-lucide="${c.icon}" style="width:18px;height:18px;color:${c.color};"></i>
          </div>
          <span class="text-[13px] text-muted font-medium">${c.label}</span>
        </div>
        <div class="text-[26px] font-bold tracking-tight leading-tight">${c.value}</div>
      </div>`).join('');
    document.querySelectorAll('#task-stats [data-stat-tab]').forEach(el => {
      const go = () => selectTab(el.getAttribute('data-stat-tab'));
      el.addEventListener('click', go);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  // Switch the task table to a tab and bring it into view (used by the stat cards).
  function selectTab(id) {
    if (!visibleTabs().some(t => t.id === id)) return;
    state.tab = id;
    renderTabs(); renderList();
    if (window.lucide) lucide.createIcons();
    const panel = document.getElementById('task-tabs');
    if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ----- Calls to make (derived live from the queue + uncalled leads) -----
  function callBtns(phone, withQueueLeadId) {
    const p = escAttr(phone || '');
    return `
      <button class="btn-icon" title="Call" data-call="${p}" style="width:30px;height:30px;" ${phone ? '' : 'disabled'}>
        <i data-lucide="phone" style="width:13px;height:13px;color:#2255a3;pointer-events:none;"></i>
      </button>
      <button class="btn-icon" title="WhatsApp" data-wa="${p}" style="width:30px;height:30px;" ${phone ? '' : 'disabled'}>
        <i data-lucide="message-circle" style="width:13px;height:13px;color:#138A4B;pointer-events:none;"></i>
      </button>
      ${withQueueLeadId != null ? `
      <button class="btn-icon" title="Add to call queue" data-queue-lead="${withQueueLeadId}" style="width:30px;height:30px;">
        <i data-lucide="list-plus" style="width:13px;height:13px;color:#2255a3;pointer-events:none;"></i>
      </button>` : ''}`;
  }

  function renderCallsToMake() {
    const host = document.getElementById('calls-to-make');
    const today = todayStr();

    // From the queue: today + carried-over, soonest first, overdue last.
    const qList = queue.filter(c => qItemDate(c) <= today).sort((a, b) => {
      const oa = isQueueOverdue(a), ob = isQueueOverdue(b);
      if (oa !== ob) return oa ? 1 : -1;
      return queueTimeMinutes(a.time) - queueTimeMinutes(b.time);
    });

    // Leads with no call logged yet and not already in the queue, hottest first.
    // Only the viewer's own leads — an admin's /api/leads returns every officer's
    // leads, so without this the admin would be told to call other LOs' leads.
    const calledNames = new Set(callLog.map(c => (c.name || '').toLowerCase()));
    const queuedNames = new Set(queue.map(c => (c.name || '').toLowerCase()));
    const lList = leads
      .filter(l => {
        if (!l.mine) return false;
        const n = (l.name || '').toLowerCase();
        return !calledNames.has(n) && !queuedNames.has(n) && !queuedLeadIds.has(l.id);
      })
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 8);

    const total = qList.length + lList.length;
    if (total === 0) { host.innerHTML = ''; return; }

    const qRows = qList.map(c => {
      const overdue = isQueueOverdue(c);
      return `
        <div class="flex items-center gap-3 px-3 py-2.5" style="border-bottom:1px solid var(--border-soft);">
          <div class="avatar avatar-sm">${initials(c.name)}</div>
          <div class="flex-1 min-w-0">
            <div class="text-[13px] font-semibold truncate">${esc(c.name)}</div>
            <div class="text-[11.5px] text-muted">${esc(c.time) || 'Any time'}${c.reason ? ' · ' + esc(c.reason) : ''}</div>
          </div>
          ${overdue ? '<span class="pill pill-red" style="font-size:10.5px;">Overdue</span>' : ''}
          ${callBtns(c.phone, null)}
        </div>`;
    }).join('');

    const lRows = lList.map(l => `
      <div class="flex items-center gap-3 px-3 py-2.5" style="border-bottom:1px solid var(--border-soft);">
        <div class="avatar avatar-sm">${initials(l.name)}</div>
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-semibold truncate">${esc(l.name)}</div>
          <div class="text-[11.5px] text-muted">${esc(l.phone) || 'No number'}${l.timeline ? ' · ' + esc(l.timeline) : ''}</div>
        </div>
        <span>${LF.scoreStarsHTML(l, 12)}</span>
        ${callBtns(l.phone, l.id)}
      </div>`).join('');

    host.innerHTML = `
      <div class="panel p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-[15px] font-semibold">Calls to make <span class="text-muted font-normal">(${total})</span></h3>
          <a href="calls.html" class="text-[12.5px] font-semibold" style="color:var(--accent);">Open Calls →</a>
        </div>
        ${qList.length ? `
          <div class="text-[12px] font-semibold text-muted mb-1 mt-1">Scheduled (${qList.length})</div>
          ${qRows}` : ''}
        ${lList.length ? `
          <div class="text-[12px] font-semibold text-muted mb-1 mt-3">Leads to call (${lList.length})</div>
          ${lRows}` : ''}
      </div>`;
    if (window.lucide) lucide.createIcons();
  }

  // ----- Tabs -----
  function renderTabs() {
    const tabsList = visibleTabs();
    if (!tabsList.some(t => t.id === state.tab)) state.tab = 'all';
    document.getElementById('task-tabs').innerHTML = tabsList.map(t => `
      <div class="tab ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}">
        ${t.label}
        <span class="ml-1.5 text-[11px] font-semibold rounded-full px-1.5 py-[1px]"
              style="background:${state.tab === t.id ? 'rgba(34,85,163,0.12)' : 'var(--chip)'};color:${state.tab === t.id ? '#2255a3' : 'var(--text-muted)'};">${tabCount(t)}</span>
      </div>`).join('');
    document.querySelectorAll('#task-tabs .tab').forEach(el => {
      el.addEventListener('click', () => { state.tab = el.dataset.tab; renderTabs(); renderList(); });
    });
  }

  // ----- List -----
  function renderList() {
    const list = document.getElementById('task-list');

    // "Assigned" tab — tasks the leader/admin handed to others (read-only tracking).
    if (state.tab === 'assigned') {
      if (!assignedTasks.length) {
        list.innerHTML = `<div class="text-center py-12 text-muted text-[13px]">You haven’t assigned any tasks yet. Use “Assign Task” above.</div>`;
        return;
      }
      list.innerHTML = assignedTasks.map(t => {
        const done = t.status === 'done';
        const dm = dueMeta(t.due, t.status);
        return `
          <div class="flex items-center gap-3 px-3 py-3 rounded-lg" style="border-bottom:1px solid var(--border-soft);">
            <div class="flex-1 min-w-0">
              <div class="text-[13.5px] font-medium" style="${done ? 'color:#8A8AA0;text-decoration:line-through;' : ''}">${esc(t.title)} <span class="pill pill-blue" style="font-size:10px;">To ${esc(t.assigneeName)}</span></div>
              <div class="mt-1">
                <span class="pill ${dm.pill}" style="font-size:11px;padding:2px 8px;">
                  <i data-lucide="calendar" style="width:11px;height:11px;margin-right:3px;"></i>${dm.label}
                </span>
              </div>
            </div>
            <span class="pill ${priorityPill(t.priority)}" ${t.autoHigh ? `title="Auto-High: ${esc(t.autoReason)}"` : ''}>${esc(t.priority)}${t.autoHigh ? ' ⚡' : ''}</span>
            <span class="pill ${done ? 'pill-green' : 'pill-gray'}" style="font-size:11px;">${done ? 'Completed' : 'In progress'}</span>
          </div>`;
      }).join('');
      if (window.lucide) lucide.createIcons();
      return;
    }

    const tab = TABS.find(t => t.id === state.tab);
    const items = tasks.filter(tab.match);

    if (tasks.length === 0) {
      list.innerHTML = `
        <div class="text-center py-16">
          <div class="mx-auto mb-3 stat-icon" style="background:var(--surface-3);width:48px;height:48px;border-radius:12px;">
            <i data-lucide="check-square" style="width:22px;height:22px;color:#8A8AA0;"></i>
          </div>
          <div class="text-[14px] font-semibold mb-1">No tasks yet</div>
          <div class="text-[13px] text-muted mb-4">Add your first task to stay on top of follow-ups.</div>
          <button class="btn-primary" onclick="document.getElementById('add-task-btn').click()">
            <i data-lucide="plus" style="width:14px;height:14px;"></i> Add Task
          </button>
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    if (items.length === 0) {
      list.innerHTML = `<div class="text-center py-12 text-muted text-[13px]">Nothing in this view.</div>`;
      return;
    }

    list.innerHTML = items.map(t => {
      const done = t.status === 'done';
      const dm = dueMeta(t.due, t.status);
      return `
        <div class="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-[#FAFAFC]" style="border-bottom:1px solid var(--border-soft);">
          <button data-toggle="${t.id}" class="flex items-center justify-center flex-shrink-0"
                  style="width:20px;height:20px;border-radius:6px;background:${done ? '#2255a3' : 'var(--surface)'};border:1.5px solid ${done ? '#2255a3' : 'var(--border-strong)'};">
            ${done ? '<i data-lucide="check" style="width:12px;height:12px;color:#FFF;pointer-events:none;"></i>' : ''}
          </button>
          <div class="flex-1 min-w-0">
            <div class="text-[13.5px] font-medium" style="${done ? 'color:#8A8AA0;text-decoration:line-through;' : ''}">${esc(t.title)}${t.assignedByName ? ` <span class="pill pill-blue" style="font-size:10px;">From ${esc(t.assignedByName)}</span>` : ''}</div>
            <div class="mt-1">
              <span class="pill ${dm.pill}" style="font-size:11px;padding:2px 8px;">
                <i data-lucide="calendar" style="width:11px;height:11px;margin-right:3px;"></i>${dm.label}
              </span>
            </div>
          </div>
          <span class="pill ${priorityPill(t.priority)}" ${t.autoHigh ? `title="Auto-High: ${esc(t.autoReason)}"` : ''}>${esc(t.priority)}${t.autoHigh ? ' ⚡' : ''}</span>
          <button data-edit="${t.id}" class="btn-icon" title="Edit task" style="width:30px;height:30px;">
            <i data-lucide="pencil" style="width:13px;height:13px;color:var(--text-muted);pointer-events:none;"></i>
          </button>
          <button data-del="${t.id}" class="btn-icon" title="Delete task" style="width:30px;height:30px;border:none;">
            <i data-lucide="trash-2" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i>
          </button>
        </div>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
  }

  // ----- Modal (add + edit) -----
  function openModal(task) {
    editingId = task ? task.id : null;
    const form = document.getElementById('task-form');
    form.reset();
    if (task) {
      document.getElementById('task-modal-title').textContent = 'Edit task';
      document.getElementById('task-submit').textContent = 'Save changes';
      form.elements['title'].value = task.title || '';
      form.elements['due'].value = task.due || '';
      // Show the user's chosen priority, not the auto-escalated display value.
      form.elements['priority'].value = task.basePriority || task.priority || 'Medium';
      form.elements['due'].min = ''; // keep an existing (possibly past) date
    } else {
      document.getElementById('task-modal-title').textContent = 'Add task';
      document.getElementById('task-submit').textContent = 'Add task';
      form.elements['priority'].value = 'Medium';
      form.elements['due'].min = todayStr(); // block past dates for new tasks
    }
    document.getElementById('task-form-msg').textContent = '';
    document.getElementById('task-modal').classList.remove('hidden');
    form.elements['title'].focus();
  }
  function closeModal() { document.getElementById('task-modal').classList.add('hidden'); editingId = null; }

  // ----- Assign task (team leaders / admin) — searchable multi-select -----
  function assignFilteredTargets() {
    const term = (document.getElementById('assign-search').value || '').trim().toLowerCase();
    return assignInfo.targets.filter(t =>
      !term || t.name.toLowerCase().includes(term) || t.role.toLowerCase().includes(term));
  }
  function updateAssignCount() {
    const el = document.getElementById('assign-selected-count');
    if (el) el.textContent = assignSelected.size ? `${assignSelected.size} selected` : 'No one selected yet';
  }
  function renderAssignList() {
    const host = document.getElementById('assign-list');
    if (!assignInfo.targets.length) {
      host.innerHTML = '<div class="px-3 py-3 text-[12.5px] text-muted">No one to assign to.</div>';
      return;
    }
    const list = assignFilteredTargets();
    const allChecked = list.length > 0 && list.every(t => assignSelected.has(t.id));
    const term = (document.getElementById('assign-search').value || '').trim();
    host.innerHTML = `
      <label class="flex items-center gap-2 px-3 py-2 cursor-pointer" style="border-bottom:1px solid var(--border-soft);background:var(--surface-2);">
        <input type="checkbox" id="assign-all" ${allChecked ? 'checked' : ''} style="accent-color:#2255a3;" />
        <span class="text-[12.5px] font-semibold">Select all${term ? ' matching' : ''} (${list.length})</span>
      </label>
      ${list.length ? list.map(t => `
        <label class="flex items-center gap-2 px-3 py-2 cursor-pointer" style="border-bottom:1px solid var(--border-soft);">
          <input type="checkbox" data-assignee="${t.id}" ${assignSelected.has(t.id) ? 'checked' : ''} style="accent-color:#2255a3;" />
          <span class="flex-1 text-[13px] truncate">${esc(t.name)}</span>
          <span class="text-[11.5px] text-muted">${esc(t.role)}</span>
        </label>`).join('') : '<div class="px-3 py-3 text-[12.5px] text-muted">No matches.</div>'}`;
    updateAssignCount();
  }
  function openAssignModal() {
    const form = document.getElementById('assign-form');
    form.reset();
    assignSelected.clear();
    document.getElementById('assign-search').value = '';
    renderAssignList();
    form.elements['priority'].value = 'Medium';
    form.elements['due'].min = todayStr();
    document.getElementById('assign-form-msg').textContent = '';
    document.getElementById('assign-modal').classList.remove('hidden');
    form.elements['title'].focus();
  }
  function closeAssignModal() { document.getElementById('assign-modal').classList.add('hidden'); }
  function bindAssign() {
    const btn = document.getElementById('assign-task-btn');
    if (assignInfo.canAssign) btn.classList.remove('hidden');
    btn.addEventListener('click', openAssignModal);
    document.getElementById('assign-modal-close').addEventListener('click', closeAssignModal);
    document.getElementById('assign-cancel').addEventListener('click', closeAssignModal);
    document.getElementById('assign-modal-backdrop').addEventListener('click', closeAssignModal);
    document.getElementById('assign-search').addEventListener('input', renderAssignList);
    document.getElementById('assign-list').addEventListener('change', e => {
      if (e.target.id === 'assign-all') {
        const list = assignFilteredTargets();
        if (e.target.checked) list.forEach(t => assignSelected.add(t.id));
        else list.forEach(t => assignSelected.delete(t.id));
        renderAssignList();
        return;
      }
      const cb = e.target.closest('[data-assignee]');
      if (cb) {
        const id = Number(cb.getAttribute('data-assignee'));
        if (cb.checked) assignSelected.add(id); else assignSelected.delete(id);
        renderAssignList();
      }
    });

    const form = document.getElementById('assign-form');
    const msg = document.getElementById('assign-form-msg');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      msg.textContent = '';
      const data = Object.fromEntries(new FormData(form));
      if (!data.title.trim()) { msg.textContent = 'Title is required.'; return; }
      if (!assignSelected.size) { msg.textContent = 'Select at least one person to assign to.'; return; }
      const payload = { title: data.title, due: data.due || '', priority: data.priority, assigneeIds: Array.from(assignSelected) };
      const sbtn = document.getElementById('assign-submit');
      sbtn.disabled = true; sbtn.style.opacity = '0.7';
      try {
        const res = await fetch('/api/tasks/assign', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify(payload)
        });
        const raw = await res.text(); let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (err) {}
        if (!res.ok) { msg.textContent = body.error || `Request failed (HTTP ${res.status}).`; return; }
        closeAssignModal();
        await loadAssigned();
        renderTabs(); renderList(); if (window.lucide) lucide.createIcons();
        window.alert(`Task assigned to ${body.assigned} ${body.assigned === 1 ? 'person' : 'people'}.`);
      } catch (err) {
        msg.textContent = 'Network error. Is the server running?';
      } finally {
        sbtn.disabled = false; sbtn.style.opacity = '';
      }
    });
  }

  function renderAll() { renderStats(); renderCallsToMake(); renderTabs(); renderList(); if (window.lucide) lucide.createIcons(); }

  function bind() {
    document.getElementById('add-task-btn').addEventListener('click', () => openModal(null));
    document.getElementById('task-modal-close').addEventListener('click', closeModal);
    document.getElementById('task-cancel').addEventListener('click', closeModal);
    document.getElementById('task-modal-backdrop').addEventListener('click', closeModal);
    bindAssign();

    // Calls-to-make actions: call (tel), WhatsApp, add lead to queue.
    document.getElementById('calls-to-make').addEventListener('click', async e => {
      const callBtn = e.target.closest('[data-call]');
      if (callBtn) { const tel = LF.telLink(callBtn.getAttribute('data-call')); if (tel) window.location.href = tel; return; }
      const waBtn = e.target.closest('[data-wa]');
      if (waBtn) { const ph = waBtn.getAttribute('data-wa'); if (ph) window.open(waLink(ph), '_blank'); return; }
      const qBtn = e.target.closest('[data-queue-lead]');
      if (qBtn) {
        const lead = leads.find(l => String(l.id) === qBtn.getAttribute('data-queue-lead'));
        if (!lead) return;
        qBtn.disabled = true;
        try {
          const res = await fetch('/api/call-queue', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify({ name: lead.name, phone: lead.phone || '', priority: 'Medium', time: '', date: todayStr(), reason: 'From Tasks' })
          });
          if (!res.ok) { qBtn.disabled = false; window.alert('Could not add to the queue.'); return; }
          const body = await res.json().catch(() => null);
          if (body) queue.unshift(body);
          queuedLeadIds.add(lead.id); // drop it from the "leads to call" list
          renderAll();
        } catch (err) { qBtn.disabled = false; window.alert('Network error.'); }
      }
    });

    // Delegated: toggle done + delete.
    document.getElementById('task-list').addEventListener('click', async e => {
      const toggle = e.target.closest('[data-toggle]');
      if (toggle) {
        const id = toggle.getAttribute('data-toggle');
        const t = tasks.find(x => String(x.id) === String(id));
        if (!t) return;
        const newStatus = t.status === 'done' ? 'todo' : 'done';
        try {
          const res = await fetch('/api/tasks/' + id, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify({ status: newStatus })
          });
          if (!res.ok) { window.alert('Could not update the task.'); return; }
        } catch (err) { window.alert('Network error.'); return; }
        t.status = newStatus;
        renderAll();
        return;
      }
      const edit = e.target.closest('[data-edit]');
      if (edit) {
        const t = tasks.find(x => String(x.id) === edit.getAttribute('data-edit'));
        if (t) openModal(t);
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) {
        const id = del.getAttribute('data-del');
        const t = tasks.find(x => String(x.id) === String(id));
        if (!t || !window.confirm(`Delete task "${t.title}"?`)) return;
        try {
          const res = await fetch('/api/tasks/' + id, { method: 'DELETE', credentials: 'same-origin' });
          if (!res.ok && res.status !== 404) { window.alert('Could not delete the task.'); return; }
        } catch (err) { window.alert('Network error.'); return; }
        tasks = tasks.filter(x => String(x.id) !== String(id));
        renderAll();
      }
    });

    const form = document.getElementById('task-form');
    const msg = document.getElementById('task-form-msg');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      msg.textContent = '';
      const data = Object.fromEntries(new FormData(form));
      if (!data.title.trim()) { msg.textContent = 'Title is required.'; return; }
      // Block past dates only for NEW tasks; editing may keep an existing past date.
      if (!editingId && data.due) {
        const now = new Date();
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (parseLocalDate(data.due).getTime() < todayMidnight.getTime()) {
          msg.textContent = 'Due date cannot be in the past.'; return;
        }
      }

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.style.opacity = '0.7';
      const payload = { title: data.title, due: data.due || '', priority: data.priority };
      try {
        if (editingId) {
          const res = await fetch('/api/tasks/' + editingId, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify(payload)
          });
          const raw = await res.text(); let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (err) {}
          if (!res.ok) { msg.textContent = body.error || `Request failed (HTTP ${res.status}).`; return; }
          const t = tasks.find(x => String(x.id) === String(editingId));
          if (t) { t.title = data.title.trim(); t.due = data.due || ''; t.priority = data.priority; }
          closeModal();
          renderAll();
        } else {
          const res = await fetch('/api/tasks', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify(payload)
          });
          const raw = await res.text(); let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (err) {}
          if (!res.ok) { msg.textContent = body.error || `Request failed (HTTP ${res.status}).`; return; }
          tasks.unshift(body);
          closeModal();
          state.tab = 'all';
          renderAll();
        }
      } catch (err) {
        msg.textContent = 'Network error. Is the server running?';
      } finally {
        btn.disabled = false; btn.style.opacity = '';
      }
    });
  }

  // ----- Mount -----
  document.addEventListener('DOMContentLoaded', async function () {
    await LF.renderLayout({ active: 'tasks' });
    await load();
    bind();
    renderAll();
  });
})();
