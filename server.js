// LeadFlow server: Express + Postgres + bcrypt + cookie sessions.
// Storage is Postgres (via DATABASE_URL) so it works locally and when hosted.

const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');

// Load environment variables from .env (DATABASE_URL, Google OAuth, etc.).
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch (e) { /* no .env file — that's fine */ }

if (!process.env.DATABASE_URL) {
  console.error('\n❌ DATABASE_URL is not set.');
  console.error('   Create a free Postgres database (e.g. neon.tech) and put its connection');
  console.error('   string in a .env file as DATABASE_URL=postgres://...  then run `npm start`.\n');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_COOKIE = 'lf_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ----- Google OAuth config -----
const GOOGLE = {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirectUri: process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/api/google/callback`,
  scopes: [
    'openid', 'email', 'profile',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/contacts.readonly'
  ]
};
function googleConfigured() { return !!(GOOGLE.clientId && GOOGLE.clientSecret); }
const oauthStates = new Map(); // state -> { userId, exp } (CSRF + user mapping)

// ----- Database -----
const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Hosted Postgres (Neon/Render/etc.) requires SSL; local usually doesn't.
  ssl: isLocalDb ? false : { rejectUnauthorized: false }
});
const q   = async (text, params) => (await pool.query(text, params)).rows;
const one = async (text, params) => { const r = await pool.query(text, params); return r.rows[0] || null; };
// Today's date as YYYY-MM-DD (server-local fallback when the client omits a date).
const serverToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         TEXT NOT NULL,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    phone         TEXT,
    title         TEXT,
    bio           TEXT,
    role          TEXT DEFAULT 'user',
    leader_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    photo         TEXT,
    created_at    TIMESTAMPTZ DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
  ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS leader_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS photo TEXT;

  -- Team join invitations (a leader invites a user; the user accepts/rejects).
  CREATE TABLE IF NOT EXISTS team_invites (
    id         SERIAL PRIMARY KEY,
    leader_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status     TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    start_time  TEXT NOT NULL,
    end_time    TEXT NOT NULL,
    title       TEXT NOT NULL,
    type        TEXT NOT NULL,
    with_person TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS call_log (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    phone       TEXT,
    direction   TEXT DEFAULT 'outbound',
    duration    TEXT,
    outcome     TEXT NOT NULL,
    notes       TEXT,
    agent       TEXT,
    is_realtor  BOOLEAN DEFAULT false,
    logged_at   TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
  );
  ALTER TABLE call_log ADD COLUMN IF NOT EXISTS is_realtor BOOLEAN DEFAULT false;

  CREATE TABLE IF NOT EXISTS scheduled_messages (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient   TEXT NOT NULL,
    channel     TEXT NOT NULL,
    type        TEXT NOT NULL,
    send_date   TEXT NOT NULL,
    send_time   TEXT NOT NULL,
    send_at     TIMESTAMPTZ,
    status      TEXT DEFAULT 'pending',
    sent_at     TIMESTAMPTZ,
    error       TEXT,
    body        TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
  );
  ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS send_at TIMESTAMPTZ;
  ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
  ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
  ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS error TEXT;

  CREATE TABLE IF NOT EXISTS google_accounts (
    user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email         TEXT,
    access_token  TEXT,
    refresh_token TEXT,
    expires_at    BIGINT
  );

  CREATE TABLE IF NOT EXISTS leads (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    email      TEXT,
    phone      TEXT,
    timeline   TEXT,
    score      INTEGER,
    owner      TEXT,
    notes      TEXT,
    preapproved    BOOLEAN DEFAULT false,
    lead_type      TEXT,
    refi_type      TEXT,
    realtor_status TEXT,
    realtor_name   TEXT,
    realtor_email  TEXT,
    realtor_phone  TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS preapproved BOOLEAN DEFAULT false;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_type TEXT;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS refi_type TEXT;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS realtor_status TEXT;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS realtor_name TEXT;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS realtor_email TEXT;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS realtor_phone TEXT;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS state TEXT;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

  -- Lead assignments from a team leader to members (one or all), with accept/reject.
  CREATE TABLE IF NOT EXISTS lead_assignments (
    id           SERIAL PRIMARY KEY,
    lead_id      INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id     TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    leader_seen  BOOLEAN DEFAULT false,
    created_at   TIMESTAMPTZ DEFAULT now()
  );

  -- Previously-closed leads, imported from CSV. Flexible schema (whole row as
  -- JSON) with a per-user dedupe key so re-imports skip duplicates.
  CREATE TABLE IF NOT EXISTS closed_leads (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data       JSON NOT NULL,
    dedupe_key TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS closed_leads_user_key ON closed_leads (user_id, dedupe_key);

  CREATE TABLE IF NOT EXISTS contacts (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    email      TEXT,
    phone      TEXT,
    company    TEXT,
    tag        TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    due_date   TEXT,
    priority   TEXT,
    status     TEXT DEFAULT 'todo',
    created_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS call_queue (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    phone      TEXT,
    priority   TEXT,
    call_time  TEXT,
    call_date  TEXT,
    reason     TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );
  ALTER TABLE call_queue ADD COLUMN IF NOT EXISTS call_date TEXT;

  CREATE TABLE IF NOT EXISTS campaigns (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    channel    TEXT,
    status     TEXT DEFAULT 'Draft',
    sent       INTEGER DEFAULT 0,
    opens      INTEGER DEFAULT 0,
    clicks     INTEGER DEFAULT 0,
    replies    INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
  );
  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS subject    TEXT;
  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS body       TEXT;
  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS audience   TEXT;
  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS recipients INTEGER DEFAULT 0;
  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS failed     INTEGER DEFAULT 0;
  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sent_at    TIMESTAMPTZ;
`;

// Periodically clear expired sessions.
setInterval(() => {
  pool.query('DELETE FROM sessions WHERE expires_at <= now()').catch(() => {});
}, 60 * 60 * 1000);

// ----- Session helpers -----
async function createSession(userId) {
  const id = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await q('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)', [id, userId, expires]);
  return id;
}

async function loadUserFromSession(sid) {
  if (!sid) return null;
  const row = await one(`
    SELECT u.id, u.email, u.name, u.phone, u.title, u.bio, u.role, u.leader_id, u.photo,
           l.name AS leader_name
    FROM sessions s JOIN users u ON u.id = s.user_id
    LEFT JOIN users l ON l.id = u.leader_id
    WHERE s.id = $1 AND s.expires_at > now()
  `, [sid]);
  if (!row) return null;
  return {
    id: row.id, email: row.email, name: row.name,
    phone: row.phone || '', title: row.title || '', bio: row.bio || '',
    role: row.role || 'user', leaderId: row.leader_id || null, leaderName: row.leader_name || '',
    photo: row.photo || ''
  };
}

function setSessionCookie(res, sid) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: SESSION_TTL_MS
  });
}

// ----- App -----
const app = express();
app.set('trust proxy', 1); // behind Render/most PaaS proxies, for secure cookies
app.use(express.json());
app.use(cookieParser());

// Resolve req.user from the session cookie — only for pages and API calls
// (skip static assets to avoid a DB hit per file).
app.use(async (req, res, next) => {
  const needsUser = req.path === '/' || req.path.endsWith('.html') || req.path.startsWith('/api/');
  if (needsUser) {
    try { req.user = await loadUserFromSession(req.cookies[SESSION_COOKIE]); }
    catch (e) { req.user = null; }
  }
  next();
});

// Wraps a route handler (sync or async) so any thrown/rejected error becomes a JSON 500.
function safe(handler) {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(err => {
        console.error(`[${req.method} ${req.path}] error:`, err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Server error: ' + (err.message || String(err)) });
        }
      });
  };
}

// ----- Google token helpers -----
async function saveGoogleTokens(userId, email, accessToken, refreshToken, expiresAt) {
  await q(`
    INSERT INTO google_accounts (user_id, email, access_token, refresh_token, expires_at)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id) DO UPDATE SET
      email = EXCLUDED.email,
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, google_accounts.refresh_token),
      expires_at = EXCLUDED.expires_at
  `, [userId, email, accessToken, refreshToken || null, expiresAt]);
}

// Returns a valid access token for the user, refreshing if needed. null if not connected.
async function getGoogleToken(userId) {
  const row = await one('SELECT * FROM google_accounts WHERE user_id = $1', [userId]);
  if (!row) return null;
  const exp = Number(row.expires_at);
  if (exp && exp > Date.now() + 60000) return row.access_token;
  if (!row.refresh_token) return row.access_token;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE.clientId, client_secret: GOOGLE.clientSecret,
      refresh_token: row.refresh_token, grant_type: 'refresh_token'
    })
  });
  const tok = await r.json();
  if (!r.ok) { console.error('Google token refresh failed:', tok); return null; }
  const expiresAt = Date.now() + (tok.expires_in || 3600) * 1000;
  await q('UPDATE google_accounts SET access_token = $1, expires_at = $2 WHERE user_id = $3',
    [tok.access_token, expiresAt, userId]);
  return tok.access_token;
}

