// Settings page: vertical section nav + per-section renderers.
(function () {
  const D = window.LF_DATA; // only used for the current user (set by layout)

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
      { id: 'hot_leads', label: 'Hot leads',         desc: '5-star leads with no call logged yet.', on: true }
    ]}
  ];

  const SECTIONS = [
    { id: 'profile',         label: 'Profile',             icon: 'user-circle' },
    { id: 'roles',           label: 'Roles & Permissions', icon: 'shield' },
    { id: 'notifications',   label: 'Notifications',       icon: 'bell' },
    { id: 'autoemails',      label: 'Automation',          icon: 'zap' },
    { id: 'integrations',    label: 'Integrations',        icon: 'plug' },
    { id: 'changepassword',  label: 'Change Password',     icon: 'key-round' },
    { id: 'twofactor',       label: 'Two-Factor Auth',     icon: 'shield-check' },
    { id: 'help',            label: 'Help & FAQ',          icon: 'help-circle' }
  ];

  // Frequently asked questions — answers written to orient new users.
  const FAQS = [
    { q: 'How do I connect RETR (retr.app) to LeadFlow?',
      a: "Open Settings → Integrations. You'll see two personal webhook URLs (one for agents, one for loan officers). In RETR's CRM Integrations, choose “Other”, name it “LeadFlow”, and paste those URLs. When you push agents/loan officers from RETR, they're added to your Contacts (agents as Realtor, loan officers as Loan Officer), skipping anyone already there. The URLs are unique to you, so each person connects their own account — and you can regenerate your token any time." },
    { q: 'How do I send emails from LeadFlow?',
      a: "Go to Settings → Profile and click “Connect Google account” under Email connection. After you approve, everything you send — scheduled messages, “Send now,” campaigns, and the automatic birthday/anniversary emails — goes out from your own Gmail, so recipients see your name and address. No password is stored." },
    { q: "Why aren't my scheduled or automatic emails being sent?",
      a: "Email only works once you've connected your Google account in Settings → Profile. If you haven't connected, nothing is scheduled or sent — including birthday and loan-anniversary emails. Connect your account and they'll start going out. Scheduled sending also needs the background scheduler running (your admin sets this up)." },
    { q: 'How is the lead score calculated?',
      a: "It's shown as a 1–5 star rating (1 = lowest, 5 = best). Hover over the stars in the leads table or a lead's details to see the exact breakdown. Behind the stars: buying timeline (the biggest factor — “Buying Immediately” is highest), pre-approved, has a phone number, and loan profile (a cash-out refinance, or a purchase lead that already has a realtor, scores highest). A forwarded lead that's accepted is automatically boosted to a top rating." },
    { q: 'Can I change a lead’s rating manually?',
      a: "Only the admin can. Click a lead's name to open its details — the admin sees an editable 1–5 rating field with a Save button." },
    { q: 'How do I improve a lead’s score?',
      a: "Hover over the stars to see the factor breakdown — the amber tips point out what's missing. Common wins: add a phone number, get the lead pre-approved, and attach a realtor (for purchases). Sooner buying timelines also raise the score." },
    { q: 'What happens after too many wrong passwords?',
      a: "Three wrong passwords in a row locks that account for 24 hours — sign-in is disabled even with the correct password until then. The admin sees a red “Login disabled” tag next to the user in Settings → Roles & Permissions and can click “Unlock” to re-enable sign-in right away." },
    { q: 'What happens when I forward (assign) a lead?',
      a: "Whoever you forward to gets a bell notification to Accept or Decline. The first person to accept becomes the new owner. The lead then leaves your “My Leads” view, is marked high priority, and its forwarding history is recorded in the lead's detail (user1 → user2 → user3)." },
    { q: 'Who can forward or assign leads?',
      a: "Team leaders can forward to their members; members can forward to their leader and teammates; the admin can forward their own leads to anyone. You can only forward leads you own." },
    { q: 'What do the roles (Admin, Team Leader, Member) mean?',
      a: "The first account is the Admin (superuser): it sees every user's leads and manages roles/teams in Settings → Roles & Permissions, and its campaigns can reach every lead. Team Leaders have members under them and can assign work to them. Members are regular users who see only their own data." },
    { q: 'How do I assign a task to my team?',
      a: "Team leaders and the admin see an “Assign Task” button on the Tasks page. Search and check the people to assign to (the admin can pick everyone), and the task appears in each person's list tagged “From <you>.” Track everything you've handed out in the “Assigned” tab." },
    { q: 'How do campaigns work?',
      a: "On the Campaigns page, create an email campaign, choose an Audience (a lead segment like Buying Immediately, Pre-approved, Refinance, Realtors, or Previously Closed clients), write a subject and message, then Send. Each email is personalized and sent from your connected Gmail. Use {{first_name}}, {{name}}, or {{state}} to personalize." },
    { q: 'Can I email a lead’s realtor in a campaign?',
      a: "Yes — choose the “Realtors (from leads)” audience. It sends to the realtor email addresses saved on your leads, de-duplicated so each realtor is emailed once." },
    { q: 'What automatic emails does LeadFlow send?',
      a: "Five sequences, all sent from your connected Google account and all editable in Settings → Automation:\n\n• New-lead drip — Day 0 / 3 / 7 emails to a fresh lead, stopping the moment you log a call.\n• 15-day nurture — a check-in to any lead you haven't contacted in 15 days, repeating every 15 days.\n• Post-close — check-ins to a closed client at +7 / +30 / +90 / +180 days.\n• Birthday — a yearly greeting to anyone (lead, realtor/contact, or closed client) who has a birthday on file. Add one on the lead, realtor, or contact form.\n• Loan anniversary — a yearly email to closed clients on their closing date.\n\nEvery one first appears in Messages → Scheduled (tagged “Auto”) so you can edit or dismiss it before it sends. You can turn all automatic emails (or automatic tasks & call queue) on or off, and personalize the wording, signature, and send timezone, in Settings → Automation." },
    { q: 'How do I sync with Google Calendar?',
      a: "On the Calendar page, click Connect/Reconnect Google. Events you create in LeadFlow are added to your Google Calendar, and your Google events appear in LeadFlow (badged “Google”). Your admin must enable the Google Calendar API and add the calendar permission for this to work." },
    { q: 'How does the call queue work?',
      a: "It's a daily list. Add people to call; calls past their time become “Overdue” and carry over to the next day at the bottom in red. When you call someone, log the outcome — that records it in Call History and moves the lead out of “Not contacted yet.”" },
    { q: 'How do I import leads or closed clients from a CSV?',
      a: "Use the Import button on the Leads or Previously Closed page. LeadFlow auto-detects columns (name, email, phone, etc.) and de-duplicates on re-import — updating rows that changed and leaving identical ones alone." },
    { q: 'How do I delete several leads at once?',
      a: "Tick the checkbox on the left of each row, or use the header “select all” (which covers the whole filtered view across all pages), then click Delete. This works on both the Leads and Previously Closed pages." },
    { q: 'Why is the Call or Email button missing on a contact or lead?',
      a: "Those options only appear when the info exists — no phone means no Call/Text/WhatsApp; no email means no Email. Contacts and leads use a single “Contact” button that opens a menu of the methods that person actually has." },
    { q: 'How do notifications work?',
      a: "The bell shows only unread notifications — reading one (or “Mark all read”) clears it. Everyday alerts (overdue calls/tasks, hot leads) auto-clear at the start of a new day, while pending team invites and lead assignments stay until you act on them. Turn categories on/off in Settings → Notifications." },
    { q: 'How do I change my name or profile photo?',
      a: "Settings → Profile. Changing your name also updates the “Owner” shown on your leads." },
    { q: 'How do I switch between light and dark mode?',
      a: "Use the theme toggle (sun/moon) in the top bar. Your choice is remembered on this device." }
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

      <div class="divider my-6 max-w-[640px]"></div>
      <div class="max-w-[640px]">
        <h3 class="text-[15px] font-semibold mb-1">Email connection</h3>
        <p class="text-[12.5px] text-muted mb-3">Connect your Google account so everything you send — scheduled messages, campaigns, and the automatic emails — goes out from your own Gmail.</p>
        <div id="email-health" class="panel p-4"></div>
      </div>
    `;
  }

  // ----- Gmail connection card (moved here from Messages) -----
  async function renderEmailHealth() {
    const box = document.getElementById('email-health');
    if (!box) return;
    const dot = (ok) => `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${ok ? '#138A4B' : '#B07A00'};margin-right:6px;"></span>`;
    let s = null;
    try { const r = await fetch('/api/email/status', { credentials: 'same-origin' }); if (r.ok) s = await r.json(); }
    catch (e) {}
    if (!s || !s.gmailConfigured) {
      box.innerHTML = `<div class="text-[12.5px] text-muted">Email sending isn't configured on this server yet.</div>`;
      return;
    }
    if (s.gmailConnected) {
      box.innerHTML = `
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div class="text-[14px] font-semibold mb-1">Sending email as yourself</div>
            <div class="text-[12.5px]">${dot(true)}Connected — emails you send go out from <b>${escapeHTML(s.gmailEmail || '')}</b>.</div>
          </div>
          <button id="gmail-disconnect-btn" class="btn-secondary" style="padding:5px 12px;font-size:12px;">Disconnect</button>
        </div>`;
    } else {
      box.innerHTML = `
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div class="text-[14px] font-semibold mb-1">Send emails as yourself</div>
            <div class="text-[12.5px] text-muted">Connect your Google account once — then everything you send comes from your own name and address. No password needed.</div>
          </div>
          <button id="gmail-connect-btn" class="btn-primary" style="padding:6px 14px;font-size:12.5px;white-space:nowrap;">
            <i data-lucide="mail" style="width:14px;height:14px;"></i> Connect Google account</button>
        </div>`;
    }
    if (window.lucide) lucide.createIcons();
    const connectBtn = document.getElementById('gmail-connect-btn');
    if (connectBtn) connectBtn.addEventListener('click', () => { window.location.href = '/api/google/connect?from=settings'; });
    const disconnectBtn = document.getElementById('gmail-disconnect-btn');
    if (disconnectBtn) disconnectBtn.addEventListener('click', async () => {
      if (!window.confirm('Disconnect your Google account?')) return;
      try { await fetch('/api/google/disconnect', { method: 'POST', credentials: 'same-origin' }); } catch (e) {}
      renderEmailHealth();
    });
  }

  // Resize an image file to a small square-ish JPEG data URL (longest side = max).
  // ----- Profile-photo cropper -----
  // Avatars are circular and shown with background-size:cover, so a non-square
  // upload gets center-cropped in unpredictable ways. This lets the user pan +
  // zoom to pick the square themselves; we export a 256x256 JPEG of that square.
  const CROP_VPX = 280;     // on-screen crop window size (square)
  const CROP_OUT = 256;     // exported image size (square)
  function ensureCropModal() {
    if (document.getElementById('crop-modal')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div id="crop-modal" class="hidden" style="position:fixed;inset:0;z-index:80;">
        <div id="crop-backdrop" style="position:absolute;inset:0;background:rgba(14,14,27,.5);"></div>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:100%;max-width:360px;" class="px-4">
          <div class="bg-white rounded-2xl p-5 shadow-2xl">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-[16px] font-bold">Crop your photo</h3>
              <button type="button" id="crop-close" class="btn-icon" style="width:30px;height:30px;border:none;"><i data-lucide="x" style="width:16px;height:16px;color:var(--text-muted);"></i></button>
            </div>
            <p class="text-[12px] text-muted mb-3">Drag to reposition and use the slider to zoom. The circle is what people will see.</p>
            <div id="crop-viewport" style="position:relative;width:${CROP_VPX}px;height:${CROP_VPX}px;margin:0 auto;overflow:hidden;border-radius:12px;background:#eef0f4;touch-action:none;cursor:grab;user-select:none;">
              <img id="crop-img" alt="" style="position:absolute;top:0;left:0;transform-origin:0 0;pointer-events:none;-webkit-user-drag:none;max-width:none;" />
              <div style="position:absolute;inset:0;border-radius:50%;box-shadow:0 0 0 9999px rgba(0,0,0,.38);pointer-events:none;"></div>
            </div>
            <div class="flex items-center gap-3 mt-4">
              <i data-lucide="zoom-out" style="width:14px;height:14px;color:var(--text-muted);"></i>
              <input id="crop-zoom" type="range" min="1" max="3" step="0.01" value="1" style="flex:1;accent-color:#2255a3;cursor:pointer;" />
              <i data-lucide="zoom-in" style="width:14px;height:14px;color:var(--text-muted);"></i>
            </div>
            <div class="flex items-center justify-end gap-2 mt-4">
              <button type="button" id="crop-cancel" class="btn-secondary">Cancel</button>
              <button type="button" id="crop-save" class="btn-primary">Save photo</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap.firstElementChild);
  }
  // Opens the cropper for `file`; calls onSave(dataUrl) with a square JPEG.
  function openCropper(file, onSave) {
    ensureCropModal();
    const modal = document.getElementById('crop-modal');
    const vp = document.getElementById('crop-viewport');
    const imgEl = document.getElementById('crop-img');
    const zoom = document.getElementById('crop-zoom');
    let natW = 0, natH = 0, coverScale = 1, scale = 1, tx = 0, ty = 0;

    function clamp() {
      const dispW = natW * scale, dispH = natH * scale;
      tx = Math.min(0, Math.max(CROP_VPX - dispW, tx));   // keep the window covered
      ty = Math.min(0, Math.max(CROP_VPX - dispH, ty));
    }
    function apply() { imgEl.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; }
    function close() { modal.classList.add('hidden'); }

    zoom.oninput = () => {
      const next = coverScale * parseFloat(zoom.value);
      const cx = CROP_VPX / 2, cy = CROP_VPX / 2;           // zoom around the center
      const ix = (cx - tx) / scale, iy = (cy - ty) / scale;
      scale = next; tx = cx - ix * scale; ty = cy - iy * scale;
      clamp(); apply();
    };
    let dragging = false, lx = 0, ly = 0;
    vp.onpointerdown = (e) => { dragging = true; lx = e.clientX; ly = e.clientY; vp.setPointerCapture(e.pointerId); vp.style.cursor = 'grabbing'; };
    vp.onpointermove = (e) => { if (!dragging) return; tx += e.clientX - lx; ty += e.clientY - ly; lx = e.clientX; ly = e.clientY; clamp(); apply(); };
    vp.onpointerup = vp.onpointercancel = () => { dragging = false; vp.style.cursor = 'grab'; };

    document.getElementById('crop-cancel').onclick = close;
    document.getElementById('crop-close').onclick = close;
    document.getElementById('crop-backdrop').onclick = close;
    document.getElementById('crop-save').onclick = () => {
      const canvas = document.createElement('canvas');
      canvas.width = CROP_OUT; canvas.height = CROP_OUT;
      const sw = CROP_VPX / scale, sh = CROP_VPX / scale;   // source square in natural px
      canvas.getContext('2d').drawImage(imgEl, -tx / scale, -ty / scale, sw, sh, 0, 0, CROP_OUT, CROP_OUT);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      close();
      onSave(dataUrl);
    };

    const reader = new FileReader();
    reader.onerror = () => { /* handled by caller's message */ };
    reader.onload = () => {
      imgEl.onload = () => {
        natW = imgEl.naturalWidth; natH = imgEl.naturalHeight;
        coverScale = CROP_VPX / Math.min(natW, natH);        // smallest side fills the window
        scale = coverScale; zoom.value = '1';
        tx = (CROP_VPX - natW * scale) / 2; ty = (CROP_VPX - natH * scale) / 2;   // centered
        clamp(); apply();
        modal.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
      };
      imgEl.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function bindProfile() {
    renderEmailHealth();   // Gmail connection card
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
    if (fileInput) fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      fileInput.value = '';
      if (!file) return;
      if (!/^image\//.test(file.type)) { setPhotoMsg('Please choose an image file.', 'err'); return; }
      // Let the user crop to a square first, then upload the result.
      openCropper(file, async (dataUrl) => {
        setPhotoMsg('Uploading…');
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
        <td data-col="user">
          <div class="flex items-center gap-2">
            <div class="avatar avatar-sm">${(u.name || '?').trim().split(/\s+/).map(s => s[0]).slice(0,2).join('').toUpperCase()}</div>
            <div>
              <div class="flex items-center gap-1.5 flex-wrap">
                ${u.role === 'team_leader'
                  ? `<button data-view-team="${u.id}" class="font-semibold text-[13px]" style="color:var(--accent);cursor:pointer;display:inline-flex;align-items:center;gap:4px;">${escAttr(u.name)} <i data-lucide="chevron-right" style="width:12px;height:12px;pointer-events:none;"></i></button>`
                  : `<span class="font-semibold text-[13px]">${escAttr(u.name)}</span>`}
                ${u.locked ? `<span class="pill pill-red" style="font-size:10px;" title="Locked after 3 failed sign-ins — clears automatically after 24 hours"><i data-lucide="lock" style="width:9px;height:9px;display:inline;vertical-align:-1px;"></i> Login disabled</span>
                  <button data-unlock-user="${u.id}" class="text-[11px] font-semibold" style="color:var(--accent);cursor:pointer;">Unlock</button>` : ''}
              </div>
              <div class="text-[11.5px] text-muted">${escAttr(u.email)}</div>
            </div>
          </div>
        </td>
        <td data-col="leader" data-label="Team leader">${u.leaderName ? escAttr(u.leaderName) : '<span class="text-soft">—</span>'}</td>
        <td data-col="role" data-label="Role">
          ${u.role === 'admin'
            ? roleBadge('admin')
            : `<select data-role-user="${u.id}" class="input" style="padding:5px 10px;font-size:12.5px;width:auto;cursor:pointer;">
                 <option value="user" ${u.role === 'user' ? 'selected' : ''}>Member</option>
                 <option value="team_leader" ${u.role === 'team_leader' ? 'selected' : ''}>Team Leader</option>
               </select>`}
        </td>
        <td data-col="actions" style="text-align:right;">
          ${u.role === 'admin'
            ? ((D.user && D.user.email && u.email && u.email.toLowerCase() === D.user.email.toLowerCase())
                ? '<span class="text-soft" title="This is you">—</span>'
                : `<button data-demote-admin="${u.id}" data-user-name="${escAttr(u.name)}" class="btn-icon" title="Remove admin access" style="width:30px;height:30px;border:none;">
                     <i data-lucide="shield-off" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i>
                   </button>`)
            : `<button data-make-admin="${u.id}" data-user-name="${escAttr(u.name)}" class="btn-icon" title="Make admin" style="width:30px;height:30px;border:none;">
                 <i data-lucide="shield-check" style="width:14px;height:14px;color:var(--accent);pointer-events:none;"></i>
               </button>
               <button data-delete-user="${u.id}" data-user-name="${escAttr(u.name)}" class="btn-icon" title="Delete user" style="width:30px;height:30px;border:none;">
                 <i data-lucide="trash-2" style="width:14px;height:14px;color:#D63333;pointer-events:none;"></i>
               </button>`}
        </td>
      </tr>`).join('');
    const createBox = `
      <div class="rounded-xl p-4 mb-5" style="border:1px solid var(--border);">
        <div class="text-[13.5px] font-semibold mb-1">Create a user account</div>
        <p class="text-[12px] text-soft mb-3">Enter the new user's email (and optional name). They'll be emailed a temporary password and asked to change it on first sign-in.</p>
        <div class="flex items-end gap-2 flex-wrap">
          <div style="flex:1 1 220px;">
            <label class="text-[12px] font-semibold text-muted">Email</label>
            <input id="new-user-email" type="email" class="input mt-1" placeholder="user@example.com" />
          </div>
          <div style="flex:1 1 180px;">
            <label class="text-[12px] font-semibold text-muted">Name (optional)</label>
            <input id="new-user-name" maxlength="80" class="input mt-1" placeholder="Full name" />
          </div>
          <button id="create-user-btn" class="btn-primary" style="white-space:nowrap;"><i data-lucide="user-plus" style="width:14px;height:14px;"></i> Create account</button>
        </div>
        <div id="create-user-msg" class="text-[12.5px] font-medium mt-3"></div>
      </div>`;
    return `
      <h3 class="text-[15px] font-semibold mb-1">All users (${users.length})</h3>
      <p class="text-[12px] text-soft mb-3">Click a team leader to see who's on their team. Deleting a user removes their account and all their data.</p>
      ${createBox}
      <div class="rounded-xl overflow-hidden" style="border:1px solid var(--border);">
        <table class="lf-table users-table">
          <thead><tr><th>User</th><th>Team leader</th><th>Role</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div id="roles-msg" class="text-[12.5px] mt-3"></div>
      <div id="admin-team-detail" class="mt-5"></div>

      <!-- Role-change confirmation (password-gated): promote to / remove admin -->
      <div id="make-admin-modal" class="hidden" style="position:fixed;inset:0;z-index:50;">
        <div id="make-admin-backdrop" style="position:absolute;inset:0;background:rgba(14,14,27,.45);"></div>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:100%;max-width:420px;" class="px-4">
          <div class="bg-white rounded-2xl p-6 shadow-2xl">
            <div class="flex items-center justify-between mb-3">
              <h3 id="make-admin-title" class="text-[17px] font-bold">Make admin</h3>
              <button id="make-admin-close" class="btn-icon" style="width:32px;height:32px;border:none;"><i data-lucide="x" style="width:16px;height:16px;color:var(--text-muted);"></i></button>
            </div>
            <p id="make-admin-text" class="text-[13px] text-muted mb-3"></p>
            <input id="make-admin-password" type="password" autocomplete="current-password" class="input" placeholder="Your password" />
            <div id="make-admin-msg" class="text-[12.5px] font-medium mt-2" style="color:#D63333;"></div>
            <div class="flex items-center justify-end gap-2 mt-4">
              <button type="button" id="make-admin-cancel" class="btn-secondary">Cancel</button>
              <button type="button" id="make-admin-confirm" class="btn-primary"></button>
            </div>
          </div>
        </div>
      </div>`;
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

    // Admin: clear a user's failed-login lock.
    document.querySelectorAll('[data-unlock-user]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-unlock-user');
      const msg = document.getElementById('roles-msg');
      btn.disabled = true;
      try {
        const res = await fetch('/api/admin/users/' + id + '/unlock', { method: 'POST', credentials: 'same-origin' });
        if (msg) { msg.style.color = res.ok ? '#138A4B' : '#D63333'; msg.textContent = res.ok ? 'Login re-enabled for that user.' : 'Could not unlock the user.'; }
        if (res.ok) bindRoles();
      } catch (e) { if (msg) { msg.style.color = '#D63333'; msg.textContent = 'Network error.'; } }
      finally { btn.disabled = false; }
    }));

    // Admin: create a user account (emails them a temporary password).
    const createUserBtn = document.getElementById('create-user-btn');
    if (createUserBtn) createUserBtn.addEventListener('click', async () => {
      const emailEl = document.getElementById('new-user-email');
      const nameEl = document.getElementById('new-user-name');
      const msg = document.getElementById('create-user-msg');
      const email = (emailEl && emailEl.value || '').trim();
      const name = (nameEl && nameEl.value || '').trim();
      if (!email) { if (msg) { msg.style.color = '#D63333'; msg.textContent = 'Enter an email address.'; } return; }
      createUserBtn.disabled = true;
      try {
        const res = await fetch('/api/admin/users/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ email, name })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { if (msg) { msg.style.color = '#D63333'; msg.textContent = body.error || 'Could not create the account.'; } return; }
        if (msg) {
          msg.style.color = '#138A4B';
          msg.innerHTML = body.emailed
            ? `Account created for <b>${escAttr(body.email)}</b>. A temporary password was emailed to them.`
            : `Account created for <b>${escAttr(body.email)}</b>, but the email couldn't be sent${body.emailError ? ` (${escAttr(body.emailError)})` : ''}. Share this temporary password with them: <b>${escAttr(body.tempPassword)}</b>`;
        }
        if (emailEl) emailEl.value = '';
        if (nameEl) nameEl.value = '';
        // Refresh the list to include the new user — but only when the email sent.
        // If it didn't, the temp password is on screen, so keep it visible.
        if (body.emailed) setTimeout(() => bindRoles(), 1500);
      } catch (e) { if (msg) { msg.style.color = '#D63333'; msg.textContent = 'Network error.'; } }
      finally { createUserBtn.disabled = false; }
    });

    // Admin: delete a user account.
    document.querySelectorAll('[data-delete-user]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-delete-user');
      const name = btn.getAttribute('data-user-name') || 'this user';
      const msg = document.getElementById('roles-msg');
      if (!window.confirm(`Delete ${name}? This permanently removes their account and all of their leads, tasks, calls, and other data. This can't be undone.`)) return;
      btn.disabled = true;
      try {
        const res = await fetch('/api/admin/users/' + id, { method: 'DELETE', credentials: 'same-origin' });
        const body = await res.json().catch(() => ({}));
        if (msg) { msg.style.color = res.ok ? '#138A4B' : '#D63333'; msg.textContent = res.ok ? `${name} was deleted.` : (body.error || 'Could not delete the user.'); }
        if (res.ok) bindRoles(); // refresh the list
      } catch (e) { if (msg) { msg.style.color = '#D63333'; msg.textContent = 'Network error.'; } }
      finally { btn.disabled = false; }
    }));

    // Admin: promote to / remove admin — both gated by a password-confirm modal.
    const maModal = document.getElementById('make-admin-modal');
    const CONFIRM = {
      promote: {
        title: 'Make admin', endpoint: 'promote-admin', confirmLabel: 'Make admin', icon: 'shield-check',
        text: (n) => `You're about to give <b>${escAttr(n)}</b> full admin access — they'll be able to see and manage every user's data, create and delete accounts, and promote others. To confirm, enter <b>your</b> password.`,
        success: 'That user is now an admin.'
      },
      demote: {
        title: 'Remove admin', endpoint: 'demote-admin', confirmLabel: 'Remove admin', icon: 'shield-off',
        text: (n) => `You're about to remove admin access from <b>${escAttr(n)}</b>. They'll become a regular member and lose the ability to manage other users. To confirm, enter <b>your</b> password.`,
        success: 'Admin access removed.'
      }
    };
    function closeMakeAdmin() { if (maModal) maModal.classList.add('hidden'); }
    function openConfirm(action, id, name) {
      if (!maModal) return;
      const cfg = CONFIRM[action];
      maModal.dataset.userId = id;
      maModal.dataset.action = action;
      document.getElementById('make-admin-title').textContent = cfg.title;
      document.getElementById('make-admin-text').innerHTML = cfg.text(name || 'this user');
      const cBtn = document.getElementById('make-admin-confirm');
      cBtn.innerHTML = `<i data-lucide="${cfg.icon}" style="width:13px;height:13px;"></i> ${cfg.confirmLabel}`;
      document.getElementById('make-admin-password').value = '';
      document.getElementById('make-admin-msg').textContent = '';
      maModal.classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
      document.getElementById('make-admin-password').focus();
    }
    document.querySelectorAll('[data-make-admin]').forEach(btn => btn.addEventListener('click', () =>
      openConfirm('promote', btn.getAttribute('data-make-admin'), btn.getAttribute('data-user-name'))));
    document.querySelectorAll('[data-demote-admin]').forEach(btn => btn.addEventListener('click', () =>
      openConfirm('demote', btn.getAttribute('data-demote-admin'), btn.getAttribute('data-user-name'))));
    if (maModal) {
      document.getElementById('make-admin-close').addEventListener('click', closeMakeAdmin);
      document.getElementById('make-admin-cancel').addEventListener('click', closeMakeAdmin);
      document.getElementById('make-admin-backdrop').addEventListener('click', closeMakeAdmin);
      const confirmBtn = document.getElementById('make-admin-confirm');
      confirmBtn.addEventListener('click', async () => {
        const id = maModal.dataset.userId;
        const cfg = CONFIRM[maModal.dataset.action] || CONFIRM.promote;
        const m = document.getElementById('make-admin-msg');
        const password = document.getElementById('make-admin-password').value;
        if (!password) { m.style.color = '#D63333'; m.textContent = 'Enter your password to confirm.'; return; }
        confirmBtn.disabled = true;
        m.style.color = 'var(--text-muted)'; m.textContent = 'Confirming…';
        try {
          const res = await fetch('/api/admin/users/' + id + '/' + cfg.endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify({ password })
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) { m.style.color = '#D63333'; m.textContent = body.error || 'Could not complete that change.'; return; }
          closeMakeAdmin();
          const rmsg = document.getElementById('roles-msg');
          if (rmsg) { rmsg.style.color = '#138A4B'; rmsg.textContent = cfg.success; }
          bindRoles();
        } catch (e) { m.style.color = '#D63333'; m.textContent = 'Network error.'; }
        finally { confirmBtn.disabled = false; }
      });
    }

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
    const mustChange = !!(D.user && D.user.mustChangePassword);
    const banner = mustChange ? `
      <div class="rounded-lg p-3 mb-4 text-[12.5px]" style="border:1px solid #E8C36A;background:#FBF4E2;color:#7A5A00;">
        <div class="flex items-start gap-2">
          <i data-lucide="key-round" style="width:14px;height:14px;flex-shrink:0;margin-top:1px;"></i>
          <div>You're signed in with a <b>temporary password</b>. Enter it as your current password below and choose a new, secure one.</div>
        </div>
      </div>` : '';
    return `
      <div class="mb-5">
        <h2 class="text-[18px] font-bold">Change Password</h2>
        <p class="text-[13px] text-muted mt-1">Update the password you use to sign in.</p>
      </div>
      ${banner}

      <form id="change-password-form" class="max-w-[640px]" autocomplete="off">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="md:col-span-2">
            <label class="text-[12px] font-semibold text-muted">Current password</label>
            <input name="currentPassword" type="password" required autocomplete="current-password"
                   class="input mt-1" placeholder="••••••••" />
          </div>
          <div>
            <label class="text-[12px] font-semibold text-muted">New password</label>
            <input name="newPassword" type="password" required minlength="8" autocomplete="new-password"
                   class="input mt-1" placeholder="At least 8 characters" />
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
        // Clear the temporary-password state so the banner + bell prompt go away.
        if (D.user && D.user.mustChangePassword) {
          D.user.mustChangePassword = false;
          if (window.LF && typeof LF.refreshNotifications === 'function') LF.refreshNotifications();
        }
      } catch (err) {
        msg.textContent = 'Network error. Is the server running?';
      } finally {
        btn.disabled = false;
        btn.style.opacity = '';
      }
    });
  }

  // ----- Integrations (per-user RETR webhook URLs) -----
  function renderIntegrations() {
    return `
      <div class="mb-5">
        <h2 class="text-[18px] font-bold">Integrations</h2>
        <p class="text-[13px] text-muted mt-1">Connect external tools to your LeadFlow account.</p>
      </div>
      <div class="rounded-xl p-5 max-w-[760px]" style="border:1px solid var(--border);">
        <div class="flex items-center gap-2 mb-1">
          <i data-lucide="webhook" style="width:16px;height:16px;color:#2255a3;"></i>
          <h3 class="text-[14.5px] font-semibold">RETR (retr.app)</h3>
        </div>
        <p class="text-[12.5px] text-muted mb-4">In RETR → CRM Integrations, pick <b>Other</b>, name it <b>LeadFlow</b>, and paste the URLs below. Pushed agents are added to your Contacts as <b>Realtor</b>; loan officers as <b>Loan Officer</b> (duplicates are skipped). These URLs are personal to you — anyone with them can add contacts to your account, so don't share them.</p>
        <div id="retr-urls" class="text-[13px] text-muted">Loading your webhook URLs…</div>
        <div class="mt-4 flex items-center gap-3 flex-wrap">
          <button id="retr-regen" class="btn-secondary" style="font-size:12.5px;"><i data-lucide="refresh-cw" style="width:13px;height:13px;"></i> Regenerate token</button>
          <span id="retr-msg" class="text-[12px]"></span>
        </div>
      </div>`;
  }
  function urlRow(label, url) {
    return `
      <div class="mb-3">
        <div class="text-[12px] font-semibold text-muted mb-1">${label}</div>
        <div class="flex items-center gap-2">
          <input readonly value="${escAttr(url)}" onclick="this.select()" class="input" style="font-size:12px;font-family:ui-monospace,Menlo,monospace;" />
          <button class="btn-secondary" data-copy="${escAttr(url)}" title="Copy" style="white-space:nowrap;font-size:12px;padding:7px 10px;"><i data-lucide="copy" style="width:13px;height:13px;pointer-events:none;"></i></button>
        </div>
      </div>`;
  }
  function bindIntegrations() {
    const host = document.getElementById('retr-urls');
    const origin = window.location.origin;
    const fillUrls = (token) => {
      const agent = `${origin}/api/integrations/retr/agents?token=${token}`;
      const lo = `${origin}/api/integrations/retr/loan-officers?token=${token}`;
      host.innerHTML = urlRow('Webhook URL for Agent Contact Data', agent) + urlRow('Webhook URL for LO Contact Data', lo);
      if (window.lucide) lucide.createIcons();
      host.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(btn.getAttribute('data-copy'));
          btn.innerHTML = '<i data-lucide="check" style="width:13px;height:13px;pointer-events:none;"></i>';
          if (window.lucide) lucide.createIcons();
          setTimeout(() => { btn.innerHTML = '<i data-lucide="copy" style="width:13px;height:13px;pointer-events:none;"></i>'; if (window.lucide) lucide.createIcons(); }, 1200);
        } catch (e) {}
      }));
    };
    (async () => {
      try {
        const res = await fetch('/api/integrations/token', { credentials: 'same-origin' });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.token) fillUrls(body.token);
        else host.innerHTML = '<span style="color:#D63333;">Could not load your token.</span>';
      } catch (e) { host.innerHTML = '<span style="color:#D63333;">Network error.</span>'; }
    })();

    const regen = document.getElementById('retr-regen');
    if (regen) regen.addEventListener('click', async () => {
      if (!window.confirm('Regenerate your token? Any RETR URLs you already saved will stop working until you paste the new ones.')) return;
      const msg = document.getElementById('retr-msg');
      regen.disabled = true;
      try {
        const res = await fetch('/api/integrations/token/regenerate', { method: 'POST', credentials: 'same-origin' });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.token) { fillUrls(body.token); if (msg) { msg.style.color = '#138A4B'; msg.textContent = 'New token generated — update your RETR URLs.'; } }
        else if (msg) { msg.style.color = '#D63333'; msg.textContent = 'Could not regenerate.'; }
      } catch (e) { if (msg) { msg.style.color = '#D63333'; msg.textContent = 'Network error.'; } }
      finally { regen.disabled = false; }
    });
  }

  // ----- Section dispatcher -----
  // ----- Automated emails (birthday / loan anniversary templates) -----
  function renderAutoEmails() {
    return `
      <div class="max-w-[760px]">
        <h2 class="text-[18px] font-bold mb-1">Automation</h2>
        <p class="text-[13px] text-muted mb-4">Control whether LeadFlow schedules things for you automatically, and personalize the emails it sends.</p>

        <div class="rounded-xl mb-6" style="border:1px solid var(--border);">
          <div class="flex items-center justify-between gap-4 px-4 py-3">
            <div class="flex-1 min-w-0">
              <div class="text-[13.5px] font-medium">Automatic emails</div>
              <div class="text-[12.5px] text-muted">Schedule the new-lead drip, 15-day nurture, post-close, birthday, and anniversary emails. When off, none are scheduled and any already in your queue are held (not sent) until you turn it back on. Emails you scheduled by hand still send.</div>
            </div>
            <div id="auto-toggle-emails" class="lf-switch"></div>
          </div>
          <div class="flex items-center justify-between gap-4 px-4 py-3 border-t" style="border-color:var(--border);">
            <div class="flex-1 min-w-0">
              <div class="text-[13.5px] font-medium">Automatic tasks &amp; call queue</div>
              <div class="text-[12.5px] text-muted">Auto-create follow-up tasks, the timeline-based call queue, hot-lead calls, stale-lead nudges, and realtor touch-bases. When off, none are generated.</div>
            </div>
            <div id="auto-toggle-tasks" class="lf-switch"></div>
          </div>
        </div>

        <h3 class="text-[15px] font-semibold mb-1">Email templates</h3>
        <p class="text-[12.5px] text-muted mb-4">Each automatic email goes out from your connected Google account and lands in Messages as a pending email you can edit or dismiss before it sends. Personalize with <b>{{first_name}}</b>, <b>{{name}}</b>, or <b>{{state}}</b>. In the post-call recap, <b>{{notes}}</b> is replaced with the notes you logged on the call.</p>
        <div id="auto-email-wrap" class="text-[13px] text-muted">Loading…</div>
      </div>`;
  }
  // Wire one master automation switch: reflect state, and PUT on toggle. Reverts
  // the visual state if the save fails so the switch never lies about what's saved.
  function bindAutoSwitch(el, field, initialOn) {
    if (!el) return;
    el.classList.toggle('on', !!initialOn);
    el.addEventListener('click', async () => {
      const newOn = !el.classList.contains('on');
      el.classList.toggle('on', newOn);
      try {
        const r = await fetch('/api/automation-prefs', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ [field]: newOn })
        });
        if (!r.ok) throw new Error('save failed');
      } catch (e) { el.classList.toggle('on', !newOn); }   // revert on failure
    });
  }

  async function bindAutoEmails() {
    const wrap = document.getElementById('auto-email-wrap');
    let data = null;
    try { const r = await fetch('/api/auto-email-settings', { credentials: 'same-origin' }); data = r.ok ? await r.json() : null; }
    catch (e) {}
    if (!data) { wrap.innerHTML = '<span style="color:#D63333;">Could not load settings.</span>'; return; }
    const auto = data.automation || { emails: true, tasks: true };
    bindAutoSwitch(document.getElementById('auto-toggle-emails'), 'emails', auto.emails);
    bindAutoSwitch(document.getElementById('auto-toggle-tasks'), 'tasks', auto.tasks);
    const s = data.settings;
    const extraDefs = data.extraDefs || [];
    const tzOpts = data.timezones.map(tz => `<option value="${escapeAttr(tz)}" ${tz === s.tz ? 'selected' : ''}>${escapeHTML(tz.replace(/_/g, ' '))}</option>`).join('');

    // Group the editable drip / nurture / post-close steps into one card each.
    const groupIcon = { 'New-lead drip': '🌱', '15-day nurture': '💬', 'Post-close nurture': '🤝', 'Post-call recap': '📞' };
    const byGroup = [];
    extraDefs.forEach(d => {
      let g = byGroup.find(x => x.name === d.group);
      if (!g) { g = { name: d.group, items: [] }; byGroup.push(g); }
      g.items.push(d);
    });
    const extraHTML = byGroup.map(g => `
        <div class="rounded-xl p-4" style="border:1px solid var(--border);">
          <div class="text-[13px] font-semibold mb-3">${groupIcon[g.name] || '✉️'} ${escapeHTML(g.name)}</div>
          ${g.items.map((d, i) => `
            <div class="${i < g.items.length - 1 ? 'mb-4 pb-4' : ''}" ${i < g.items.length - 1 ? 'style="border-bottom:1px dashed var(--border);"' : ''}>
              <div class="text-[12px] font-semibold mb-2">${escapeHTML(d.label)}</div>
              <label class="text-[12px] font-semibold text-muted">Subject</label>
              <input id="ae-x-${d.key}-subj" class="input mt-1 mb-2" maxlength="200" />
              <label class="text-[12px] font-semibold text-muted">Message</label>
              <textarea id="ae-x-${d.key}-body" rows="5" class="input mt-1" maxlength="4000"></textarea>
            </div>`).join('')}
        </div>`).join('');

    wrap.innerHTML = `
      <div class="flex flex-col gap-4">
        <div>
          <label class="text-[12px] font-semibold text-muted">Send timezone (for the 9am send)</label>
          <select id="ae-tz" class="input mt-1" style="cursor:pointer;max-width:300px;">${tzOpts}</select>
        </div>
        ${extraHTML}
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
          <label class="text-[12px] font-semibold text-muted">Signature (added after the sign-off of every automated email)</label>
          <textarea id="ae-sig" rows="3" class="input mt-1" maxlength="600" placeholder="e.g.&#10;Alex Martinez&#10;Loan Officer, SafeTrust Mortgage&#10;(555) 123-4567"></textarea>
          <div class="text-[11.5px] text-muted mt-1">Leave blank to sign off with your own name automatically.</div>
        </div>
        <div class="flex items-center gap-3 flex-wrap">
          <button id="ae-save" class="btn-primary">Save changes</button>
          <button id="ae-reset" type="button" class="btn-secondary">Reset to defaults</button>
          <span id="ae-msg" class="text-[12.5px] font-medium"></span>
        </div>
      </div>`;

    const setVals = (v, ex) => {
      document.getElementById('ae-bday-subj').value  = v.birthday_subject || '';
      document.getElementById('ae-bday-body').value  = v.birthday_body || '';
      document.getElementById('ae-anniv-subj').value = v.anniv_subject || '';
      document.getElementById('ae-anniv-body').value = v.anniv_body || '';
      document.getElementById('ae-sig').value        = v.signature || '';
      extraDefs.forEach(d => {
        const t = (ex && ex[d.key]) || {};
        const sub = document.getElementById('ae-x-' + d.key + '-subj');
        const bod = document.getElementById('ae-x-' + d.key + '-body');
        if (sub) sub.value = t.subject || '';
        if (bod) bod.value = t.body || '';
      });
    };
    setVals(s, s.extra);

    document.getElementById('ae-reset').addEventListener('click', () => { setVals(data.defaults, data.extraDefaults); });

    document.getElementById('ae-save').addEventListener('click', async () => {
      const btn = document.getElementById('ae-save');
      const msg = document.getElementById('ae-msg');
      const payload = {
        tz: document.getElementById('ae-tz').value,
        birthday_subject: document.getElementById('ae-bday-subj').value,
        birthday_body:    document.getElementById('ae-bday-body').value,
        anniv_subject:    document.getElementById('ae-anniv-subj').value,
        anniv_body:       document.getElementById('ae-anniv-body').value,
        signature:        document.getElementById('ae-sig').value,
        extra: {}
      };
      extraDefs.forEach(d => {
        payload.extra[d.key] = {
          subject: document.getElementById('ae-x-' + d.key + '-subj').value,
          body:    document.getElementById('ae-x-' + d.key + '-body').value
        };
      });
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

  // ----- Help & FAQ -----
  function renderHelp() {
    return `
      <div class="max-w-[760px]">
        <h3 class="text-[15px] font-semibold mb-1">Help &amp; FAQ</h3>
        <p class="text-[12.5px] text-muted mb-4">Answers to common questions. Search, or click a question to expand it.</p>
        <div class="relative mb-4" style="max-width:380px;">
          <i data-lucide="search" style="width:16px;height:16px;color:#8A8AA0;position:absolute;left:12px;top:50%;transform:translateY(-50%);"></i>
          <input id="help-search" class="input pl-9" placeholder="Search questions…" autocomplete="off" />
        </div>
        <div id="help-list"></div>
      </div>`;
  }
  function renderHelpList(term) {
    const t = (term || '').trim().toLowerCase();
    const matches = FAQS.filter(f => !t || f.q.toLowerCase().includes(t) || f.a.toLowerCase().includes(t));
    const host = document.getElementById('help-list');
    if (!matches.length) { host.innerHTML = `<div class="text-[13px] text-muted py-6 text-center">No questions match “${escapeHTML(term)}”.</div>`; return; }
    host.innerHTML = matches.map((f) => {
      const i = FAQS.indexOf(f);
      return `
        <div class="rounded-xl mb-2" style="border:1px solid var(--border);">
          <button class="w-full text-left flex items-center justify-between gap-3 px-4 py-3" data-faq="${i}">
            <span class="text-[13.5px] font-medium">${escapeHTML(f.q)}</span>
            <i data-lucide="chevron-down" data-faq-chevron="${i}" style="width:16px;height:16px;color:var(--text-muted);flex-shrink:0;transition:transform .15s;"></i>
          </button>
          <div data-faq-answer="${i}" class="hidden px-4 pb-3 text-[13px] text-muted" style="white-space:pre-line;line-height:1.55;">${escapeHTML(f.a)}</div>
        </div>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
  }
  function bindHelp() {
    renderHelpList('');
    document.getElementById('help-search').addEventListener('input', e => renderHelpList(e.target.value));
    document.getElementById('help-list').addEventListener('click', e => {
      const btn = e.target.closest('[data-faq]');
      if (!btn) return;
      const i = btn.getAttribute('data-faq');
      const ans = document.querySelector(`[data-faq-answer="${i}"]`);
      const chev = document.querySelector(`[data-faq-chevron="${i}"]`);
      if (!ans) return;
      const open = ans.classList.toggle('hidden') === false;
      if (chev) chev.style.transform = open ? 'rotate(180deg)' : '';
    });
  }

  // ----- Two-factor authentication -----
  function renderTwoFactor() {
    return `
      <div class="max-w-[640px]">
        <h2 class="text-[18px] font-bold tracking-tight">Two-factor authentication</h2>
        <p class="text-[13px] text-muted mt-1">Add a second step at sign-in using an authenticator app (Google Authenticator, Authy, 1Password…), so a stolen password alone isn't enough to get in.</p>
        <div id="tf-body" class="mt-5"><div class="text-[13px] text-muted">Loading…</div></div>
      </div>`;
  }

  async function tfStatus() {
    try { const r = await fetch('/api/mfa/status', { credentials: 'same-origin', cache: 'no-store' }); return r.ok ? await r.json() : { enabled: false, backupLeft: 0 }; }
    catch (e) { return { enabled: false, backupLeft: 0 }; }
  }

  function bindTwoFactor() {
    const body = document.getElementById('tf-body');
    if (!body) return;

    const renderOff = () => {
      body.innerHTML = `
        <div class="rounded-xl p-4" style="border:1px solid var(--border);">
          <div class="flex items-center gap-2 mb-1">
            <span class="pill pill-gray" style="font-size:11px;">Off</span>
            <span class="text-[13.5px] font-semibold">Two-factor is currently off</span>
          </div>
          <p class="text-[12.5px] text-muted mb-3">Turn it on to require a 6-digit code from your phone each time you sign in.</p>
          <button id="tf-start" class="btn-primary"><i data-lucide="shield-check" style="width:14px;height:14px;"></i> Enable two-factor</button>
        </div>`;
      if (window.lucide) lucide.createIcons();
      document.getElementById('tf-start').addEventListener('click', startSetup);
    };

    const renderOn = (st) => {
      body.innerHTML = `
        <div class="rounded-xl p-4" style="border:1px solid var(--border);">
          <div class="flex items-center gap-2 mb-1">
            <span class="pill pill-green" style="font-size:11px;">On</span>
            <span class="text-[13.5px] font-semibold">Two-factor is protecting your account</span>
          </div>
          <p class="text-[12.5px] text-muted mb-3">You'll be asked for a code at sign-in. You have <b>${st.backupLeft}</b> backup code${st.backupLeft === 1 ? '' : 's'} left.</p>
          <div class="flex flex-col gap-2" style="max-width:320px;">
            <label class="text-[12px] font-semibold text-muted">Your account password (to turn it off)</label>
            <input id="tf-disable-pw" type="password" autocomplete="current-password" class="input" placeholder="Password" />
            <div id="tf-disable-msg" class="text-[12.5px] font-medium" style="color:#D63333;"></div>
            <button id="tf-disable" class="btn-secondary" style="align-self:flex-start;">Turn off two-factor</button>
          </div>
        </div>`;
      document.getElementById('tf-disable').addEventListener('click', disable);
    };

    async function startSetup() {
      body.innerHTML = `<div class="text-[13px] text-muted">Setting up…</div>`;
      let data;
      try { const r = await fetch('/api/mfa/setup', { method: 'POST', credentials: 'same-origin' }); data = await r.json(); if (!r.ok) throw new Error(data.error || 'Setup failed'); }
      catch (e) { body.innerHTML = `<div class="text-[13px]" style="color:#D63333;">${escapeHTML(e.message)}</div>`; return; }
      const grouped = data.secret.replace(/(.{4})/g, '$1 ').trim();
      body.innerHTML = `
        <div class="rounded-xl p-4" style="border:1px solid var(--border);">
          <div class="text-[13.5px] font-semibold mb-1">1 · Add LeadFlow to your authenticator app</div>
          <p class="text-[12.5px] text-muted mb-2">Open your authenticator app and add an account. On a phone, tap the link below; on a computer, type this setup key in manually:</p>
          <div class="rounded-lg px-3 py-2 mb-2" style="background:var(--surface-3);font-family:monospace;font-size:14px;letter-spacing:1px;word-break:break-all;">${escapeHTML(grouped)}</div>
          <a href="${escapeAttr(data.otpauth)}" class="text-[12.5px] font-semibold" style="color:var(--accent);">Open in authenticator app →</a>
          <div class="text-[13.5px] font-semibold mt-4 mb-1">2 · Enter the 6-digit code it shows</div>
          <div class="flex items-center gap-2" style="max-width:280px;">
            <input id="tf-code" inputmode="numeric" maxlength="6" class="input" placeholder="123456" />
            <button id="tf-verify" class="btn-primary" style="white-space:nowrap;">Turn on</button>
          </div>
          <div id="tf-verify-msg" class="text-[12.5px] font-medium mt-2" style="color:#D63333;"></div>
          <button id="tf-cancel" class="text-[12px] text-muted mt-3" style="cursor:pointer;background:none;border:none;">Cancel</button>
        </div>`;
      if (window.lucide) lucide.createIcons();
      document.getElementById('tf-code').focus();
      document.getElementById('tf-cancel').addEventListener('click', refresh);
      document.getElementById('tf-verify').addEventListener('click', enable);
      document.getElementById('tf-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') enable(); });
    }

    async function enable() {
      const code = (document.getElementById('tf-code').value || '').trim();
      const msg = document.getElementById('tf-verify-msg');
      const btn = document.getElementById('tf-verify');
      msg.textContent = '';
      btn.disabled = true; btn.style.opacity = '0.7';
      let data;
      try { const r = await fetch('/api/mfa/enable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ code }) }); data = await r.json(); if (!r.ok) throw new Error(data.error || 'Could not turn on two-factor'); }
      catch (e) { msg.textContent = e.message; btn.disabled = false; btn.style.opacity = ''; return; }
      showBackupCodes(data.backupCodes || []);
    }

    function showBackupCodes(codes) {
      body.innerHTML = `
        <div class="rounded-xl p-4" style="border:1px solid var(--border);">
          <div class="flex items-center gap-2 mb-1"><span class="pill pill-green" style="font-size:11px;">On</span><span class="text-[13.5px] font-semibold">Two-factor is now on 🎉</span></div>
          <p class="text-[12.5px] text-muted mb-3">Save these <b>backup codes</b> somewhere safe. Each one works once if you ever lose your phone. <b>They won't be shown again.</b></p>
          <div class="grid grid-cols-2 gap-2 mb-3" style="max-width:360px;">
            ${codes.map(c => `<div class="rounded-md px-3 py-2 text-center" style="background:var(--surface-3);font-family:monospace;font-size:14px;letter-spacing:1px;">${escapeHTML(c)}</div>`).join('')}
          </div>
          <button id="tf-copy" class="btn-secondary" style="margin-right:8px;"><i data-lucide="copy" style="width:13px;height:13px;"></i> Copy codes</button>
          <button id="tf-done" class="btn-primary">Done</button>
        </div>`;
      if (window.lucide) lucide.createIcons();
      document.getElementById('tf-copy').addEventListener('click', () => { try { navigator.clipboard.writeText(codes.join('\n')); } catch (e) {} });
      document.getElementById('tf-done').addEventListener('click', refresh);
    }

    async function disable() {
      const pw = document.getElementById('tf-disable-pw').value || '';
      const msg = document.getElementById('tf-disable-msg');
      msg.textContent = '';
      if (!pw) { msg.textContent = 'Enter your password to confirm.'; return; }
      try { const r = await fetch('/api/mfa/disable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ password: pw }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not turn off two-factor'); }
      catch (e) { msg.textContent = e.message; return; }
      refresh();
    }

    async function refresh() {
      body.innerHTML = `<div class="text-[13px] text-muted">Loading…</div>`;
      const st = await tfStatus();
      if (st.enabled) renderOn(st); else renderOff();
    }

    refresh();
  }

  function renderContent() {
    const out = document.getElementById('settings-content');
    const map = {
      profile:        renderProfile,
      roles:          renderRoles,
      notifications:  renderNotifications,
      autoemails:     renderAutoEmails,
      integrations:   renderIntegrations,
      changepassword: renderChangePassword,
      twofactor:      renderTwoFactor,
      help:           renderHelp
    };
    out.innerHTML = (map[state.section] || renderProfile)();

    // Section-specific bindings.
    if (state.section === 'profile')        bindProfile();
    if (state.section === 'roles')          bindRoles();
    if (state.section === 'notifications')  bindToggles();
    if (state.section === 'autoemails')     bindAutoEmails();
    if (state.section === 'integrations')   bindIntegrations();
    if (state.section === 'changepassword') bindChangePassword();
    if (state.section === 'twofactor')      bindTwoFactor();
    if (state.section === 'help')           bindHelp();

    if (window.lucide) lucide.createIcons();
  }

  // ----- Mount -----
  document.addEventListener('DOMContentLoaded', async function () {
    await LF.renderLayout({ active: 'settings' });
    // Deep link, e.g. settings.html#changepassword, opens that section directly.
    const hash = (window.location.hash || '').replace('#', '');
    if (SECTIONS.some(s => s.id === hash)) state.section = hash;
    // Returning from a Google connect redirect lands on Profile; show the outcome.
    try {
      const g = new URLSearchParams(window.location.search).get('gmail');
      if (g) {
        state.section = 'profile';
        if (g === 'error') setTimeout(() => window.alert('Could not connect your Google account. Please try again.'), 50);
        window.history.replaceState({}, '', '/settings.html');
      }
    } catch (e) {}
    renderNav();
    renderContent();
    if (window.lucide) lucide.createIcons();
  });
})();
