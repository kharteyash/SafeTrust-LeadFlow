// Settings page: vertical section nav + per-section renderers.
(function () {
  const D = window.LF_DATA; // only used for the current user (set by layout)

  // Static config (not user data). Gmail is a separate, real OAuth card.
  const INTEGRATIONS = [
    { name: 'ARRIVE',   category: 'CRM / Real Estate', status: 'Not Connected', desc: 'Sync listings, showings, and buyer activity.', icon: 'home' },
    { name: 'WhatsApp', category: 'Messaging',         status: 'Not Connected', desc: 'Send and receive WhatsApp Business messages.',  icon: 'message-circle' }
  ];
  const ROLE_PERMISSIONS = [
    { role: 'Admin',   color: '#6D5BFF', tint: '#EFEAFF', desc: 'Full access to every feature, billing, and team management.',
      perms: ['Manage team & roles', 'Billing & integrations', 'Edit / delete any record', 'Export data', 'Configure automations'] },
    { role: 'Manager', color: '#2B57D9', tint: '#E7EEFF', desc: 'Oversee a team — lead assignments, reports, and pipeline.',
      perms: ['Assign leads to agents', 'View team reports', 'Edit any lead / contact', 'Create campaigns', 'Cannot modify billing'] },
    { role: 'Agent',   color: '#138A4B', tint: '#E6F8EC', desc: 'Day-to-day usage — work assigned leads and tasks.',
      perms: ['View & edit own leads', 'Log calls & messages', 'Complete tasks', 'Send templated emails', 'Cannot delete records'] }
  ];
  const NOTIFICATION_GROUPS = [
    { id: 'reminders', label: 'Reminders', icon: 'alarm-clock', items: [
      { id: 'task_due',     label: 'Task due reminders',  desc: 'Notify me 30 minutes before a task is due.', on: true },
      { id: 'followup',     label: 'Follow-up reminders', desc: 'Remind me if a lead hasn’t been contacted in 5 days.', on: true },
      { id: 'daily_digest', label: 'Daily digest',        desc: 'Send a morning summary of today’s tasks.', on: false }
    ]},
    { id: 'emails', label: 'Emails', icon: 'mail', items: [
      { id: 'new_lead_email', label: 'New lead email', desc: 'Email me when a new lead is assigned.', on: true },
      { id: 'lead_activity',  label: 'Lead activity',  desc: 'Email me when a lead replies or opens a message.', on: true },
      { id: 'weekly_summary', label: 'Weekly summary', desc: 'Friday recap with pipeline metrics.', on: false }
    ]},
    { id: 'alerts', label: 'Alerts', icon: 'bell-ring', items: [
      { id: 'missed_call', label: 'Missed calls',    desc: 'Push alert when you miss a call from a lead.', on: true },
      { id: 'failed_msg',  label: 'Failed messages', desc: 'Alert when an SMS or email fails to send.', on: true },
      { id: 'system',      label: 'System alerts',   desc: 'Maintenance, downtime, and security alerts.', on: true }
    ]}
  ];

  const SECTIONS = [
    { id: 'profile',         label: 'Profile',             icon: 'user-circle' },
    { id: 'integrations',    label: 'Integrations',        icon: 'plug' },
    { id: 'roles',           label: 'Roles & Permissions', icon: 'shield' },
    { id: 'notifications',   label: 'Notifications',       icon: 'bell' },
    { id: 'changepassword',  label: 'Change Password',     icon: 'key-round' }
  ];

  // Open the Integrations section directly when returning from Google OAuth.
  const gmailParam = new URLSearchParams(window.location.search).get('gmail');
  const state = { section: gmailParam ? 'integrations' : 'profile' };

  // ----- Section nav -----
  function renderNav() {
    document.getElementById('settings-nav').innerHTML = SECTIONS.map(s => `
      <div class="settings-tab ${state.section === s.id ? 'active' : ''}" data-section="${s.id}">
        <i data-lucide="${s.icon}"></i>
        <span>${s.label}</span>
      </div>
    `).join('');

    document.querySelectorAll('#settings-nav .settings-tab').forEach(el => {
      el.addEventListener('click', () => {
        state.section = el.dataset.section;
        renderNav();
        renderContent();
      });
    });
  }

  // ----- Profile -----
  function escapeAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeHTML(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderProfile() {
    const u = D.user;
    return `
      <div class="mb-5">
        <h2 class="text-[18px] font-bold">Profile</h2>
        <p class="text-[13px] text-muted mt-1">Update your name, photo, and contact details.</p>
      </div>

      <form id="profile-form">
        <!-- Photo -->
        <div class="flex items-center gap-4 mb-6">
          <div class="avatar avatar-lg" style="width:64px;height:64px;font-size:20px;">${u.initials}</div>
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <button type="button" class="btn-primary" style="padding:7px 14px;font-size:13px;">
                <i data-lucide="upload" style="width:13px;height:13px;"></i> Upload new photo
              </button>
              <button type="button" class="btn-secondary" style="padding:7px 14px;font-size:13px;">Remove</button>
            </div>
            <span class="text-[12px] text-soft">PNG or JPG, max 2MB.</span>
          </div>
        </div>

        <div class="divider mb-6"></div>

        <!-- Name + contact -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-[640px]">
          <div>
            <label class="text-[12px] font-semibold text-muted">Full name</label>
            <input name="name" required maxlength="80" class="input mt-1" value="${escapeAttr(u.name)}" />
          </div>
          <div>
            <label class="text-[12px] font-semibold text-muted">Job title</label>
            <input name="title" maxlength="80" class="input mt-1" value="${escapeAttr(u.title)}" placeholder="e.g. Senior Agent" />
          </div>
          <div>
            <label class="text-[12px] font-semibold text-muted">Email</label>
            <input class="input mt-1" value="${escapeAttr(u.email || '')}" readonly style="background:var(--surface-3);color:var(--text-muted);" />
          </div>
          <div>
            <label class="text-[12px] font-semibold text-muted">Phone</label>
            <input name="phone" maxlength="40" class="input mt-1" value="${escapeAttr(u.phone)}" placeholder="(555) 123-4567" />
          </div>
          <div class="md:col-span-2">
            <label class="text-[12px] font-semibold text-muted">Bio</label>
            <textarea name="bio" rows="3" maxlength="500" class="input mt-1" placeholder="A short bio your team will see.">${escapeHTML(u.bio)}</textarea>
          </div>
        </div>

        <div id="profile-msg" class="mt-4 text-[12.5px] font-medium"></div>

        <div class="mt-4">
          <button type="submit" class="btn-primary">Save changes</button>
        </div>
      </form>
    `;
  }

  function bindProfile() {
    const form = document.getElementById('profile-form');
    if (!form) return;
    const msg = document.getElementById('profile-msg');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = '';
      msg.style.color = '#D63333';

      const data = Object.fromEntries(new FormData(form));
      if (!data.name || !data.name.trim()) {
        msg.textContent = 'Name is required.';
        return;
      }

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.style.opacity = '0.7';

      try {
        const res = await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            name:  data.name,
            phone: data.phone || '',
            title: data.title || '',
            bio:   data.bio   || ''
          })
        });
        const raw = await res.text();
        let body = {};
        try { body = raw ? JSON.parse(raw) : {}; } catch (e) { /* non-JSON */ }

        if (!res.ok) {
          msg.textContent = body.error || `Request failed (HTTP ${res.status}).`;
          return;
        }

        // Update topbar + LF_DATA.user, then re-render so the photo initials
        // and form values reflect the saved state.
        LF.refreshUserDisplay(body);
        renderContent();
        // Re-attach a fresh success message after re-render.
        const freshMsg = document.getElementById('profile-msg');
        if (freshMsg) {
          freshMsg.style.color = '#138A4B';
          freshMsg.textContent = 'Profile updated successfully.';
        }
      } catch (err) {
        msg.textContent = 'Network error. Is the server running?';
      } finally {
        btn.disabled = false;
        btn.style.opacity = '';
      }
    });
  }

  // ----- Integrations -----
  // Static (mock) cards for everything except Gmail, which is a real OAuth integration.
  function mockCard(i) {
    const connected = i.status === 'Connected';
    return `
      <div class="flex items-center gap-4 p-4 rounded-xl" style="border:1px solid var(--border);">
        <div class="stat-icon" style="background:var(--surface-3);width:44px;height:44px;border-radius:12px;">
          <i data-lucide="${i.icon}" style="width:20px;height:20px;color:#6D5BFF;"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-0.5">
            <span class="text-[14px] font-semibold">${i.name}</span>
            <span class="pill ${connected ? 'pill-green' : 'pill-gray'}">${i.status}</span>
          </div>
          <div class="text-[12.5px] text-muted">${i.desc}</div>
          <div class="text-[11.5px] text-soft mt-0.5">${i.category}</div>
        </div>
        <button class="${connected ? 'btn-secondary' : 'btn-primary'}" style="padding:7px 14px;font-size:13px;">
          ${connected ? 'Manage' : 'Connect'}
        </button>
      </div>`;
  }

  function gmailCardHTML(status) {
    let badge, action, sub;
    if (status.loading) {
      badge = `<span class="pill pill-gray">Checking…</span>`;
      action = '';
      sub = 'Gmail integration';
    } else if (!status.configured) {
      badge = `<span class="pill pill-gray">Setup needed</span>`;
      action = `<button class="btn-secondary" disabled style="padding:7px 14px;font-size:13px;opacity:.6;cursor:not-allowed;">Connect</button>`;
      sub = 'Add Google OAuth credentials to .env to enable';
    } else if (status.connected) {
      badge = `<span class="pill pill-green">Connected</span>`;
      action = `<button id="gmail-disconnect" class="btn-secondary" style="padding:7px 14px;font-size:13px;">Disconnect</button>`;
      sub = status.email ? `Connected as ${status.email}` : 'Connected';
    } else {
      badge = `<span class="pill pill-gray">Not Connected</span>`;
      action = `<button id="gmail-connect" class="btn-primary" style="padding:7px 14px;font-size:13px;">Connect</button>`;
      sub = 'Read your emails and import contacts';
    }

    const viewBtns = (status.connected) ? `
      <div class="flex items-center gap-2 mt-3 pt-3" style="border-top:1px solid var(--border-soft);">
        <button id="gmail-emails" class="btn-secondary" style="padding:6px 12px;font-size:12.5px;">
          <i data-lucide="mail" style="width:13px;height:13px;"></i> View recent emails
        </button>
        <button id="gmail-contacts" class="btn-secondary" style="padding:6px 12px;font-size:12.5px;">
          <i data-lucide="users" style="width:13px;height:13px;"></i> View contacts
        </button>
      </div>` : '';

    return `
      <div class="p-4 rounded-xl" style="border:1px solid var(--border);">
        <div class="flex items-center gap-4">
          <div class="stat-icon" style="background:var(--surface-3);width:44px;height:44px;border-radius:12px;">
            <i data-lucide="mail" style="width:20px;height:20px;color:#6D5BFF;"></i>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="text-[14px] font-semibold">Gmail</span>
              ${badge}
            </div>
            <div class="text-[12.5px] text-muted">${sub}</div>
            <div class="text-[11.5px] text-soft mt-0.5">Email</div>
          </div>
          ${action}
        </div>
        ${viewBtns}
      </div>`;
  }

  function renderIntegrations() {
    const others = INTEGRATIONS.map(mockCard).join('');
    return `
      <div class="mb-5">
        <h2 class="text-[18px] font-bold">Integrations</h2>
        <p class="text-[13px] text-muted mt-1">Connect the tools you already use to LeadFlow.</p>
      </div>
      <div class="flex flex-col gap-3">
        <div id="gmail-card">${gmailCardHTML({ loading: true })}</div>
        ${others}
      </div>
      <div id="gmail-data" class="mt-5"></div>
    `;
  }

  async function loadGmailData(url, title, renderItem, emptyMsg) {
    const out = document.getElementById('gmail-data');
    out.innerHTML = `<div class="text-[13px] text-muted py-2">Loading ${title.toLowerCase()}…</div>`;
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      const data = await res.json().catch(() => ([]));
      if (!res.ok) {
        out.innerHTML = `<div class="text-[13px]" style="color:#D63333;">${(data && data.error) || 'Could not load.'}</div>`;
        return;
      }
      if (!data.length) { out.innerHTML = `<div class="text-[13px] text-muted py-2">${emptyMsg}</div>`; return; }
      out.innerHTML = `
        <h3 class="text-[14.5px] font-semibold mb-3">${title}</h3>
        <div class="rounded-xl" style="border:1px solid var(--border);">
          ${data.map((item, i) => `
            <div class="px-4 py-3 ${i > 0 ? 'border-t' : ''}" style="border-color:var(--border-soft);">${renderItem(item)}</div>
          `).join('')}
        </div>`;
      if (window.lucide) lucide.createIcons();
    } catch (e) {
      out.innerHTML = `<div class="text-[13px]" style="color:#D63333;">Network error.</div>`;
    }
  }

  function bindIntegrations() {
    // Clear any sender preference saved by the old behavior.
    try { localStorage.removeItem('lf-sender-email'); } catch (e) {}

    const card = document.getElementById('gmail-card');
    fetch('/api/google/status', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : { configured: false, connected: false })
      .catch(() => ({ configured: false, connected: false }))
      .then(status => {
        card.innerHTML = gmailCardHTML(status);
        if (window.lucide) lucide.createIcons();

        const connectBtn = document.getElementById('gmail-connect');
        if (connectBtn) connectBtn.addEventListener('click', () => { window.location.href = '/api/google/connect'; });

        const disBtn = document.getElementById('gmail-disconnect');
        if (disBtn) disBtn.addEventListener('click', async () => {
          await fetch('/api/google/disconnect', { method: 'POST', credentials: 'same-origin' });
          document.getElementById('gmail-data').innerHTML = '';
          bindIntegrations();
        });

        const emailsBtn = document.getElementById('gmail-emails');
        if (emailsBtn) emailsBtn.addEventListener('click', () => {
          loadGmailData('/api/google/emails', 'Recent emails',
            e => `
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-[13px] font-semibold truncate">${escapeHTML(e.subject)}</div>
                  <div class="text-[12px] text-muted truncate">${escapeHTML(e.from)}</div>
                  <div class="text-[12px] text-soft truncate">${escapeHTML(e.snippet)}</div>
                </div>
                <span class="text-[11px] text-soft whitespace-nowrap flex-shrink-0">${escapeHTML((e.date || '').replace(/\s*\(.*\)$/, ''))}</span>
              </div>`,
            'No emails found.');
        });

        const contactsBtn = document.getElementById('gmail-contacts');
        if (contactsBtn) contactsBtn.addEventListener('click', () => {
          loadGmailData('/api/google/contacts', 'Contacts',
            c => `
              <div class="flex items-center gap-3">
                <div class="avatar avatar-sm">${escapeHTML((c.name || '?').slice(0, 1).toUpperCase())}</div>
                <div class="min-w-0">
                  <div class="text-[13px] font-semibold truncate">${escapeHTML(c.name)}</div>
                  <div class="text-[12px] text-muted truncate">${escapeHTML(c.email)}</div>
                </div>
              </div>`,
            'No contacts found.');
        });
      });
  }

  // ----- Roles & Permissions -----
  function renderRoles() {
    const roleCards = ROLE_PERMISSIONS.map(r => `
      <div class="rounded-xl p-5" style="border:1px solid var(--border);">
        <div class="flex items-center gap-3 mb-3">
          <div class="stat-icon" style="background:${r.tint};width:40px;height:40px;">
            <i data-lucide="shield" style="width:18px;height:18px;color:${r.color};"></i>
          </div>
          <div>
            <div class="text-[15px] font-semibold">${r.role}</div>
            <div class="text-[12px] text-muted">${r.desc}</div>
          </div>
        </div>
        <ul class="flex flex-col gap-1.5 mt-2">
          ${r.perms.map(p => `
            <li class="flex items-start gap-2 text-[13px]">
              <i data-lucide="check" style="width:14px;height:14px;color:${r.color};margin-top:3px;flex-shrink:0;"></i>
              <span>${p}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    `).join('');

    const u = D.user || {};
    const teamRows = `
      <tr>
        <td>
          <div class="flex items-center gap-2">
            <div class="avatar avatar-sm">${u.initials || '?'}</div>
            <div>
              <div class="font-semibold text-[13px]">${u.name || 'You'}</div>
              <div class="text-[11.5px] text-muted">${u.email || ''}</div>
            </div>
          </div>
        </td>
        <td><span class="pill pill-purple">Admin</span></td>
        <td><span class="pill pill-green">Active</span></td>
      </tr>`;

    return `
      <div class="mb-5">
        <h2 class="text-[18px] font-bold">Roles & Permissions</h2>
        <p class="text-[13px] text-muted mt-1">What each role can see and do.</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-7">${roleCards}</div>

      <div>
        <h3 class="text-[15px] font-semibold mb-3">Team members</h3>
        <div class="rounded-xl overflow-hidden" style="border:1px solid var(--border);">
          <table class="lf-table">
            <thead><tr><th>Member</th><th>Role</th><th>Status</th></tr></thead>
            <tbody>${teamRows}</tbody>
          </table>
        </div>
        <p class="text-[12px] text-soft mt-3">Inviting teammates isn’t available yet — you’re the only member.</p>
      </div>
    `;
  }

  // ----- Notifications -----
  function renderNotifications() {
    const groups = NOTIFICATION_GROUPS.map(g => `
      <div class="mb-6">
        <div class="flex items-center gap-2 mb-3">
          <i data-lucide="${g.icon}" style="width:16px;height:16px;color:#6D5BFF;"></i>
          <h3 class="text-[14.5px] font-semibold">${g.label}</h3>
        </div>
        <div class="rounded-xl" style="border:1px solid var(--border);">
          ${g.items.map((it, idx) => `
            <div class="flex items-center justify-between gap-4 px-4 py-3 ${idx > 0 ? 'border-t' : ''}" style="border-color:var(--border);">
              <div class="flex-1 min-w-0">
                <div class="text-[13.5px] font-medium">${it.label}</div>
                <div class="text-[12.5px] text-muted">${it.desc}</div>
              </div>
              <div class="lf-switch ${it.on ? 'on' : ''}" data-group="${g.id}" data-item="${it.id}"></div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    return `
      <div class="mb-5">
        <h2 class="text-[18px] font-bold">Notifications</h2>
        <p class="text-[13px] text-muted mt-1">Configure reminders, emails, and alerts.</p>
      </div>
      ${groups}
    `;
  }

  function bindToggles() {
    document.querySelectorAll('#settings-content .lf-switch').forEach(el => {
      el.addEventListener('click', () => {
        const gid = el.dataset.group, iid = el.dataset.item;
        const group = NOTIFICATION_GROUPS.find(g => g.id === gid);
        const item = group && group.items.find(i => i.id === iid);
        if (!item) return;
        item.on = !item.on;
        el.classList.toggle('on', item.on);
      });
    });
  }

  // ----- Change Password -----
  function renderChangePassword() {
    return `
      <div class="mb-5">
        <h2 class="text-[18px] font-bold">Change Password</h2>
        <p class="text-[13px] text-muted mt-1">Update the password you use to sign in.</p>
      </div>

      <form id="change-password-form" class="max-w-[640px]" autocomplete="off">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="md:col-span-2">
            <label class="text-[12px] font-semibold text-muted">Current password</label>
            <input name="currentPassword" type="password" required autocomplete="current-password"
                   class="input mt-1" placeholder="••••••••" />
          </div>
          <div>
            <label class="text-[12px] font-semibold text-muted">New password</label>
            <input name="newPassword" type="password" required minlength="6" autocomplete="new-password"
                   class="input mt-1" placeholder="At least 6 characters" />
          </div>
          <div>
            <label class="text-[12px] font-semibold text-muted">Confirm new password</label>
            <input name="confirmPassword" type="password" required autocomplete="new-password"
                   class="input mt-1" placeholder="Repeat new password" />
          </div>
        </div>
        <div id="change-password-msg" class="mt-3 text-[12.5px] font-medium"></div>
        <div class="mt-4">
          <button type="submit" class="btn-primary">Update password</button>
        </div>
      </form>
    `;
  }

  function bindChangePassword() {
    const form = document.getElementById('change-password-form');
    if (!form) return;
    const msg = document.getElementById('change-password-msg');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = '';
      msg.style.color = '#D63333';

      const data = Object.fromEntries(new FormData(form));
      if (data.newPassword !== data.confirmPassword) {
        msg.textContent = 'New password and confirmation do not match.';
        return;
      }
      if (data.newPassword === data.currentPassword) {
        msg.textContent = 'New password must be different from your current password.';
        return;
      }

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.style.opacity = '0.7';

      try {
        const res = await fetch('/api/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            currentPassword: data.currentPassword,
            newPassword: data.newPassword
          })
        });
        const raw = await res.text();
        let body = {};
        try { body = raw ? JSON.parse(raw) : {}; } catch (e) { /* non-JSON */ }

        if (!res.ok) {
          msg.textContent = body.error || `Request failed (HTTP ${res.status}).`;
          return;
        }
        msg.style.color = '#138A4B';
        msg.textContent = 'Password updated successfully.';
        form.reset();
      } catch (err) {
        msg.textContent = 'Network error. Is the server running?';
      } finally {
        btn.disabled = false;
        btn.style.opacity = '';
      }
    });
  }

  // ----- Section dispatcher -----
  function renderContent() {
    const out = document.getElementById('settings-content');
    const map = {
      profile:        renderProfile,
      integrations:   renderIntegrations,
      roles:          renderRoles,
      notifications:  renderNotifications,
      changepassword: renderChangePassword
    };
    out.innerHTML = map[state.section]();

    // Section-specific bindings.
    if (state.section === 'profile')        bindProfile();
    if (state.section === 'integrations')   bindIntegrations();
    if (state.section === 'notifications')  bindToggles();
    if (state.section === 'changepassword') bindChangePassword();

    if (window.lucide) lucide.createIcons();
  }

  // ----- Mount -----
  document.addEventListener('DOMContentLoaded', async function () {
    await LF.renderLayout({ active: 'settings' });
    renderNav();
    renderContent();
    if (window.lucide) lucide.createIcons();
  });
})();