// ----- API: auth -----
app.post('/api/register', safe(async (req, res) => {
  const { email, name, password } = req.body || {};
  if (!email || !name || !password) return res.status(400).json({ error: 'All fields are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const emailNorm = email.trim().toLowerCase();
  const existing = await one('SELECT id FROM users WHERE lower(email) = $1', [emailNorm]);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

  const hash = bcrypt.hashSync(password, 10);
  // The very first account to register becomes the Admin (superuser).
  const anyUser = await one('SELECT id FROM users LIMIT 1', []);
  const role = anyUser ? 'user' : 'admin';
  const row = await one('INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
    [emailNorm, name.trim(), hash, role]);

  const sid = await createSession(row.id);
  setSessionCookie(res, sid);
  res.json({ id: row.id, email: emailNorm, name: name.trim(), role });
}));

app.post('/api/login', safe(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = await one('SELECT * FROM users WHERE lower(email) = lower($1)', [email.trim()]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const sid = await createSession(user.id);
  setSessionCookie(res, sid);
  res.json({ id: user.id, email: user.email, name: user.name });
}));

app.post('/api/logout', safe(async (req, res) => {
  const sid = req.cookies[SESSION_COOKIE];
  if (sid) await q('DELETE FROM sessions WHERE id = $1', [sid]);
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
}));

app.get('/api/me', safe((req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  res.json(req.user);
}));

app.post('/api/profile', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const { name, phone, title, bio } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
  if (name.trim().length > 80) return res.status(400).json({ error: 'Name is too long.' });

  const updated = await one(`
    UPDATE users SET name = $1, phone = $2, title = $3, bio = $4 WHERE id = $5
    RETURNING id, email, name, phone, title, bio
  `, [name.trim(), (phone || '').trim(), (title || '').trim(), (bio || '').trim(), req.user.id]);

  res.json({
    id: updated.id, email: updated.email, name: updated.name,
    phone: updated.phone || '', title: updated.title || '', bio: updated.bio || ''
  });
}));

app.post('/api/change-password', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required.' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });

  const row = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!row || !bcrypt.compareSync(currentPassword, row.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  const newHash = bcrypt.hashSync(newPassword, 10);
  await q('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);
  res.json({ ok: true });
}));

// Set or remove the profile photo (a small resized data URL, or empty to clear).
app.post('/api/profile/photo', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  let photo = (req.body && req.body.photo) ? String(req.body.photo) : '';
  if (photo) {
    if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(photo)) {
      return res.status(400).json({ error: 'Photo must be a PNG, JPG, WebP, or GIF image.' });
    }
    if (photo.length > 700000) return res.status(400).json({ error: 'Image is too large after processing.' });
  }
  await q('UPDATE users SET photo = $1 WHERE id = $2', [photo || null, req.user.id]);
  res.json({ ok: true, photo });
}));

// ----- Roles, teams & invitations -----
const ASSIGNABLE_ROLES = ['team_leader', 'user'];

// Admin: list all accounts with their role + leader.
app.get('/api/admin/users', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only.' });
  const rows = await q(`
    SELECT u.id, u.name, u.email, u.role, l.name AS leader_name
    FROM users u LEFT JOIN users l ON l.id = u.leader_id
    ORDER BY (u.role='admin') DESC, (u.role='team_leader') DESC, lower(u.name)
  `, []);
  res.json(rows.map(r => ({ id: r.id, name: r.name, email: r.email, role: r.role || 'user', leaderName: r.leader_name || '' })));
}));

// Admin: change a user's role (team_leader <-> user). Admins are not editable here.
app.patch('/api/admin/users/:id/role', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid user id.' });
  const role = (req.body || {}).role;
  if (!ASSIGNABLE_ROLES.includes(role)) return res.status(400).json({ error: 'Role must be team_leader or user.' });
  const target = await one('SELECT id, role FROM users WHERE id = $1', [id]);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.role === 'admin') return res.status(400).json({ error: 'The admin role cannot be changed.' });

  await q('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
  // Demoting a leader to a plain user: orphan their members + cancel pending invites.
  if (target.role === 'team_leader' && role === 'user') {
    await q('UPDATE users SET leader_id = NULL WHERE leader_id = $1', [id]);
    await q(`UPDATE team_invites SET status = 'cancelled' WHERE leader_id = $1 AND status = 'pending'`, [id]);
  }
  res.json({ ok: true, role });
}));

// Admin: view the members under any team leader.
app.get('/api/admin/users/:id/team', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid user id.' });
  const leader = await one('SELECT id, name FROM users WHERE id = $1', [id]);
  if (!leader) return res.status(404).json({ error: 'User not found.' });
  const members = await q('SELECT id, name, email FROM users WHERE leader_id = $1 ORDER BY lower(name)', [id]);
  res.json({ leaderName: leader.name, members: members.map(m => ({ id: m.id, name: m.name, email: m.email })) });
}));

// Leader: my team (members + pending invites) and users I can still invite.
app.get('/api/team', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  if (req.user.role !== 'team_leader') return res.status(403).json({ error: 'Team leaders only.' });
  const members = await q('SELECT id, name, email FROM users WHERE leader_id = $1 ORDER BY lower(name)', [req.user.id]);
  const pending = await q(`
    SELECT ti.id, u.name, u.email FROM team_invites ti JOIN users u ON u.id = ti.user_id
    WHERE ti.leader_id = $1 AND ti.status = 'pending' ORDER BY ti.id DESC
  `, [req.user.id]);
  // Candidates: plain users with no team, excluding those already invited by me.
  const candidates = await q(`
    SELECT id, name, email FROM users
    WHERE role = 'user' AND leader_id IS NULL
      AND id NOT IN (SELECT user_id FROM team_invites WHERE leader_id = $1 AND status = 'pending')
    ORDER BY lower(name)
  `, [req.user.id]);
  res.json({
    members: members.map(m => ({ id: m.id, name: m.name, email: m.email })),
    pending: pending.map(p => ({ id: p.id, name: p.name, email: p.email })),
    candidates: candidates.map(c => ({ id: c.id, name: c.name, email: c.email }))
  });
}));

// Leader: invite a user to my team.
app.post('/api/team/invite', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  if (req.user.role !== 'team_leader') return res.status(403).json({ error: 'Team leaders only.' });
  const userId = Number((req.body || {}).userId);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid user.' });
  const target = await one('SELECT id, name, role, leader_id FROM users WHERE id = $1', [userId]);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.role !== 'user') return res.status(400).json({ error: 'Only regular users can be invited.' });
  if (target.leader_id) return res.status(400).json({ error: 'That user is already on a team.' });
  const dup = await one(`SELECT id FROM team_invites WHERE leader_id = $1 AND user_id = $2 AND status = 'pending'`, [req.user.id, userId]);
  if (dup) return res.status(409).json({ error: 'You already invited this user.' });
  await one(`INSERT INTO team_invites (leader_id, user_id, status) VALUES ($1, $2, 'pending') RETURNING id`, [req.user.id, userId]);
  res.json({ ok: true });
}));

// Leader: remove a member from my team.
app.delete('/api/team/members/:id', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  if (req.user.role !== 'team_leader') return res.status(403).json({ error: 'Team leaders only.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid user id.' });
  const r = await pool.query('UPDATE users SET leader_id = NULL WHERE id = $1 AND leader_id = $2', [id, req.user.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'Member not found on your team.' });
  res.json({ ok: true });
}));

// Invitee: my pending team invitations (surfaced in notifications).
app.get('/api/invites', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const rows = await q(`
    SELECT ti.id, u.name AS leader_name FROM team_invites ti JOIN users u ON u.id = ti.leader_id
    WHERE ti.user_id = $1 AND ti.status = 'pending' ORDER BY ti.id DESC
  `, [req.user.id]);
  res.json(rows.map(r => ({ id: r.id, leaderName: r.leader_name })));
}));

// Invitee: accept or reject a team invitation.
app.post('/api/invites/:id/respond', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid invite id.' });
  const action = (req.body || {}).action;
  if (!['accept', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action.' });
  const inv = await one(`SELECT id, leader_id FROM team_invites WHERE id = $1 AND user_id = $2 AND status = 'pending'`, [id, req.user.id]);
  if (!inv) return res.status(404).json({ error: 'Invitation not found.' });

  if (action === 'reject') {
    await q(`UPDATE team_invites SET status = 'rejected' WHERE id = $1`, [id]);
    return res.json({ ok: true, status: 'rejected' });
  }
  // Accept: join this team and decline any other pending invites for me.
  await q('UPDATE users SET leader_id = $1 WHERE id = $2', [inv.leader_id, req.user.id]);
  await q(`UPDATE team_invites SET status = 'accepted' WHERE id = $1`, [id]);
  await q(`UPDATE team_invites SET status = 'cancelled' WHERE user_id = $1 AND status = 'pending' AND id <> $2`, [req.user.id, id]);
  res.json({ ok: true, status: 'accepted' });
}));

