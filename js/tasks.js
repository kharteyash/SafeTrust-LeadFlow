// Tasks page: real per-user tasks (Postgres-backed CRUD).
(function () {
  let tasks = [];
  const state = { tab: 'all' };

  const TABS = [
    { id: 'all',       label: 'All',       match: () => true },
    { id: 'open',      label: 'Open',      match: t => t.status !== 'done' },
    { id: 'completed', label: 'Completed', match: t => t.status === 'done' }
  ];

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

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
    try {
      const res = await fetch('/api/tasks', { credentials: 'same-origin' });
      tasks = res.ok ? await res.json() : [];
    } catch (e) { tasks = []; }
  }

  // ----- Stats -----
  function renderStats() {
    const open = tasks.filter(t => t.status !== 'done').length;
    const dueToday = tasks.filter(t => t.status !== 'done' && isDueToday(t.due)).length;
    const done = tasks.filter(t => t.status === 'done').length;
    const cards = [
      { label: 'Open',      value: open,     icon: 'list-checks',    tint: '#EFEAFF', color: '#6D5BFF' },
      { label: 'Due Today', value: dueToday, icon: 'alarm-clock',    tint: '#FFF4D6', color: '#B07A00' },
      { label: 'Completed', value: done,     icon: 'check-circle-2', tint: '#E6F8EC', color: '#138A4B' }
    ];
    document.getElementById('task-stats').innerHTML = cards.map(c => `
      <div class="stat-card">
        <div class="flex items-center gap-3 mb-3">
          <div class="stat-icon" style="background:${c.tint};">
            <i data-lucide="${c.icon}" style="width:18px;height:18px;color:${c.color};"></i>
          </div>
          <span class="text-[13px] text-muted font-medium">${c.label}</span>
        </div>
        <div class="text-[26px] font-bold tracking-tight leading-tight">${c.value}</div>
      </div>`).join('');
  }

  // ----- Tabs -----
  function renderTabs() {
    const counts = {
      all: tasks.length,
      open: tasks.filter(t => t.status !== 'done').length,
      completed: tasks.filter(t => t.status === 'done').length
    };
    document.getElementById('task-tabs').innerHTML = TABS.map(t => `
      <div class="tab ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}">
        ${t.label}
        <span class="ml-1.5 text-[11px] font-semibold rounded-full px-1.5 py-[1px]"
              style="background:${state.tab === t.id ? 'rgba(109,91,255,0.12)' : '#F0F0F5'};color:${state.tab === t.id ? '#6D5BFF' : '#6A6A82'};">${counts[t.id]}</span>
      </div>`).join('');
    document.querySelectorAll('#task-tabs .tab').forEach(el => {
      el.addEventListener('click', () => { state.tab = el.dataset.tab; renderTabs(); renderList(); });
    });
  }

  // ----- List -----
  function renderList() {
    const tab = TABS.find(t => t.id === state.tab);
    const items = tasks.filter(tab.match);
    const list = document.getElementById('task-list');

    if (tasks.length === 0) {
      list.innerHTML = `
        <div class="text-center py-16">
          <div class="mx-auto mb-3 stat-icon" style="background:#F5F5FA;width:48px;height:48px;border-radius:12px;">
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
        <div class="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-[#FAFAFC]" style="border-bottom:1px solid #F2F2F7;">
          <button data-toggle="${t.id}" class="flex items-center justify-center flex-shrink-0"
                  style="width:20px;height:20px;border-radius:6px;background:${done ? '#6D5BFF' : '#FFF'};border:1.5px solid ${done ? '#6D5BFF' : '#D8D8E5'};">
            ${done ? '<i data-lucide="check" style="width:12px;height:12px;color:#FFF;pointer-events:none;"></i>' : ''}
          </button>
          <div class="flex-1 min-w-0">
            <div class="text-[13.5px] font-medium" style="${done ? 'color:#8A8AA0;text-decoration:line-through;' : ''}">${esc(t.title)}</div>
            <div class="mt-1">
              <span class="pill ${dm.pill}" style="font-size:11px;padding:2px 8px;">
                <i data-lucide="calendar" style="width:11px;height:11px;margin-right:3px;"></i>${dm.label}
              </span>
            </div>
          </div>
          <span class="pill ${priorityPill(t.priority)}">${esc(t.priority)}</span>
          <button data-del="${t.id}" class="btn-icon" title="Delete task" style="width:30px;height:30px;border:none;">
            <i data-lucide="trash-2" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i>
          </button>
        </div>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
  }

  // ----- Modal -----
  function openModal() {
    const form = document.getElementById('task-form');
    form.reset();
    form.elements['priority'].value = 'Medium';
    form.elements['due'].min = todayStr(); // block past dates in the picker
    document.getElementById('task-form-msg').textContent = '';
    document.getElementById('task-modal').classList.remove('hidden');
    form.elements['title'].focus();
  }
  function closeModal() { document.getElementById('task-modal').classList.add('hidden'); }

  function renderAll() { renderStats(); renderTabs(); renderList(); if (window.lucide) lucide.createIcons(); }

  function bind() {
    document.getElementById('add-task-btn').addEventListener('click', openModal);
    document.getElementById('task-modal-close').addEventListener('click', closeModal);
    document.getElementById('task-cancel').addEventListener('click', closeModal);
    document.getElementById('task-modal-backdrop').addEventListener('click', closeModal);

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
      if (data.due) {
        const now = new Date();
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (parseLocalDate(data.due).getTime() < todayMidnight.getTime()) {
          msg.textContent = 'Due date cannot be in the past.'; return;
        }
      }

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.style.opacity = '0.7';
      try {
        const res = await fetch('/api/tasks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ title: data.title, due: data.due || '', priority: data.priority })
        });
        const raw = await res.text();
        let body = {};
        try { body = raw ? JSON.parse(raw) : {}; } catch (err) {}
        if (!res.ok) { msg.textContent = body.error || `Request failed (HTTP ${res.status}).`; return; }
        tasks.unshift(body);
        closeModal();
        state.tab = 'all';
        renderAll();
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
