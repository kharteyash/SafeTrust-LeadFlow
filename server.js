// LeadFlow server: Express + Postgres + bcrypt + cookie sessions.
// Storage is Postgres (via DATABASE_URL) so it works locally and when hosted.

const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
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
    created_at    TIMESTAMPTZ DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

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
    logged_at   TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS scheduled_messages (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient   TEXT NOT NULL,
    channel     TEXT NOT NULL,
    type        TEXT NOT NULL,
    send_date   TEXT NOT NULL,
    send_time   TEXT NOT NULL,
    body        TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
  );

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
    created_at TIMESTAMPTZ DEFAULT now()
  );

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
    SELECT u.id, u.email, u.name, u.phone, u.title, u.bio
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = $1 AND s.expires_at > now()
  `, [sid]);
  if (!row) return null;
  return {
    id: row.id, email: row.email, name: row.name,
    phone: row.phone || '', title: row.title || '', bio: row.bio || ''
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
  const row = await one('INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [emailNorm, name.trim(), hash]);

  const sid = await createSession(row.id);
  setSessionCookie(res, sid);
  res.json({ id: row.id, email: emailNorm, name: name.trim() });
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
    SELECT id, name, phone, direction, duration, outcome, notes, agent, logged_at
    FROM call_log WHERE user_id = $1 ORDER BY id DESC
  `, [req.user.id]);
  res.json(rows.map(r => ({
    id: r.id, name: r.name, phone: r.phone || '', direction: r.direction || 'outbound',
    duration: r.duration || '0:00', outcome: r.outcome, notes: r.notes || '—',
    agent: r.agent || '', date: r.logged_at
  })));
}));