// ----- Events -----
app.get('/api/events', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const rows = await q(`
    SELECT id, date, start_time, end_time, title, type, with_person
    FROM events WHERE user_id = $1 ORDER BY date, start_time
  `, [req.user.id]);
  res.json(rows.map(r => ({
    id: r.id, date: r.date, start: r.start_time, end: r.end_time,
    title: r.title, type: r.type, with: r.with_person || ''
  })));
}));

app.post('/api/events', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const { date, start, end, title, type } = req.body || {};
  const withPerson = (req.body && req.body.with) || '';

  if (!date || !start || !end || !title || !type) {
    return res.status(400).json({ error: 'Title, type, date, start, and end are required.' });
  }
  if (!['meeting', 'call', 'followup'].includes(type)) return res.status(400).json({ error: 'Invalid event type.' });
  if (end === start) return res.status(400).json({ error: 'End time must be different from the start time.' });

  const startAt = new Date(`${date}T${start}`);
  if (isNaN(startAt.getTime())) return res.status(400).json({ error: 'Invalid date or time.' });
  if (startAt.getTime() < Date.now()) return res.status(400).json({ error: 'Event cannot be scheduled in the past.' });

  const row = await one(`
    INSERT INTO events (user_id, date, start_time, end_time, title, type, with_person)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
  `, [req.user.id, date, start, end, title.trim(), type, withPerson.trim()]);

  res.json({ id: row.id, date, start, end, title: title.trim(), type, with: withPerson.trim() });
}));

app.delete('/api/events/:id', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid event id.' });
  const r = await pool.query('DELETE FROM events WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'Event not found.' });
  res.json({ ok: true });
}));

