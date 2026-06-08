// Settings page: vertical section nav + per-section renderers.
(function () {
  const D = window.LF_DATA; // only used for the current user (set by layout)

  // Static config (not user data). Gmail is a separate, real OAuth card.
  const INTEGRATIONS = [
    { name: 'ARRIVE',   category: 'CRM / Real Estate', status: 'Not Connected', desc: 'Sync listings, showings, and buyer activity.', icon: 'home' },
    { name: 'WhatsApp', category: 'Messaging',         status: 'Not Connected', desc: 'Send and receive WhatsApp Business messages.',  icon: 'message-circle' }
  ];
  const ROLE_LEGEND = [
    { role: 'Admin',       color: '#2255a3', tint: '#EFEAFF', desc: 'Superuser — manages everyone’s role.' },
    { role: 'Team Leader', color: '#2B57D9', tint: '#E7EEFF', desc: 'Builds a team and assigns leads to members.' },
    { role: 'Member',      color: '#138A4B', tint: '#E6F8EC', desc: 'Works their own and assigned leads.' }
  ];
  // These map directly to what the notifications bell shows (see js/layout.js).
  const NOTIFICATION_GROUPS = [
    { id: 'bell', label: 'In-app notifications', icon: 'bell', items: [
      { id: 'calls',     label: 'Call reminders',    desc: 'Overdue calls and calls coming up soon from your queue.', on: true },
      { id: 'tasks',     label: 'Task reminders',    desc: 'Tasks due today and overdue tasks.', on: true },
      { id: 'meetings',  label: 'Meeting reminders', desc: 'Calendar events starting within the hour.', on: true },
      { id: 'hot_leads', label: 'Hot leads',         desc: 'High-scoring leads with no call logged yet.', on: true }
    ]}
  ];

  const SECTIONS = [
    { id: 'profile',         label: 'Profile',             icon: 'user-circle' },
    { id: 'roles',           label: 'Roles & Permissions', icon: 'shield' },
    { id: 'notifications',   label: 'Notifications',       icon: 'bell' },
    { id: 'autoemails',      label: 'Automated Emails',    icon: 'cake' },
    { id: 'changepassword',  label: 'Change Password',     icon: 'key-round' }
  ];

  const state = { section: 'profile' };

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
          <div id="profile-avatar" class="avatar avatar-lg" style="width:64px;height:64px;font-size:20px;${u.photo ? `background-image:url('${u.photo}');background-size:cover;background-position:center;` : ''}">${u.photo ? '' : u.initials}</div>
          <input id="photo-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" />
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <button type="button" id="photo-upload-btn" class="btn-primary" style="padding:7px 14px;font-size:13px;">
                <i data-lucide="upload" style="width:13px;height:13px;"></i> Upload new photo
              </button>
              <button type="button" id="photo-remove-btn" class="btn-secondary" style="padding:7px 14px;font-size:13px;">Remove</button>
            </div>
            <span id="photo-msg" class="text-[12px] text-soft">PNG, JPG, WebP, or GIF.</span>
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

  // Resize an image file to a small square-ish JPEG data URL (longest side = max).
  function resizeImageToDataUrl(file, max) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('decode'));
        img.onload = () => {
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function bindProfile() {
    const form = document.getElementById('profile-form');
    if (!form) return;
    const msg = document.getElementById('profile-msg');

    // ----- Profile photo: upload + remove -----
    const photoMsg = document.getElementById('photo-msg');
    const setPhotoMsg = (t, kind) => {
      if (!photoMsg) return;
      photoMsg.style.color = kind === 'err' ? '#D63333' : kind === 'ok' ? '#138A4B' : 'var(--text-soft)';
      photoMsg.textContent = t;
    };
    const fileInput = document.getElementById('photo-file');
    const uploadBtn = document.getElementById('photo-upload-btn');
    const removeBtn = document.getElementById('photo-remove-btn');
    if (uploadBtn) uploadBtn.addEventListener('click', () => fileInput.click());
    if (fileInput) fileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      fileInput.value = '';
      if (!file) return;
      if (!/^image\//.test(file.type)) { setPhotoMsg('Please choose an image file.', 'err'); return; }
      setPhotoMsg('Processing…');
      let dataUrl;
      try { dataUrl = await resizeImageToDataUrl(file, 256); } catch (err) { setPhotoMsg('Could not read that image.', 'err'); return; }
      try {
        const res = await fetch('/api/profile/photo', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ photo: dataUrl })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { setPhotoMsg(body.error || 'Upload failed.', 'err'); return; }
        LF.setUserPhoto(dataUrl);
        LF.applyAvatar(document.getElementById('profile-avatar'), D.user);
        setPhotoMsg('Photo updated.', 'ok');
      } catch (err) { setPhotoMsg('Network error. Is the server running?', 'err'); }
    });
    if (removeBtn) removeBtn.addEventListener('click', async () => {
      if (!D.user.photo) { setPhotoMsg('No photo to remove.', 'err'); return; }
      try {
        const res = await fetch('/api/profile/photo', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ photo: '' })
        });
        if (!res.ok) { setPhotoMsg('Could not remove the photo.', 'err'); return; }
        LF.setUserPhoto('');
        LF.applyAvatar(document.getElementById('profile-avatar'), D.user);
        setPhotoMsg('Photo removed.', 'ok');
      } catch (err) { setPhotoMsg('Network error.', 'err'); }
    });

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
          <i data-lucide="${i.icon}" style="width:20px;height:20px;color:#2255a3;"></i>
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
            <i data-lucide="mail" style="width:20px;height:20px;color:#2255a3;"></i>
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

  // ----- Roles & Permissions (functional) -----
  function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function roleBadge(role) {
    if (role === 'admin') return '<span class="pill pill-purple">Admin</span>';
    if (role === 'team_leader') return '<span class="pill pill-blue">Team Leader</span>';
    return '<span class="pill pill-gray">Member</span>';
  }
  function renderRoles() {
    const legend = ROLE_LEGEND.map(r => `
      <div class="rounded-xl p-4" style="border:1px solid var(--border);">
        <div class="flex items-center gap-2 mb-1">
          <span class="stat-icon" style="background:${r.tint};width:28px;height:28px;border-radius:8px;">
            <i data-lucide="shield" style="width:14px;height:14px;color:${r.color};"></i>
          </span>
          <div class="text-[14px] font-semibold">${r.role}</div>
        </div>
        <div class="text-[12px] text-muted">${r.desc}</div>
      </div>`).join('');

    return `
      <div class="mb-5">
        <h2 class="text-[18px] font-bold">Roles &amp; Permissions</h2>
        <p class="text-[13px] text-muted mt-1">Manage who's an admin, team leader, or member.</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-7">${legend}</div>
      <div id="roles-host"><div class="text-[13px] text-muted py-6 text-center">Loading…</div></div>
    `;
  }

  async function bindRoles() {
    const host = document.getElementById('roles-host');
    if (!host) return;
    const raw = (D.user && D.user.rawRole) || 'user';
    try {
      if (raw === 'admin') host.innerHTML = await adminRolesHTML();
      else if (raw === 'team_leader') host.innerHTML = await leaderTeamHTML();
      else host.innerHTML = memberStatusHTML();
    } catch (e) { host.innerHTML = `<div class="text-[13px]" style="color:#D63333;">Could not load. Is the server running?</div>`; }
    if (window.lucide) lucide.createIcons();
    wireRoles();
  }

  // Admin: all accounts with a role selector.
  async function adminRolesHTML() {
    const res = await fetch('/api/admin/users', { credentials: 'same-origin' });
    const users = res.ok ? await res.json() : [];
    const rows = users.map(u => `
      <tr>
        <td>
          <div class="flex items-center gap-2">
            <div class="avatar avatar-sm">${(u.name || '?').trim().split(/\s+/).map(s => s[0]).slice(0,2).join('').toUpperCase()}</div>
            <div>
              ${u.role === 'team_leader'
                ? `<button data-view-team="${u.id}" class="font-semibold text-[13px]" style="color:var(--accent);cursor:pointer;display:inline-flex;align-items:center;gap:4px;">${escAttr(u.name)} <i data-lucide="chevron-right" style="width:12px;height:12px;pointer-events:none;"></i></button>`
                : `<div class="font-semibold text-[13px]">${escAttr(u.name)}</div>`}
              <div class="text-[11.5px] text-muted">${escAttr(u.email)}</div>
            </div>
          </div>
        </td>
        <td>${u.leaderName ? escAttr(u.leaderName) : '<span class="text-soft">—</span>'}</td>
        <td>
          ${u.role === 'admin'
            ? roleBadge('admin')
            : `<select data-role-user="${u.id}" class="input" style="padding:5px 10px;font-size:12.5px;width:auto;cursor:pointer;">
                 <option value="user" ${u.role === 'user' ? 'selected' : ''}>Member</option>
                 <option value="team_leader" ${u.role === 'team_leader' ? 'selected' : ''}>Team Leader</option>
               </select>`}
        </td>
      </tr>`).join('');
    return `
      <h3 class="text-[15px] font-semibold mb-1">All users (${users.length})</h3>
      <p class="text-[12px] text-soft mb-3">Click a team leader to see who's on their team.</p>
      <div class="rounded-xl overflow-hidden" style="border:1px solid var(--border);">
        <table class="lf-table">
          <thead><tr><th>User</th><th>Team leader</th><th>Role</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div id="roles-msg" class="text-[12.5px] mt-3"></div>
      <div id="admin-team-detail" class="mt-5"></div>`;
  }

  // Team leader: members + invite + pending.
  async function leaderTeamHTML() {
    const res = await fetch('/api/team', { credentials: 'same-origin' });
    const t = res.ok ? await res.json() : { members: [], pending: [], candidates: [] };
    const memberRows = t.members.length ? t.members.map(m => `
      <div class="flex items-center justify-between gap-3 px-4 py-3" style="border-bottom:1px solid var(--border-soft);">
        <div class="flex items-center gap-2">
          <div class="avatar avatar-sm">${(m.name || '?').trim().split(/\s+/).map(s => s[0]).slice(0,2).join('').toUpperCase()}</div>
          <div><div class="font-semibold text-[13px]">${escAttr(m.name)}</div><div class="text-[11.5px] text-muted">${escAttr(m.email)}</div></div>
        </div>
        <button class="btn-icon" title="Remove from team" data-remove-member="${m.id}" style="width:30px;height:30px;border:none;">
          <i data-lucide="user-minus" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i>
        </button>
      </div>`).join('') : `<div class="text-[12.5px] text-muted px-4 py-4">No members yet. Invite someone below.</div>`;

    const pendingRows = t.pending.length ? `
      <div class="mt-4">
        <div class="text-[12px] font-semibold text-muted mb-2">Pending invitations</div>
        ${t.pending.map(p => `<div class="flex items-center gap-2 text-[13px] px-1 py-1">
          <i data-lucide="clock" style="width:13px;height:13px;color:#B07A00;"></i> ${escAttr(p.name)} <span class="text-soft">— awaiting response</span>
        </div>`).join('')}
      </div>` : '';

    const options = t.candidates.map(c => `<option value="${c.id}">${escAttr(c.name)} (${escAttr(c.email)})</option>`).join('');
    const inviteBox = `
      <div class="rounded-xl p-4 mt-5" style="border:1px solid var(--border);">
        <div class="text-[13px] font-semibold mb-2">Invite a member</div>
        ${t.candidates.length ? `
          <div class="flex items-center gap-2">
            <select id="invite-select" class="input" style="cursor:pointer;">${options}</select>
            <button id="invite-btn" class="btn-primary" style="white-space:nowrap;"><i data-lucide="user-plus" style="width:14px;height:14px;"></i> Invite</button>
          </div>` : `<div class="text-[12.5px] text-muted">No available users to invite right now.</div>`}
        <div id="roles-msg" class="text-[12.5px] mt-2"></div>
      </div>`;

    return `
      <h3 class="text-[15px] font-semibold mb-3">My team (${t.members.length})</h3>
      <div class="rounded-xl overflow-hidden" style="border:1px solid var(--border);">${memberRows}</div>
      ${pendingRows}
      ${inviteBox}`;
  }

  // Member: simple status.
  function memberStatusHTML() {
    const u = D.user || {};
    if (u.leaderName) {
      return `<div class="rounded-xl p-5" style="border:1px solid var(--border);">
        <div class="text-[14px] font-semibold mb-1">You're on ${escAttr(u.leaderName)}'s team</div>
        <div class="text-[13px] text-muted">Leads assigned to you by your team leader appear in your Leads list.</div>
      </div>`;
    }
    return `<div class="rounded-xl p-5" style="border:1px solid var(--border);">
      <div class="text-[14px] font-semibold mb-1">You're not on a team</div>
      <div class="text-[13px] text-muted">A team leader can invite you — you'll get a notification to accept or decline.</div>
    </div>`;
  }

  function wireRoles() {
    // Admin: click a team leader to view their members (toggles open/closed).
    document.querySelectorAll('[data-view-team]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-view-team');
      const host = document.getElementById('admin-team-detail');
      if (!host) return;
      if (host.getAttribute('data-leader') === id) { host.innerHTML = ''; host.removeAttribute('data-leader'); return; }
      host.setAttribute('data-leader', id);
      host.innerHTML = '<div class="text-[13px] text-muted py-3">Loading team…</div>';
      try {
        const res = await fetch('/api/admin/users/' + id + '/team', { credentials: 'same-origin' });
        const t = res.ok ? await res.json() : { leaderName: '', members: [] };
        const memberRows = t.members.length ? t.members.map(m => `
          <div class="flex items-center gap-2 px-4 py-3" style="border-bottom:1px solid var(--border-soft);">
            <div class="avatar avatar-sm">${(m.name || '?').trim().split(/\s+/).map(s => s[0]).slice(0,2).join('').toUpperCase()}</div>
            <div><div class="font-semibold text-[13px]">${escAttr(m.name)}</div><div class="text-[11.5px] text-muted">${escAttr(m.email)}</div></div>
          </div>`).join('') : '<div class="text-[12.5px] text-muted px-4 py-4">No members on this team yet.</div>';
        host.innerHTML = `
          <div class="rounded-xl overflow-hidden" style="border:1px solid var(--border);">
            <div class="px-4 py-3 flex items-center justify-between" style="border-bottom:1px solid var(--border);background:var(--surface-2);">
              <div class="text-[14px] font-semibold">${escAttr(t.leaderName)}'s team (${t.members.length})</div>
              <button data-close-team class="btn-icon" style="width:28px;height:28px;border:none;"><i data-lucide="x" style="width:14px;height:14px;color:var(--text-muted);"></i></button>
            </div>
            ${memberRows}
          </div>`;
        if (window.lucide) lucide.createIcons();
        const closeBtn = host.querySelector('[data-close-team]');
        if (closeBtn) closeBtn.addEventListener('click', () => { host.innerHTML = ''; host.removeAttribute('data-leader'); });
      } catch (e) { host.innerHTML = '<div class="text-[13px]" style="color:#D63333;">Could not load the team.</div>'; }
    }));

    // Admin: change a role.
    document.querySelectorAll('[data-role-user]').forEach(sel => sel.addEventListener('change', async () => {
      const id = sel.getAttribute('data-role-user');
      const msg = document.getElementById('roles-msg');
      sel.disabled = true;
      try {
        const res = await fetch('/api/admin/users/' + id + '/role', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ role: sel.value })
        });
        if (msg) msg.style.color = res.ok ? '#138A4B' : '#D63333';
        if (msg) msg.textContent = res.ok ? 'Role updated.' : 'Could not update role.';
        if (res.ok) bindRoles(); // refresh leader column
      } catch (e) { if (msg) { msg.style.color = '#D63333'; msg.textContent = 'Network error.'; } }
      finally { sel.disabled = false; }
    }));

    // Leader: invite.
    const inviteBtn = document.getElementById('invite-btn');
    if (inviteBtn) inviteBtn.addEventListener('click', async () => {
      const sel = document.getElementById('invite-select');
      const msg = document.getElementById('roles-msg');
      if (!sel || !sel.value) return;
      inviteBtn.disabled = true;
      try {
        const res = await fetch('/api/team/invite', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ userId: Number(sel.value) })
        });
        const body = await res.json().catch(() => ({}));
        if (msg) { msg.style.color = res.ok ? '#138A4B' : '#D63333'; msg.textContent = res.ok ? 'Invitation sent.' : (body.error || 'Could not invite.'); }
        if (res.ok) bindRoles();
      } catch (e) { if (msg) { msg.style.color = '#D63333'; msg.textContent = 'Network error.'; } }
      finally { inviteBtn.disabled = false; }
    });

    // Leader: remove a member.
    document.querySelectorAll('[data-remove-member]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-remove-member');
      if (!window.confirm('Remove this member from your team?')) return;
      try {
        const res = await fetch('/api/team/members/' + id, { method: 'DELETE', credentials: 'same-origin' });
        if (res.ok) bindRoles(); else window.alert('Could not remove the member.');
      } catch (e) { window.alert('Network error.'); }
    }));
  }

  // ----- Notifications (preferences persisted in localStorage) -----
  function notifPrefs() {
    try { return JSON.parse(localStorage.getItem('lf-notif-prefs') || '{}'); } catch (e) { return {}; }
  }
  function saveNotifPref(gid, iid, on) {
    const p = notifPrefs(); p[gid + '.' + iid] = !!on;
    try { localStorage.setItem('lf-notif-prefs', JSON.stringify(p)); } catch (e) {}
  }
  function notifItemOn(gid, it) {
    const p = notifPrefs(), k = gid + '.' + it.id;
    return (k in p) ? !!p[k] : !!it.on; // saved value, else the default
  }
  function renderNotifications() {
    const groups = NOTIFICATION_GROUPS.map(g => `
      <div class="mb-6">
        <div class="flex items-center gap-2 mb-3">
          <i data-lucide="${g.icon}" style="width:16px;height:16px;color:#2255a3;"></i>
          <h3 class="text-[14.5px] font-semibold">${g.label}</h3>
        </div>
        <div class="rounded-xl" style="border:1px solid var(--border);">
          ${g.items.map((it, idx) => `
            <div class="flex items-center justify-between gap-4 px-4 py-3 ${idx > 0 ? 'border-t' : ''}" style="border-color:var(--border);">
              <div class="flex-1 min-w-0">
                <div class="text-[13.5px] font-medium">${it.label}</div>
                <div class="text-[12.5px] text-muted">${it.desc}</div>
              </div>
              <div class="lf-switch ${notifItemOn(g.id, it) ? 'on' : ''}" data-group="${g.id}" data-item="${it.id}"></div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    return `
      <div class="mb-5">
        <h2 class="text-[18px] font-bold">Notifications</h2>
        <p class="text-[13px] text-muted mt-1">Choose what shows in the notifications bell. Team invitations and lead assignments always notify you.</p>
      </div>
      ${groups}
    `;
  }

  function bindToggles() {
    document.querySelectorAll('#settings-content .lf-switch').forEach(el => {
      el.addEventListener('click', () => {
        const newOn = !el.classList.contains('on');
        el.classList.toggle('on', newOn);
        saveNotifPref(el.dataset.group, el.dataset.item, newOn);
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
  // ----- Automated emails (birthday / loan anniversary templates) -----
  function renderAutoEmails() {
    return `
      <div class="max-w-[760px]">
        <h3 class="text-[15px] font-semibold mb-1">Automated emails</h3>
        <p class="text-[12.5px] text-muted mb-4">Birthday and loan-anniversary emails go out automatically at 9am to your closed clients, sent from your connected Google account. Personalize with <b>{{first_name}}</b>, <b>{{name}}</b>, or <b>{{state}}</b>.</p>
        <div id="auto-email-wrap" class="text-[13px] text-muted">Loading…</div>
      </div>`;
  }
  async function bindAutoEmails() {
    const wrap = document.getElementById('auto-email-wrap');
    let data = null;
    try { const r = await fetch('/api/auto-email-settings', { credentials: 'same-origin' }); data = r.ok ? await r.json() : null; }
    catch (e) {}
    if (!data) { wrap.innerHTML = '<span style="color:#D63333;">Could not load settings.</span>'; return; }
    const s = data.settings;
    const tzOpts = data.timezones.map(tz => `<option value="${escapeAttr(tz)}" ${tz === s.tz ? 'selected' : ''}>${escapeHTML(tz.replace(/_/g, ' '))}</option>`).join('');

    wrap.innerHTML = `
      <div class="flex flex-col gap-4">
        <div>
          <label class="text-[12px] font-semibold text-muted">Send timezone (for the 9am send)</label>
          <select id="ae-tz" class="input mt-1" style="cursor:pointer;max-width:300px;">${tzOpts}</select>
        </div>
        <div class="rounded-xl p-4" style="border:1px solid var(--border);">
          <div class="text-[13px] font-semibold mb-2">🎂 Birthday email</div>
          <label class="text-[12px] font-semibold text-muted">Subject</label>
          <input id="ae-bday-subj" class="input mt-1 mb-3" maxlength="200" />
          <label class="text-[12px] font-semibold text-muted">Message</label>
          <textarea id="ae-bday-body" rows="6" class="input mt-1" maxlength="4000"></textarea>
        </div>
        <div class="rounded-xl p-4" style="border:1px solid var(--border);">
          <div class="text-[13px] font-semibold mb-2">🏠 Loan-anniversary email</div>
          <label class="text-[12px] font-semibold text-muted">Subject</label>
          <input id="ae-anniv-subj" class="input mt-1 mb-3" maxlength="200" />
          <label class="text-[12px] font-semibold text-muted">Message</label>
          <textarea id="ae-anniv-body" rows="6" class="input mt-1" maxlength="4000"></textarea>
        </div>
        <div>
          <label class="text-[12px] font-semibold text-muted">Signature (added to the end of every automated email)</label>
          <textarea id="ae-sig" rows="3" class="input mt-1" maxlength="600" placeholder="e.g.&#10;Alex Martinez&#10;Loan Officer, SafeTrust Mortgage&#10;(555) 123-4567"></textarea>
        </div>
        <div class="flex items-center gap-3 flex-wrap">
          <button id="ae-save" class="btn-primary">Save changes</button>
          <button id="ae-reset" type="button" class="btn-secondary">Reset to defaults</button>
          <span id="ae-msg" class="text-[12.5px] font-medium"></span>
        </div>
      </div>`;

    const setVals = (v) => {
      document.getElementById('ae-bday-subj').value  = v.birthday_subject || '';
      document.getElementById('ae-bday-body').value  = v.birthday_body || '';
      document.getElementById('ae-anniv-subj').value = v.anniv_subject || '';
      document.getElementById('ae-anniv-body').value = v.anniv_body || '';
      document.getElementById('ae-sig').value        = v.signature || '';
    };
    setVals(s);

    document.getElementById('ae-reset').addEventListener('click', () => { setVals(data.defaults); });

    document.getElementById('ae-save').addEventListener('click', async () => {
      const btn = document.getElementById('ae-save');
      const msg = document.getElementById('ae-msg');
      const payload = {
        tz: document.getElementById('ae-tz').value,
        birthday_subject: document.getElementById('ae-bday-subj').value,
        birthday_body:    document.getElementById('ae-bday-body').value,
        anniv_subject:    document.getElementById('ae-anniv-subj').value,
        anniv_body:       document.getElementById('ae-anniv-body').value,
        signature:        document.getElementById('ae-sig').value
      };
      btn.disabled = true; btn.style.opacity = '0.7';
      msg.style.color = 'var(--text-muted)'; msg.textContent = 'Saving…';
      try {
        const r = await fetch('/api/auto-email-settings', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify(payload)
        });
        if (r.ok) { msg.style.color = '#138A4B'; msg.textContent = 'Saved.'; }
        else { msg.style.color = '#D63333'; msg.textContent = 'Could not save.'; }
      } catch (e) { msg.style.color = '#D63333'; msg.textContent = 'Network error.'; }
      finally { btn.disabled = false; btn.style.opacity = ''; }
    });
  }

  function renderContent() {
    const out = document.getElementById('settings-content');
    const map = {
      profile:        renderProfile,
      roles:          renderRoles,
      notifications:  renderNotifications,
      autoemails:     renderAutoEmails,
      changepassword: renderChangePassword
    };
    out.innerHTML = (map[state.section] || renderProfile)();

    // Section-specific bindings.
    if (state.section === 'profile')        bindProfile();
    if (state.section === 'roles')          bindRoles();
    if (state.section === 'notifications')  bindToggles();
    if (state.section === 'autoemails')     bindAutoEmails();
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
