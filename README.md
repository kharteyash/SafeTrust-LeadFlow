# LeadFlow

A multi-user real-estate CRM: leads, contacts, tasks, calendar, calls, campaigns,
and scheduled messages — each scoped to the signed-in account. Email/password auth
with server-side cookie sessions. No mock data; every page reads real per-user data.

## Stack
- **Backend:** Node + Express, Postgres (`pg`), bcrypt password hashing, HTTP-only cookie sessions
- **Frontend:** static HTML + vanilla JS (Tailwind via CDN, Lucide icons) — no build step
- **Optional:** Google OAuth + Gmail/People API for the Gmail integration

## Run locally

1. **Create a Postgres database** (free): <https://neon.tech> → new project → copy the connection string.
2. **Configure env** — copy `.env.example` to `.env` and set:
   ```
   DATABASE_URL=postgres://user:password@host/dbname?sslmode=require
   ```
3. **Install & start:**
   ```bash
   npm install
   npm start        # or: npm run dev  (auto-restarts on file changes)
   ```
4. Open <http://localhost:3000>, register an account, and you're in. Tables are
   created automatically on first start.

## Gmail integration (optional)

Lets a user connect their Google account to read recent emails and import contacts.

1. In <https://console.cloud.google.com>: create a project, enable the **Gmail API**
   and **People API**, configure the OAuth consent screen (External; add yourself as
   a test user), and create an **OAuth client ID** (Web application).
2. Add an authorized redirect URI:
   - Local: `http://localhost:3000/api/google/callback`
   - Production: `https://YOUR-APP.onrender.com/api/google/callback`
3. Put the credentials in `.env`:
   ```
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
   ```
4. Restart, then connect under **Settings → Integrations**.

> Read-only scopes (`gmail.readonly`, `contacts.readonly`). While the OAuth app is
> in "Testing" mode, only allow-listed Google accounts can connect.

## Deploy (Render)

1. Push this repo to GitHub.
2. In Render: **New → Blueprint** → select the repo (it reads `render.yaml`).
3. When prompted, set `DATABASE_URL` (your Neon connection string — ideally a
   separate Neon project/branch for production). Set the `GOOGLE_*` vars only if
   using Gmail.
4. Deploy. Render runs `npm install` then `npm start`; the live URL is shown when
   it's up.

Notes: `NODE_ENV=production` enables secure cookies (the app trusts the proxy).
Render's free tier sleeps after ~15 min idle and takes ~30–60s to wake.

## Project layout
```
server.js          Express server + Postgres + all API routes
js/layout.js       Shared sidebar/topbar + auth guard (fetches /api/me)
js/<page>.js       Per-page logic (dashboard, leads, contacts, tasks, ...)
*.html             One file per page
css/styles.css     Styles
render.yaml        Render deployment blueprint
```

## Security notes
- Passwords are bcrypt-hashed; sessions are random tokens stored server-side.
- OAuth tokens are stored in plaintext in the DB — fine for personal/dev use;
  encrypt them before any serious production use.
- `.env` is gitignored; never commit secrets.