// ----- Call log -----
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtCallDate(d) {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${h}:${String(m).padStart(2, '0')} ${ap}`;
}
function shortName(name) {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || '';
  return `${parts[0]} ${parts[1][0]}.`;
}

app.get('/api/call-log', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const rows = await q(`
    SELECT id, name, phone, direction, duration, outcome, notes, agent, is_realtor, logged_at
    FROM call_log WHERE user_id = $1 ORDER BY id DESC
  `, [req.user.id]);
  res.json(rows.map(r => ({
    id: r.id, name: r.name, phone: r.phone || '', direction: r.direction || 'outbound',
    duration: r.duration || '', outcome: r.outcome, notes: r.notes || '—',
    agent: r.agent || '', isRealtor: !!r.is_realtor, date: r.logged_at
  })));
}));

app.post('/api/call-log', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const { name, phone, outcome, duration, notes } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Contact name is required.' });
  if (!['Connected', 'Voicemail', 'No Answer', 'Missed'].includes(outcome)) return res.status(400).json({ error: 'Please choose a valid outcome.' });

  const agent = shortName(req.user.name);
  const loggedAt = fmtCallDate(new Date());
  // No conversation happened on a voicemail / no-answer, so leave duration blank.
  const noTalk = outcome === 'Voicemail' || outcome === 'No Answer' || outcome === 'Missed';
  const dur = noTalk ? '' : ((duration || '0:00').trim() || '0:00');
  const note = (notes || '').trim() || '—';
  const isRealtor = (req.body || {}).isRealtor === true;

  const row = await one(`
    INSERT INTO call_log (user_id, name, phone, direction, duration, outcome, notes, agent, is_realtor, logged_at)
    VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, $9) RETURNING id
  `, [req.user.id, name.trim(), (phone || '').trim(), dur, outcome, note, agent, isRealtor, loggedAt]);

  res.json({
    id: row.id, name: name.trim(), phone: (phone || '').trim(), direction: 'outbound',
    duration: dur, outcome, notes: note, agent, isRealtor, date: loggedAt
  });
}));

// ----- Call queue -----
const CALL_PRIORITIES = ['High', 'Medium', 'Low'];

app.get('/api/call-queue', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const rows = await q(`
    SELECT id, name, phone, priority, call_time, call_date, reason
    FROM call_queue WHERE user_id = $1 ORDER BY id DESC
  `, [req.user.id]);
  res.json(rows.map(r => ({
    id: r.id, name: r.name, phone: r.phone || '', priority: r.priority || 'Medium',
    time: r.call_time || '', date: r.call_date || '', reason: r.reason || ''
  })));
}));

app.post('/api/call-queue', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const { name, phone, time, date, reason } = req.body || {};
  const priority = CALL_PRIORITIES.includes(req.body && req.body.priority) ? req.body.priority : 'Medium';
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
  // Default to today (caller's date if sent, else the server's) so the queue is per-day.
  const callDate = (date && String(date).trim()) || serverToday();

  const row = await one(`
    INSERT INTO call_queue (user_id, name, phone, priority, call_time, call_date, reason)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
  `, [req.user.id, name.trim(), (phone || '').trim(), priority, (time || '').trim(), callDate, (reason || '').trim()]);

  res.json({
    id: row.id, name: name.trim(), phone: (phone || '').trim(),
    priority, time: (time || '').trim(), date: callDate, reason: (reason || '').trim()
  });
}));

app.patch('/api/call-queue/:id', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid queue id.' });
  const b = req.body || {};
  const sets = [];
  const params = [];
  const out = {};
  if (b.time != null)   { params.push(String(b.time).trim());   sets.push(`call_time = $${params.length}`); out.time = String(b.time).trim(); }
  if (b.date != null)   { params.push(String(b.date).trim());   sets.push(`call_date = $${params.length}`); out.date = String(b.date).trim(); }
  if (b.reason != null) { params.push(String(b.reason).trim()); sets.push(`reason = $${params.length}`);    out.reason = String(b.reason).trim(); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  params.push(id, req.user.id);
  const r = await pool.query(
    `UPDATE call_queue SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND user_id = $${params.length}`,
    params
  );
  if (r.rowCount === 0) return res.status(404).json({ error: 'Queue item not found.' });
  res.json({ ok: true, ...out });
}));

app.delete('/api/call-queue/:id', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid queue id.' });
  const r = await pool.query('DELETE FROM call_queue WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'Queue item not found.' });
  res.json({ ok: true });
}));

// ----- Campaigns -----
const CAMPAIGN_CHANNELS = ['Email', 'SMS'];
const CAMPAIGN_STATUSES = ['Draft', 'Scheduled', 'Active', 'Paused', 'Completed'];

// Audience segments — each is a fixed (no user input) WHERE clause over the
// sender's own leads. Only leads with a usable email become recipients.
const CAMPAIGN_AUDIENCES = [
  { key: 'all',         label: 'All leads',          where: '' },
  { key: 'buying_now',  label: 'Buying Immediately', where: "timeline = 'Buying Immediately'" },
  { key: 'm1_3',        label: '1-3 Months',         where: "timeline = '1-3 Months'" },
  { key: 'm3_6',        label: '3-6 Months',         where: "timeline = '3-6 Months'" },
  { key: 'm6',          label: '6+ Months',          where: "timeline = '6+ Months'" },
  { key: 'preapproved', label: 'Pre-approved leads', where: 'preapproved = true' },
  { key: 'purchase',    label: 'Purchase leads',     where: "lead_type = 'Purchase'" },
  { key: 'refinance',   label: 'Refinance leads',    where: "lead_type = 'Refinance'" }
];
function audienceByKey(k) { return CAMPAIGN_AUDIENCES.find(a => a.key === k) || null; }
function audienceLabel(k) { const a = audienceByKey(k); return a ? a.label : ''; }
function audienceWhere(key) {
  const a = audienceByKey(key);
  if (!a) return null;
  const cond = ['user_id = $1', 'email IS NOT NULL', "btrim(email) <> ''"];
  if (a.where) cond.push(a.where);
  return cond.join(' AND ');
}
async function segmentLeads(userId, key) {
  const where = audienceWhere(key);
  if (!where) return [];
  return q(`SELECT name, email, state FROM leads WHERE ${where} ORDER BY id DESC`, [userId]);
}
async function segmentCount(userId, key) {
  const where = audienceWhere(key);
  if (!where) return 0;
  const r = await one(`SELECT COUNT(*)::int AS n FROM leads WHERE ${where}`, [userId]);
  return r ? r.n : 0;
}
// Replace {{first_name}}, {{name}}, {{email}}, {{state}} per recipient.
function personalize(text, lead) {
  const first = String(lead.name || '').trim().split(/\s+/)[0] || 'there';
  return String(text || '')
    .replace(/\{\{\s*first_name\s*\}\}/gi, first)
    .replace(/\{\{\s*name\s*\}\}/gi, String(lead.name || ''))
    .replace(/\{\{\s*email\s*\}\}/gi, String(lead.email || ''))
    .replace(/\{\{\s*state\s*\}\}/gi, String(lead.state || ''));
}

function fmtShortDate(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}
function campaignToJson(r) {
  return {
    id: r.id, name: r.name, type: r.channel, status: r.status,
    subject: r.subject || '', body: r.body || '',
    audience: r.audience || 'all', audienceLabel: audienceLabel(r.audience || 'all'),
    recipients: r.recipients || 0, sent: r.sent || 0, failed: r.failed || 0,
    opens: r.opens || 0, clicks: r.clicks || 0, replies: r.replies || 0,
    started: fmtShortDate(r.created_at)
  };
}

app.get('/api/campaigns', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const rows = await q(`
    SELECT id, name, channel, status, subject, body, audience, recipients, sent, failed, opens, clicks, replies, created_at
    FROM campaigns WHERE user_id = $1 ORDER BY id DESC
  `, [req.user.id]);
  res.json(rows.map(campaignToJson));
}));

// Audience options with live recipient counts (for the create form).
app.get('/api/campaigns/audiences', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const out = [];
  for (const a of CAMPAIGN_AUDIENCES) out.push({ key: a.key, label: a.label, count: await segmentCount(req.user.id, a.key) });
  res.json(out);
}));

app.post('/api/campaigns', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const channel = CAMPAIGN_CHANNELS.includes(b.channel) ? b.channel : 'Email';
  const subject = String(b.subject || '').trim();
  const body = String(b.body || '').trim();
  const audience = audienceByKey(b.audience) ? b.audience : 'all';
  if (!name) return res.status(400).json({ error: 'Campaign name is required.' });

  const row = await one(`
    INSERT INTO campaigns (user_id, name, channel, status, subject, body, audience)
    VALUES ($1, $2, $3, 'Draft', $4, $5, $6)
    RETURNING id, name, channel, status, subject, body, audience, recipients, sent, failed, opens, clicks, replies, created_at
  `, [req.user.id, name, channel, subject, body, audience]);
  res.json(campaignToJson(row));
}));

// Background send: personalize and deliver to every recipient via the sender's
// own Gmail (or shared SMTP). Runs after the response so the request never times out.
async function runCampaignSend(id, userId, recipients, subject, body) {
  let sent = 0, failed = 0;
  for (const lead of recipients) {
    try {
      await sendEmailAsUser(userId, { to: lead.email, subject: personalize(subject, lead), text: personalize(body, lead) });
      sent++;
    } catch (e) { failed++; }
    if ((sent + failed) % 10 === 0) {
      try { await q('UPDATE campaigns SET sent = $2, failed = $3 WHERE id = $1', [id, sent, failed]); } catch (e) {}
    }
  }
  try { await q(`UPDATE campaigns SET sent = $2, failed = $3, status = 'Completed' WHERE id = $1`, [id, sent, failed]); } catch (e) {}
}

app.post('/api/campaigns/:id/send', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid campaign id.' });
  const c = await one('SELECT * FROM campaigns WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (!c) return res.status(404).json({ error: 'Campaign not found.' });
  if (c.channel !== 'Email') return res.status(400).json({ error: 'Only email campaigns can be sent right now.' });
  if (!String(c.subject || '').trim() || !String(c.body || '').trim()) {
    return res.status(400).json({ error: 'Add a subject and message before sending.' });
  }
  const canSend = (await userHasGmail(req.user.id)) || !!smtpConfig();
  if (!canSend) return res.status(400).json({ error: 'Connect your Google account on the Messages page before sending campaigns.' });

  const recipients = await segmentLeads(req.user.id, c.audience);
  if (!recipients.length) return res.status(400).json({ error: 'No recipients with an email in this audience.' });

  // Claim atomically so a double-click can't start two sends.
  const claimed = await one(
    `UPDATE campaigns SET status = 'Sending', recipients = $3, sent = 0, failed = 0, sent_at = now()
     WHERE id = $1 AND user_id = $2 AND status <> 'Sending' RETURNING id`,
    [id, req.user.id, recipients.length]
  );
  if (!claimed) return res.status(409).json({ error: 'This campaign is already sending.' });

  runCampaignSend(id, req.user.id, recipients, c.subject, c.body); // fire-and-forget
  res.json({ ok: true, recipients: recipients.length, status: 'Sending' });
}));

app.delete('/api/campaigns/:id', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid campaign id.' });
  const r = await pool.query('DELETE FROM campaigns WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'Campaign not found.' });
  res.json({ ok: true });
}));

// ----- Scheduled messages -----
app.get('/api/scheduled', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const rows = await q(`
    SELECT id, recipient, channel, type, send_date, send_time, status, sent_at, error, body
    FROM scheduled_messages WHERE user_id = $1 ORDER BY send_date, send_time
  `, [req.user.id]);
  res.json(rows.map(r => ({
    id: r.id, to: r.recipient, channel: r.channel, type: r.type,
    date: r.send_date, time24: r.send_time,
    status: r.status || 'pending', sentAt: r.sent_at, error: r.error || '', body: r.body || ''
  })));
}));

app.post('/api/scheduled', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const { recipient, channel, type, date, time, sendAt, body } = req.body || {};
  if (!recipient || !recipient.trim()) return res.status(400).json({ error: 'Recipient is required.' });
  if (!type || !type.trim())           return res.status(400).json({ error: 'Message type is required.' });
  if (!date || !time)                  return res.status(400).json({ error: 'Date and time are required.' });
  if (!['Email', 'SMS'].includes(channel)) return res.status(400).json({ error: 'Channel must be Email or SMS.' });
  // sendAt is the precise UTC instant computed client-side from local date+time.
  const sendAtDate = sendAt ? new Date(sendAt) : null;
  const sendAtVal = (sendAtDate && !isNaN(sendAtDate.getTime())) ? sendAtDate.toISOString() : null;
  // Reject clearly-past send times (small grace for client/server clock skew).
  if (sendAtVal && sendAtDate.getTime() < Date.now() - 120000) {
    return res.status(400).json({ error: "That time has already passed — you can't schedule a message in the past." });
  }

  const row = await one(`
    INSERT INTO scheduled_messages (user_id, recipient, channel, type, send_date, send_time, send_at, status, body)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8) RETURNING id
  `, [req.user.id, recipient.trim(), channel, type.trim(), date, time, sendAtVal, (body || '').trim()]);

  res.json({
    id: row.id, to: recipient.trim(), channel, type: type.trim(),
    date, time24: time, status: 'pending', sentAt: null, error: '', body: (body || '').trim()
  });
}));

// ----- Email delivery -----
// Primary path is per-user Gmail (OAuth) so each user sends as themselves.
// An optional shared SMTP backend (e.g. a Google Workspace mailbox) covers
// system/automated mail from users who haven't connected their own account.
function envClean(name) { return (process.env[name] || '').trim().replace(/^["']|["']$/g, ''); }

function smtpConfig() {
  const user = envClean('SMTP_USER');
  const pass = envClean('SMTP_PASS') || envClean('SMTP_APP_PASSWORD');
  if (!user || !pass) return null;
  return {
    host: envClean('SMTP_HOST') || 'smtp.gmail.com',
    port: Number(envClean('SMTP_PORT')) || 587,
    user,
    pass,
    from: envClean('SMTP_FROM') || user
  };
}

let _smtpTransport = null;
function getSmtpTransport(cfg) {
  if (!_smtpTransport) {
    _smtpTransport = nodemailer.createTransport({
      host: cfg.host, port: cfg.port,
      secure: cfg.port === 465,          // 465 = implicit TLS; 587 = STARTTLS
      auth: { user: cfg.user, pass: cfg.pass }
    });
  }
  return _smtpTransport;
}

// Sends one email through an authenticated SMTP server (Google Workspace, etc.).
async function sendEmailViaSMTP({ to, subject, text }) {
  const cfg = smtpConfig();
  if (!cfg) throw new Error('SMTP not configured (set SMTP_USER and SMTP_PASS).');
  // Gmail app passwords are shown with spaces; strip them so auth doesn't fail.
  cfg.pass = cfg.pass.replace(/\s+/g, '');
  await getSmtpTransport(cfg).sendMail({
    from: cfg.from, to, subject: subject || '(no subject)', text: text || ''
  });
}

// Shared backend: the optional SMTP mailbox. Used only when a user hasn't
// connected their own Google account. Throws a clear, actionable error otherwise.
function emailProvider() { return smtpConfig() ? 'smtp' : 'none'; }
async function sendEmail(opts) {
  if (!smtpConfig()) {
    throw new Error('Email isn’t set up. Connect your Google account on the Messages page to send as yourself.');
  }
  return sendEmailViaSMTP(opts);
}

// ----- Per-user sending via the Gmail API (OAuth, no app passwords) -----
// Each user connects their own Google account once; we then send on their
// behalf so the email comes from their own name/address. This is the path that
// lets many users each send as themselves.
function mimeFromHeader(name, email) {
  const clean = String(name || '').replace(/[\r\n"]/g, '').trim();
  return clean ? `"${clean}" <${email}>` : email;
}
function base64url(str) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// RFC 2047 encode a header value so non-ASCII subjects survive.
function encodeHeader(v) {
  const s = String(v || '');
  return /[^\x00-\x7F]/.test(s) ? `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=` : s;
}
async function sendEmailViaGmail(userId, { to, subject, text, replyTo }) {
  const acct = await one(
    `SELECT g.email AS gmail, u.name AS name FROM google_accounts g JOIN users u ON u.id = g.user_id WHERE g.user_id = $1`,
    [userId]
  );
  if (!acct) throw new Error('No connected Google account for this user.');
  const token = await getGoogleToken(userId);
  if (!token) throw new Error('Google account needs to be reconnected.');
  const headers = [
    `From: ${mimeFromHeader(acct.name, acct.gmail)}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject || '(no subject)')}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"'
  ];
  if (replyTo) headers.push(`Reply-To: ${replyTo}`);
  const raw = base64url(headers.join('\r\n') + '\r\n\r\n' + (text || ''));
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Gmail API ${r.status}: ${t.slice(0, 200)}`);
  }
  return acct.gmail;
}
async function userHasGmail(userId) {
  if (!userId) return false;
  return !!(await one('SELECT 1 AS x FROM google_accounts WHERE user_id = $1', [userId]));
}
// Send as the given user when they've connected Google; else use the shared backend.
async function sendEmailAsUser(userId, opts) {
  if (await userHasGmail(userId)) return sendEmailViaGmail(userId, opts);
  return sendEmail(opts);
}

// Cron-triggered dispatcher: sends due pending emails. Protected by CRON_SECRET
// (passed as ?key=... or "Authorization: Bearer ...") since there's no user session.
// Atomically claims rows as 'sending' so overlapping runs can't double-send.
async function dispatchScheduled(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'Dispatch disabled (CRON_SECRET not set).' });
  const provided = (req.query && req.query.key) ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (provided !== secret) return res.status(401).json({ error: 'Unauthorized.' });

  const due = await q(`
    UPDATE scheduled_messages SET status = 'sending'
    WHERE id IN (
      SELECT id FROM scheduled_messages
      WHERE status = 'pending' AND channel = 'Email' AND send_at IS NOT NULL AND send_at <= now()
      ORDER BY send_at LIMIT 50 FOR UPDATE SKIP LOCKED
    )
    RETURNING id, user_id, recipient, type, body
  `, []);

  let sent = 0, failed = 0;
  for (const m of due) {
    try {
      // Send as the message's owner (their Gmail) when connected; else shared backend.
      await sendEmailAsUser(m.user_id, { to: m.recipient, subject: m.type, text: m.body || '' });
      await pool.query(`UPDATE scheduled_messages SET status = 'sent', sent_at = now(), error = NULL WHERE id = $1`, [m.id]);
      sent++;
    } catch (e) {
      await pool.query(`UPDATE scheduled_messages SET status = 'failed', error = $2 WHERE id = $1`,
        [m.id, String((e && e.message) || e).slice(0, 500)]);
      failed++;
    }
  }
  res.json({ ok: true, claimed: due.length, sent, failed });
}
app.get('/api/cron/dispatch', safe(dispatchScheduled));
app.post('/api/cron/dispatch', safe(dispatchScheduled));

// Email config status (no secrets leaked) so the UI can show what's wired up.
app.get('/api/email/status', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const smtp = smtpConfig();
  const sharedReady = !!smtp;
  const gAcct = await one('SELECT email FROM google_accounts WHERE user_id = $1', [req.user.id]);
  res.json({
    // Per-user Gmail (preferred — sends as the user themselves).
    gmailConfigured: googleConfigured(),
    gmailConnected: !!gAcct,
    gmailEmail: gAcct ? gAcct.email : '',
    // Optional shared SMTP fallback (used when a user hasn't connected Google).
    sharedReady,
    smtpHost: smtp ? smtp.host : '',
    from: smtp ? smtp.from : '',
    ready: gAcct ? true : sharedReady,       // can this user send right now?
    cronSet: !!process.env.CRON_SECRET
  });
}));

// Send a one-off test email and surface the exact result/error.
app.post('/api/email/test', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const to = String((req.body || {}).to || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: 'Enter a valid recipient email.' });
  try {
    // Sends as the current user (their Gmail) when connected, else shared backend.
    const sentFrom = await sendEmailAsUser(req.user.id, {
      to,
      subject: 'LeadFlow test email',
      text: 'This is a test email from LeadFlow to confirm email delivery is working.\n\nIf you received this, email sending is configured correctly.'
    });
    res.json({ ok: true, sentVia: (await userHasGmail(req.user.id)) ? 'gmail' : emailProvider(), from: sentFrom || '' });
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) });
  }
}));

// Send one of the user's own scheduled emails immediately (the "Send now" button).
app.post('/api/scheduled/:id/send', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid message id.' });

  // Claim it: must be the user's, an Email, and not already sent/in-flight.
  const m = await one(`
    UPDATE scheduled_messages SET status = 'sending'
    WHERE id = $1 AND user_id = $2 AND channel = 'Email' AND status IN ('pending', 'failed')
    RETURNING id, recipient, type, body
  `, [id, req.user.id]);
  if (!m) {
    const cur = await one('SELECT channel, status FROM scheduled_messages WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!cur) return res.status(404).json({ error: 'Message not found.' });
    if (cur.channel !== 'Email') return res.status(400).json({ error: 'Only email messages can be sent.' });
    if (cur.status === 'sent') return res.status(400).json({ error: 'This message was already sent.' });
    return res.status(409).json({ error: 'This message is already sending.' });
  }
  try {
    await sendEmailAsUser(req.user.id, { to: m.recipient, subject: m.type, text: m.body || '' });
    await pool.query(`UPDATE scheduled_messages SET status = 'sent', sent_at = now(), error = NULL WHERE id = $1`, [id]);
    res.json({ ok: true, status: 'sent' });
  } catch (e) {
    const msg = String((e && e.message) || e).slice(0, 500);
    await pool.query(`UPDATE scheduled_messages SET status = 'failed', error = $2 WHERE id = $1`, [id, msg]);
    res.status(502).json({ error: 'Send failed: ' + msg, status: 'failed' });
  }
}));

app.delete('/api/scheduled/:id', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid message id.' });
  const r = await pool.query('DELETE FROM scheduled_messages WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'Message not found.' });
  res.json({ ok: true });
}));

// ----- Leads -----
const LEAD_TIMELINES = ['Buying Immediately', '1-3 Months', '3-6 Months', '6+ Months'];
const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware',
  'District of Columbia','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas',
  'Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi',
  'Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York',
  'North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
  'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington',
  'West Virginia','Wisconsin','Wyoming'
];
const normalizeState = (s) => (US_STATES.includes(s) ? s : '');
const LEAD_TYPES = ['Purchase', 'Refinance'];
const REFI_TYPES = ['Rate & Term', 'Cash Out'];
const REALTOR_STATUSES = ['has', 'unavailable', 'none'];

function computeLeadScore(timeline, phone, leadType, refiType, preapproved, realtorStatus) {
  const base = {
    'Buying Immediately': 85, '1-3 Months': 70, '3-6 Months': 50, '6+ Months': 35
  }[timeline] || 50;
  const phoneBonus = (phone && phone.trim()) ? 10 : 0;
  // Cash-out refinances are weighted higher than rate & term.
  let refiBonus = 0;
  if (leadType === 'Refinance') refiBonus = refiType === 'Cash Out' ? 15 : 5;
  const preapprovedBonus = preapproved ? 10 : 0;
  const realtorBonus = realtorStatus === 'has' ? 5 : 0;
  return Math.min(100, base + phoneBonus + refiBonus + preapprovedBonus + realtorBonus);
}

// Normalize the lead-type fields from a request body (clears irrelevant ones).
function normalizeLeadType(b) {
  const leadType = LEAD_TYPES.includes(b.leadType) ? b.leadType : 'Purchase';
  const out = { leadType, refiType: null, realtorStatus: null, realtorName: '', realtorEmail: '', realtorPhone: '' };
  if (leadType === 'Refinance') {
    out.refiType = REFI_TYPES.includes(b.refiType) ? b.refiType : 'Rate & Term';
  } else {
    out.realtorStatus = REALTOR_STATUSES.includes(b.realtorStatus) ? b.realtorStatus : 'none';
    if (out.realtorStatus === 'has') {
      out.realtorName = String(b.realtorName || '').trim();
      out.realtorEmail = String(b.realtorEmail || '').trim();
      out.realtorPhone = String(b.realtorPhone || '').trim();
    }
  }
  out.preapproved = b.preapproved === true || b.preapproved === 'yes' || b.preapproved === 'true';
  return out;
}
function leadRowToJson(r) {
  return {
    id: r.id, name: r.name, email: r.email || '', phone: r.phone || '',
    timeline: r.timeline, score: r.score, owner: r.owner || '', notes: r.notes || '',
    state: r.state || '',
    preapproved: !!r.preapproved, leadType: r.lead_type || 'Purchase', refiType: r.refi_type || '',
    realtorStatus: r.realtor_status || 'none', realtorName: r.realtor_name || '',
    realtorEmail: r.realtor_email || '', realtorPhone: r.realtor_phone || '',
    assignedByName: r.assigned_by_name || '',
    ownerUserName: r.owner_user_name || '',
    last: 'Just now', created: r.created_at
  };
}

app.get('/api/leads', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  // The admin (superuser) sees every lead across all users and team leaders;
  // everyone else sees only their own. The owning user's name is joined in so
  // the admin view can tag each lead with a "lead owner" pill.
  const isAdmin = req.user.role === 'admin';
  const rows = await q(`
    SELECT le.id, le.name, le.email, le.phone, le.timeline, le.score, le.owner, le.notes, le.state,
           le.preapproved, le.lead_type, le.refi_type, le.realtor_status, le.realtor_name, le.realtor_email, le.realtor_phone,
           le.created_at, ab.name AS assigned_by_name, ou.name AS owner_user_name
    FROM leads le
    LEFT JOIN users ab ON ab.id = le.assigned_by
    LEFT JOIN users ou ON ou.id = le.user_id
    ${isAdmin ? '' : 'WHERE le.user_id = $1'}
    ORDER BY le.id DESC
  `, isAdmin ? [] : [req.user.id]);
  res.json(rows.map(leadRowToJson));
}));

app.post('/api/leads', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const { name, email, phone, timeline, owner, notes } = req.body || {};
  if (!name || !name.trim())   return res.status(400).json({ error: 'Name is required.' });
  if (!email || !email.trim()) return res.status(400).json({ error: 'Email is required.' });
  if (!LEAD_TIMELINES.includes(timeline)) return res.status(400).json({ error: 'Invalid buying timeline.' });

  const f = normalizeLeadType(req.body || {});
  const state = normalizeState((req.body || {}).state);
  const score = computeLeadScore(timeline, phone, f.leadType, f.refiType, f.preapproved, f.realtorStatus);
  const row = await one(`
    INSERT INTO leads (user_id, name, email, phone, timeline, score, owner, notes, state,
                       preapproved, lead_type, refi_type, realtor_status, realtor_name, realtor_email, realtor_phone)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id
  `, [req.user.id, name.trim(), email.trim(), (phone || '').trim(), timeline, score, (owner || '').trim(), (notes || '').trim(), state,
      f.preapproved, f.leadType, f.refiType, f.realtorStatus, f.realtorName, f.realtorEmail, f.realtorPhone]);

  res.json(leadRowToJson({
    id: row.id, name: name.trim(), email: email.trim(), phone: (phone || '').trim(),
    timeline, score, owner: (owner || '').trim(), notes: (notes || '').trim(), state,
    preapproved: f.preapproved, lead_type: f.leadType, refi_type: f.refiType,
    realtor_status: f.realtorStatus, realtor_name: f.realtorName, realtor_email: f.realtorEmail, realtor_phone: f.realtorPhone
  }));
}));

// Bulk-import leads from a CSV (rows pre-mapped client-side). Dedupes by email.
app.post('/api/leads/import', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const rows = (req.body || {}).rows;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No rows to import.' });
  if (rows.length > 5000) return res.status(400).json({ error: 'Too many rows (max 5000 per import).' });

  const ex = await q(`SELECT lower(email) AS e FROM leads WHERE user_id = $1 AND email IS NOT NULL AND btrim(email) <> ''`, [req.user.id]);
  const seen = new Set(ex.map(r => r.e));

  let imported = 0, skipped = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object') { skipped++; continue; }
    const name = String(row.name || '').trim();
    if (!name) { skipped++; continue; }                       // need at least a name
    const email = String(row.email || '').trim();
    const key = email.toLowerCase();
    if (email && seen.has(key)) { skipped++; continue; }       // duplicate email
    const phone = String(row.phone || '').trim();
    const owner = String(row.owner || '').trim();
    const state = normalizeState(row.state);
    const timeline = LEAD_TIMELINES.includes(row.timeline) ? row.timeline : '1-3 Months';
    const score = computeLeadScore(timeline, phone, 'Purchase', null, false, 'none');
    await pool.query(
      `INSERT INTO leads (user_id, name, email, phone, timeline, score, owner, state, lead_type, realtor_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Purchase','none')`,
      [req.user.id, name, email, phone, timeline, score, owner, state]);
    imported++;
    if (email) seen.add(key);
  }
  res.json({ ok: true, imported, skipped });
}));