app.post('/api/call-log', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const { name, phone, outcome, duration, notes } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Contact name is required.' });
  if (!['Connected', 'Voicemail', 'Missed'].includes(outcome)) return res.status(400).json({ error: 'Please choose a valid outcome.' });

  const agent = shortName(req.user.name);
  const loggedAt = fmtCallDate(new Date());
  const dur = (duration || '0:00').trim() || '0:00';
  const note = (notes || '').trim() || '—';

  const row = await one(`
    INSERT INTO call_log (user_id, name, phone, direction, duration, outcome, notes, agent, logged_at)
    VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8) RETURNING id
  `, [req.user.id, name.trim(), (phone || '').trim(), dur, outcome, note, agent, loggedAt]);

  res.json({
    id: row.id, name: name.trim(), phone: (phone || '').trim(), direction: 'outbound',
    duration: dur, outcome, notes: note, agent, date: loggedAt
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

function fmtShortDate(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

app.get('/api/campaigns', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const rows = await q(`
    SELECT id, name, channel, status, sent, opens, clicks, replies, created_at
    FROM campaigns WHERE user_id = $1 ORDER BY id DESC
  `, [req.user.id]);
  res.json(rows.map(r => ({
    id: r.id, name: r.name, type: r.channel, status: r.status,
    sent: r.sent || 0, opens: r.opens || 0, clicks: r.clicks || 0, replies: r.replies || 0,
    started: fmtShortDate(r.created_at)
  })));
}));

app.post('/api/campaigns', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const { name } = req.body || {};
  const channel = CAMPAIGN_CHANNELS.includes(req.body && req.body.channel) ? req.body.channel : 'Email';
  const status = CAMPAIGN_STATUSES.includes(req.body && req.body.status) ? req.body.status : 'Draft';
  if (!name || !name.trim()) return res.status(400).json({ error: 'Campaign name is required.' });

  const row = await one(`
    INSERT INTO campaigns (user_id, name, channel, status)
    VALUES ($1, $2, $3, $4) RETURNING id, created_at
  `, [req.user.id, name.trim(), channel, status]);

  res.json({
    id: row.id, name: name.trim(), type: channel, status,
    sent: 0, opens: 0, clicks: 0, replies: 0, started: fmtShortDate(row.created_at)
  });
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
    SELECT id, recipient, channel, type, send_date, send_time, body
    FROM scheduled_messages WHERE user_id = $1 ORDER BY send_date, send_time
  `, [req.user.id]);
  res.json(rows.map(r => ({
    id: r.id, to: r.recipient, channel: r.channel, type: r.type,
    date: r.send_date, time24: r.send_time, body: r.body || ''
  })));
}));

app.post('/api/scheduled', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const { recipient, channel, type, date, time, body } = req.body || {};
  if (!recipient || !recipient.trim()) return res.status(400).json({ error: 'Recipient is required.' });
  if (!type || !type.trim())           return res.status(400).json({ error: 'Message type is required.' });
  if (!date || !time)                  return res.status(400).json({ error: 'Date and time are required.' });
  if (!['Email', 'SMS'].includes(channel)) return res.status(400).json({ error: 'Channel must be Email or SMS.' });

  const row = await one(`
    INSERT INTO scheduled_messages (user_id, recipient, channel, type, send_date, send_time, body)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
  `, [req.user.id, recipient.trim(), channel, type.trim(), date, time, (body || '').trim()]);

  res.json({ id: row.id, to: recipient.trim(), channel, type: type.trim(), date, time24: time, body: (body || '').trim() });
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

function computeLeadScore(timeline, phone) {
  const base = {
    'Buying Immediately': 85, '1-3 Months': 70, '3-6 Months': 50, '6+ Months': 35
  }[timeline] || 50;
  const phoneBonus = (phone && phone.trim()) ? 10 : 0;
  return Math.min(100, base + phoneBonus);
}

app.get('/api/leads', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const rows = await q(`
    SELECT id, name, email, phone, timeline, score, owner, created_at
    FROM leads WHERE user_id = $1 ORDER BY id DESC
  `, [req.user.id]);
  res.json(rows.map(r => ({
    id: r.id, name: r.name, email: r.email || '', phone: r.phone || '',
    timeline: r.timeline, score: r.score, owner: r.owner || '', last: 'Just now',
    created: r.created_at
  })));
}));

app.post('/api/leads', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const { name, email, phone, timeline, owner } = req.body || {};
  if (!name || !name.trim())   return res.status(400).json({ error: 'Name is required.' });
  if (!email || !email.trim()) return res.status(400).json({ error: 'Email is required.' });
  if (!LEAD_TIMELINES.includes(timeline)) return res.status(400).json({ error: 'Invalid buying timeline.' });

  const score = computeLeadScore(timeline, phone);
  const row = await one(`
    INSERT INTO leads (user_id, name, email, phone, timeline, score, owner)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
  `, [req.user.id, name.trim(), email.trim(), (phone || '').trim(), timeline, score, (owner || '').trim()]);

  res.json({
    id: row.id, name: name.trim(), email: email.trim(), phone: (phone || '').trim(),
    timeline, score, owner: (owner || '').trim(), last: 'Just now'
  });
}));

app.delete('/api/leads/:id', safe(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid lead id.' });
  const r = await pool.query('DELETE FROM leads WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'Lead not found.' });
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
  const status = (req.body && req.body.status) === 'done' ? 'done' : 'todo';
  const r = await pool.query('UPDATE tasks SET status = $1 WHERE id = $2 AND user_id = $3', [status, id, req.user.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'Task not found.' });
  res.json({ ok: true, status });
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
  oauthStates.set(state, { userId: req.user.id, exp: Date.now() + 10 * 60 * 1000 });
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: GOOGLE.clientId, redirect_uri: GOOGLE.redirectUri, response_type: 'code',
    scope: GOOGLE.scopes.join(' '), access_type: 'offline', include_granted_scopes: 'true',
    prompt: 'consent', state
  });
  res.redirect(url);
});

app.get('/api/google/callback', safe(async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect('/settings.html?gmail=error');

  const entry = state && oauthStates.get(state);
  if (!entry || entry.exp < Date.now()) return res.redirect('/settings.html?gmail=error');
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
  if (!tokenRes.ok) { console.error('Google token exchange failed:', tok); return res.redirect('/settings.html?gmail=error'); }

  let email = '';
  try {
    const uiRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + tok.access_token }
    });
    if (uiRes.ok) { const ui = await uiRes.json(); email = ui.email || ''; }
  } catch (e) { /* best-effort */ }

  const expiresAt = Date.now() + (tok.expires_in || 3600) * 1000;
  await saveGoogleTokens(entry.userId, email, tok.access_token, tok.refresh_token, expiresAt);
  res.redirect('/settings.html?gmail=connected');
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
  .then(() => app.listen(PORT, () => console.log(`LeadFlow running on port ${PORT}`)))
  .catch(err => { console.error('Database init failed:', err); process.exit(1); });