app.patch('/api/leads/:id', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid lead id.' });
  const cur = await one(`SELECT name, email, phone, timeline, owner, notes, state,
    preapproved, lead_type, refi_type, realtor_status, realtor_name, realtor_email, realtor_phone
    FROM leads WHERE id = $1 AND user_id = $2`, [id, req.user.id]);
  if (!cur) return res.status(404).json({ error: 'Lead not found.' });

  const b = req.body || {};
  const name     = b.name     != null ? String(b.name).trim()  : cur.name;
  const email    = b.email    != null ? String(b.email).trim() : (cur.email || '');
  const phone    = b.phone    != null ? String(b.phone).trim() : (cur.phone || '');
  const timeline = b.timeline != null ? b.timeline             : cur.timeline;
  const owner    = b.owner    != null ? String(b.owner).trim() : (cur.owner || '');
  const notes    = b.notes    != null ? String(b.notes).trim() : (cur.notes || '');
  const state    = b.state    != null ? normalizeState(b.state) : (cur.state || '');
  if (!name)  return res.status(400).json({ error: 'Name is required.' });
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  if (!LEAD_TIMELINES.includes(timeline)) return res.status(400).json({ error: 'Invalid buying timeline.' });

  // Merge type fields with current values, then normalize + rescore.
  const f = normalizeLeadType({
    leadType:      b.leadType      != null ? b.leadType      : cur.lead_type,
    refiType:      b.refiType      != null ? b.refiType      : cur.refi_type,
    realtorStatus: b.realtorStatus != null ? b.realtorStatus : cur.realtor_status,
    realtorName:   b.realtorName   != null ? b.realtorName   : cur.realtor_name,
    realtorEmail:  b.realtorEmail  != null ? b.realtorEmail  : cur.realtor_email,
    realtorPhone:  b.realtorPhone  != null ? b.realtorPhone  : cur.realtor_phone,
    preapproved:   b.preapproved   != null ? b.preapproved   : cur.preapproved
  });
  const score = computeLeadScore(timeline, phone, f.leadType, f.refiType, f.preapproved, f.realtorStatus);
  await pool.query(`UPDATE leads SET name=$1, email=$2, phone=$3, timeline=$4, owner=$5, notes=$6, score=$7, state=$8,
      preapproved=$9, lead_type=$10, refi_type=$11, realtor_status=$12, realtor_name=$13, realtor_email=$14, realtor_phone=$15
      WHERE id=$16 AND user_id=$17`,
    [name, email, phone, timeline, owner, notes, score, state,
     f.preapproved, f.leadType, f.refiType, f.realtorStatus, f.realtorName, f.realtorEmail, f.realtorPhone, id, req.user.id]);

  res.json(leadRowToJson({
    id, name, email, phone, timeline, score, owner, notes, state,
    preapproved: f.preapproved, lead_type: f.leadType, refi_type: f.refiType,
    realtor_status: f.realtorStatus, realtor_name: f.realtorName, realtor_email: f.realtorEmail, realtor_phone: f.realtorPhone
  }));
}));

// Manually override a lead's score. Admin-only, and works on any user's lead
// (the admin can see and curate every lead). Regular edits still auto-rescore.
app.patch('/api/leads/:id/score', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only the admin can change a lead score.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid lead id.' });
  const score = Number((req.body || {}).score);
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    return res.status(400).json({ error: 'Score must be a whole number from 0 to 100.' });
  }
  const r = await pool.query('UPDATE leads SET score = $1 WHERE id = $2 RETURNING id', [score, id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'Lead not found.' });
  res.json({ ok: true, score });
}));

app.delete('/api/leads/:id', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid lead id.' });
  const r = await pool.query('DELETE FROM leads WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'Lead not found.' });
  res.json({ ok: true });
}));

// Close a lead: capture relationship details, move it into closed_leads, delete it.
app.post('/api/leads/:id/close', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid lead id.' });
  const lead = await one('SELECT * FROM leads WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (!lead) return res.status(404).json({ error: 'Lead not found.' });

  const b = req.body || {};
  const birthday = String(b.birthday || '').trim();
  const loanAnniversary = String(b.loanAnniversary || '').trim();
  if (!birthday) return res.status(400).json({ error: "The lead's birthday is required." });
  if (!loanAnniversary) return res.status(400).json({ error: 'The loan anniversary is required.' });

  const data = {
    'Name': lead.name,
    'Email': lead.email || '',
    'Phone': lead.phone || '',
    'State': lead.state || '',
    // Relationship details captured when closing (shown prominently up top).
    'Birthday': birthday,
    'Loan Anniversary': loanAnniversary,
    "Pet's Name": String(b.petName || '').trim(),
    "Children's Name": String(b.childrenName || '').trim(),
    'Hobbies': String(b.hobbies || '').trim(),
    'Misc Notes': String(b.miscNotes || '').trim(),
    // Loan / pipeline context.
    'Loan Purpose': lead.lead_type || '',
    'Buying Timeline': lead.timeline || '',
    'Lead Score': lead.score != null ? String(lead.score) : '',
    'Owner': lead.owner || '',
    'Lead Notes': lead.notes || '',
    'Closed Date': serverToday()
  };
  const key = closedDedupeKey(data);
  await pool.query(
    `INSERT INTO closed_leads (user_id, data, dedupe_key) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, dedupe_key) DO UPDATE SET data = EXCLUDED.data`,
    [req.user.id, JSON.stringify(data), key]
  );
  await pool.query('DELETE FROM leads WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  res.json({ ok: true });
}));

// ----- Lead assignments / forwarding within a team -----
// Who can the user assign/forward a lead to (excluding themselves)?
//  - team leader: their members
//  - member:      their leader + sibling members
async function assignTargetIds(user) {
  if (user.role === 'team_leader') {
    const rows = await q('SELECT id FROM users WHERE leader_id = $1', [user.id]);
    return rows.map(r => r.id);
  }
  if (user.leaderId) {
    const rows = await q('SELECT id FROM users WHERE (id = $1 OR leader_id = $1) AND id <> $2', [user.leaderId, user.id]);
    return rows.map(r => r.id);
  }
  return [];
}

// People the current user can assign/forward to (with names, leader flagged).
app.get('/api/assign-targets', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  let rows = [];
  if (req.user.role === 'team_leader') {
    rows = await q('SELECT id, name FROM users WHERE leader_id = $1 ORDER BY lower(name)', [req.user.id]);
  } else if (req.user.leaderId) {
    rows = await q(`SELECT id, name FROM users WHERE (id = $1 OR leader_id = $1) AND id <> $2
                    ORDER BY (id = $1) DESC, lower(name)`, [req.user.leaderId, req.user.id]);
  }
  res.json(rows.map(r => ({ id: r.id, name: r.name, isLeader: r.id === req.user.leaderId })));
}));

// Assign/forward one of my leads to a teammate or everyone on the team.
app.post('/api/leads/:id/assign', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid lead id.' });
  const lead = await one('SELECT id FROM leads WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (!lead) return res.status(404).json({ error: 'Lead not found.' });

  const roster = await assignTargetIds(req.user);
  if (roster.length === 0) return res.status(400).json({ error: 'You have no teammates to assign to.' });

  const target = (req.body || {}).target;
  let targetIds;
  if (target === 'all') targetIds = roster;
  else {
    const tid = Number(target);
    if (!roster.includes(tid)) return res.status(400).json({ error: 'That user is not on your team.' });
    targetIds = [tid];
  }

  // Replace any in-flight assignment for this lead with a fresh batch.
  await q(`UPDATE lead_assignments SET status='cancelled' WHERE lead_id=$1 AND status='pending'`, [id]);
  const groupId = crypto.randomBytes(8).toString('hex');
  for (const tid of targetIds) {
    await q(`INSERT INTO lead_assignments (lead_id, from_user_id, to_user_id, group_id, status) VALUES ($1,$2,$3,$4,'pending')`,
      [id, req.user.id, tid, groupId]);
  }
  res.json({ ok: true, assigned: targetIds.length });
}));

// Member: my incoming pending lead assignments (for notifications).
app.get('/api/assignments', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const rows = await q(`
    SELECT a.id, l.name AS lead_name, u.name AS from_name
    FROM lead_assignments a JOIN leads l ON l.id = a.lead_id JOIN users u ON u.id = a.from_user_id
    WHERE a.to_user_id = $1 AND a.status = 'pending' ORDER BY a.id DESC
  `, [req.user.id]);
  res.json(rows.map(r => ({ id: r.id, leadName: r.lead_name, fromName: r.from_name })));
}));

// Member: accept or reject a lead assignment. Accept atomically claims the lead.
app.post('/api/assignments/:id/respond', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid assignment id.' });
  const action = (req.body || {}).action;
  if (!['accept', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action.' });

  if (action === 'reject') {
    const r = await pool.query(`UPDATE lead_assignments SET status='rejected', leader_seen=false WHERE id=$1 AND to_user_id=$2 AND status='pending'`, [id, req.user.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Assignment not found.' });
    return res.json({ ok: true, status: 'rejected' });
  }
  // Accept: claim only if still pending (someone else may have taken an "all" lead first).
  const claimed = await one(`UPDATE lead_assignments SET status='accepted', leader_seen=false
    WHERE id=$1 AND to_user_id=$2 AND status='pending' RETURNING lead_id, from_user_id, group_id`, [id, req.user.id]);
  if (!claimed) return res.status(409).json({ error: 'This lead was already taken.' });

  // A forwarded/assigned lead is automatically treated as high priority: bump
  // its score into the "hot" tier (>=80) without ever lowering an already-high one.
  await q('UPDATE leads SET user_id=$1, owner=$2, assigned_by=$3, score=GREATEST(COALESCE(score,0), 90) WHERE id=$4',
    [req.user.id, req.user.name, claimed.from_user_id, claimed.lead_id]);
  await q(`UPDATE lead_assignments SET status='cancelled' WHERE group_id=$1 AND status='pending' AND id<>$2`, [claimed.group_id, id]);
  res.json({ ok: true, status: 'accepted' });
}));

// Leader: unseen accept/reject outcomes (conveyed back), and dismissing them.
app.get('/api/assignments/outcomes', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  // Outcomes go back to whoever assigned/forwarded the lead (leader or member).
  const rows = await q(`
    SELECT a.id, a.status, u.name AS member_name, l.name AS lead_name
    FROM lead_assignments a JOIN users u ON u.id = a.to_user_id JOIN leads l ON l.id = a.lead_id
    WHERE a.from_user_id = $1 AND a.status IN ('accepted','rejected') AND a.leader_seen = false
    ORDER BY a.id DESC
  `, [req.user.id]);
  res.json(rows.map(r => ({ id: r.id, status: r.status, memberName: r.member_name, leadName: r.lead_name })));
}));
app.post('/api/assignments/outcomes/:id/seen', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id.' });
  await q(`UPDATE lead_assignments SET leader_seen=true WHERE id=$1 AND from_user_id=$2`, [id, req.user.id]);
  res.json({ ok: true });
}));

// ----- Previously closed leads (CSV import) -----
// Dedupe by email, else a loan/record id (not the officer's NMLS, which
// repeats across rows), else a hash of the whole normalized row.
function closedDedupeKey(row) {
  const entries = Object.entries(row);
  for (const [k, v] of entries) {
    if (/e-?mail/i.test(k) && v != null && String(v).trim()) return 'email:' + String(v).trim().toLowerCase();
  }
  for (const [k, v] of entries) {
    if (/(loan\s*id|loan\s*number|loan\s*#|record\s*id|^id$)/i.test(k) && !/nmls/i.test(k) && v != null && String(v).trim()) {
      return 'id:' + String(k).toLowerCase() + ':' + String(v).trim().toLowerCase();
    }
  }
  const norm = entries
    .map(([k, v]) => String(k).toLowerCase() + '=' + String(v == null ? '' : v).trim().toLowerCase())
    .join('|');
  return 'row:' + crypto.createHash('sha1').update(norm).digest('hex');
}

app.get('/api/closed', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const rows = await q('SELECT id, data FROM closed_leads WHERE user_id = $1 ORDER BY id DESC', [req.user.id]);
  res.json(rows.map(r => ({ id: r.id, data: r.data })));
}));

app.post('/api/closed/import', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const rows = (req.body || {}).rows;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No rows to import.' });
  if (rows.length > 5000) return res.status(400).json({ error: 'Too many rows (max 5000 per import).' });

  let imported = 0, updated = 0, unchanged = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const vals = Object.values(row).map(v => String(v == null ? '' : v).trim());
    if (vals.every(v => v === '')) continue; // blank row
    const key = closedDedupeKey(row);
    // Upsert: insert new rows; update existing ones whose data changed; leave
    // identical rows untouched. (xmax = 0) marks a fresh insert vs. an update.
    const r = await pool.query(
      `INSERT INTO closed_leads (user_id, data, dedupe_key) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, dedupe_key) DO UPDATE SET data = EXCLUDED.data
         WHERE closed_leads.data::text IS DISTINCT FROM EXCLUDED.data::text
       RETURNING (xmax = 0) AS inserted`,
      [req.user.id, JSON.stringify(row), key]
    );
    if (r.rowCount === 0) unchanged++;
    else if (r.rows[0].inserted) imported++;
    else updated++;
  }
  // `skipped` kept for backward compatibility (= unchanged duplicates).
  res.json({ ok: true, imported, updated, unchanged, skipped: unchanged });
}));

app.delete('/api/closed/:id', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id.' });
  const r = await pool.query('DELETE FROM closed_leads WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'Record not found.' });
  res.json({ ok: true });
}));

// ----- Contacts -----
const CONTACT_TAGS = ['Buyer', 'Seller', 'Investor', 'Other'];

app.get('/api/contacts', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const rows = await q(`
    SELECT id, name, email, phone, company, tag
    FROM contacts WHERE user_id = $1 ORDER BY name
  `, [req.user.id]);
  res.json(rows.map(r => ({
    id: r.id, name: r.name, email: r.email || '', phone: r.phone || '',
    company: r.company || '', tag: r.tag || 'Other'
  })));
}));

app.post('/api/contacts', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const { name, email, phone, company } = req.body || {};
  const tag = CONTACT_TAGS.includes(req.body && req.body.tag) ? req.body.tag : 'Other';
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });

  const row = await one(`
    INSERT INTO contacts (user_id, name, email, phone, company, tag)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
  `, [req.user.id, name.trim(), (email || '').trim(), (phone || '').trim(), (company || '').trim(), tag]);

  res.json({
    id: row.id, name: name.trim(), email: (email || '').trim(),
    phone: (phone || '').trim(), company: (company || '').trim(), tag
  });
}));

app.delete('/api/contacts/:id', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid contact id.' });
  const r = await pool.query('DELETE FROM contacts WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'Contact not found.' });
  res.json({ ok: true });
}));

// ----- Tasks -----
const TASK_PRIORITIES = ['High', 'Medium', 'Low'];

app.get('/api/tasks', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const rows = await q(`
    SELECT id, title, due_date, priority, status
    FROM tasks WHERE user_id = $1
    ORDER BY (status = 'done'), due_date NULLS LAST, id DESC
  `, [req.user.id]);
  res.json(rows.map(r => ({
    id: r.id, title: r.title, due: r.due_date || '', priority: r.priority || 'Medium', status: r.status || 'todo'
  })));
}));

app.post('/api/tasks', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const { title, due } = req.body || {};
  const priority = TASK_PRIORITIES.includes(req.body && req.body.priority) ? req.body.priority : 'Medium';
  if (!title || !title.trim()) return res.status(400).json({ error: 'Task title is required.' });

  if (due && due.trim()) {
    const d = new Date(due.trim() + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid due date.' });
    if (d.getTime() < today.getTime()) return res.status(400).json({ error: 'Due date cannot be in the past.' });
  }

  const row = await one(`
    INSERT INTO tasks (user_id, title, due_date, priority, status)
    VALUES ($1, $2, $3, $4, 'todo') RETURNING id
  `, [req.user.id, title.trim(), (due || '').trim() || null, priority]);

  res.json({ id: row.id, title: title.trim(), due: (due || '').trim(), priority, status: 'todo' });
}));

app.patch('/api/tasks/:id', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid task id.' });
  const b = req.body || {};
  const sets = [], params = [], out = {};
  if (b.status != null) {
    const s = b.status === 'done' ? 'done' : 'todo';
    params.push(s); sets.push(`status = $${params.length}`); out.status = s;
  }
  if (b.title != null) {
    const title = String(b.title).trim();
    if (!title) return res.status(400).json({ error: 'Task title is required.' });
    params.push(title); sets.push(`title = $${params.length}`); out.title = title;
  }
  if (b.priority != null) {
    const pr = TASK_PRIORITIES.includes(b.priority) ? b.priority : 'Medium';
    params.push(pr); sets.push(`priority = $${params.length}`); out.priority = pr;
  }
  if (b.due != null) {
    const due = String(b.due).trim();
    if (due) {
      const d = new Date(due + 'T00:00:00');
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid due date.' });
    }
    params.push(due || null); sets.push(`due_date = $${params.length}`); out.due = due;
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  params.push(id, req.user.id);
  const r = await pool.query(
    `UPDATE tasks SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND user_id = $${params.length}`,
    params
  );
  if (r.rowCount === 0) return res.status(404).json({ error: 'Task not found.' });
  res.json({ ok: true, ...out });
}));

app.delete('/api/tasks/:id', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid task id.' });
  const r = await pool.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'Task not found.' });
  res.json({ ok: true });
}));

// ----- Google / Gmail integration -----
app.get('/api/google/status', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  if (!googleConfigured()) return res.json({ configured: false, connected: false });
  const row = await one('SELECT email FROM google_accounts WHERE user_id = $1', [req.user.id]);
  res.json({ configured: true, connected: !!row, email: row ? row.email : null });
}));

app.get('/api/google/connect', (req, res) => {
  if (!req.user) return res.redirect('/login.html');
  if (!googleConfigured()) {
    return res.status(500).send('Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your environment and restart the server.');
  }
  const state = crypto.randomBytes(16).toString('hex');
  // Remember which page to return to (whitelisted) so the button works from anywhere.
  const fromPages = { messages: '/messages.html', settings: '/settings.html' };
  const returnTo = fromPages[String(req.query.from || '')] || '/messages.html';
  oauthStates.set(state, { userId: req.user.id, returnTo, exp: Date.now() + 10 * 60 * 1000 });
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: GOOGLE.clientId, redirect_uri: GOOGLE.redirectUri, response_type: 'code',
    scope: GOOGLE.scopes.join(' '), access_type: 'offline', include_granted_scopes: 'true',
    prompt: 'consent', state
  });
  res.redirect(url);
});

app.get('/api/google/callback', safe(async (req, res) => {
  const { code, state, error } = req.query;
  const entry = state && oauthStates.get(state);
  const returnTo = (entry && entry.returnTo) || '/messages.html';
  if (error) return res.redirect(returnTo + '?gmail=error');

  if (!entry || entry.exp < Date.now()) return res.redirect('/messages.html?gmail=error');
  oauthStates.delete(state);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: GOOGLE.clientId, client_secret: GOOGLE.clientSecret,
      redirect_uri: GOOGLE.redirectUri, grant_type: 'authorization_code'
    })
  });
  const tok = await tokenRes.json();
  if (!tokenRes.ok) { console.error('Google token exchange failed:', tok); return res.redirect(returnTo + '?gmail=error'); }

  let email = '';
  try {
    const uiRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + tok.access_token }
    });
    if (uiRes.ok) { const ui = await uiRes.json(); email = ui.email || ''; }
  } catch (e) { /* best-effort */ }

  const expiresAt = Date.now() + (tok.expires_in || 3600) * 1000;
  await saveGoogleTokens(entry.userId, email, tok.access_token, tok.refresh_token, expiresAt);
  res.redirect(returnTo + '?gmail=connected');
}));

app.post('/api/google/disconnect', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  await q('DELETE FROM google_accounts WHERE user_id = $1', [req.user.id]);
  res.json({ ok: true });
}));

app.get('/api/google/emails', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const token = await getGoogleToken(req.user.id);
  if (!token) return res.status(400).json({ error: 'Gmail is not connected.' });

  const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=8&labelIds=INBOX', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const list = await listRes.json();
  if (!listRes.ok) return res.status(502).json({ error: (list.error && list.error.message) || 'Gmail API error.' });

  const ids = (list.messages || []).map(m => m.id);
  const emails = [];
  for (const id of ids) {
    const mRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!mRes.ok) continue;
    const m = await mRes.json();
    const headers = {};
    ((m.payload && m.payload.headers) || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });
    emails.push({ id, from: headers.from || '', subject: headers.subject || '(no subject)', date: headers.date || '', snippet: m.snippet || '' });
  }
  res.json(emails);
}));

app.get('/api/google/contacts', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const token = await getGoogleToken(req.user.id);
  if (!token) return res.status(400).json({ error: 'Gmail is not connected.' });

  const r = await fetch('https://people.googleapis.com/v1/people/me/connections?pageSize=50&personFields=names,emailAddresses&sortOrder=FIRST_NAME_ASCENDING', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const data = await r.json();
  if (!r.ok) return res.status(502).json({ error: (data.error && data.error.message) || 'People API error.' });

  const contacts = (data.connections || []).map(p => ({
    name: (p.names && p.names[0] && p.names[0].displayName) || '(no name)',
    email: (p.emailAddresses && p.emailAddresses[0] && p.emailAddresses[0].value) || ''
  })).filter(c => c.email);
  res.json(contacts);
}));

// ----- Don't serve source/secret files -----
app.use((req, res, next) => {
  if (/\.(db|env)$|(^|\/)(server\.js|package(-lock)?\.json|render\.yaml|\.env)/i.test(req.path)) {
    return res.status(404).end();
  }
  next();
});

// ----- HTML route guard -----
app.use((req, res, next) => {
  const isHtml = req.path === '/' || req.path.endsWith('.html');
  if (!isHtml) return next();
  if (req.path === '/login.html') return next();
  if (!req.user) return res.redirect('/login.html');
  next();
});

app.get('/', (req, res) => res.redirect('/index.html'));

// ----- Static -----
app.use(express.static(__dirname, { dotfiles: 'deny' }));

// ----- Start -----
pool.query(SCHEMA)
  // If no admin exists yet (e.g. a database created before roles), promote the
  // earliest account to Admin so there's always a superuser.
  .then(() => pool.query(`
    UPDATE users SET role = 'admin'
    WHERE id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')
  `))
  .then(() => app.listen(PORT, () => console.log(`LeadFlow running on port ${PORT}`)))
  .catch(err => { console.error('Database init failed:', err); process.exit(1); });
