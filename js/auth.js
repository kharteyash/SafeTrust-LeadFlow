// Login form handler. Account creation is admin-only (no self-service signup).
(function () {
  const loginForm = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');

  // If already signed in, don't sit on the login form — send them into the app.
  // This covers hitting the browser Back button onto the login page (including
  // bfcache restores, which don't re-run the script — hence the pageshow hook).
  // `replace` keeps the login page out of history so we don't bounce in a loop.
  async function redirectIfAuthed() {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) return;                      // 401 → not signed in, stay here
      const me = await res.json().catch(() => ({}));
      window.location.replace(me.role === 'realtor' ? '/realtor.html' : '/index.html');
    } catch (e) { /* offline / server down → leave the form up */ }
  }
  redirectIfAuthed();
  window.addEventListener('pageshow', (e) => { if (e.persisted) redirectIfAuthed(); });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.7';

    const body = Object.fromEntries(new FormData(loginForm));

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const raw = await res.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch (e) { /* non-JSON body */ }

      if (!res.ok) {
        if (data.error) {
          errorEl.textContent = data.error;
        } else {
          const hint = res.status === 404
            ? 'API route not found. Make sure the server is running and you are loading the page from the app URL.'
            : 'Server returned an unexpected response. Check the server logs for the error.';
          errorEl.textContent = `Request failed (HTTP ${res.status}). ${hint}`;
          console.error('Login request failed:', res.status, raw);
        }
        return;
      }
      // Account has 2FA: switch to the code step instead of signing in.
      if (data.mfaRequired) { showMfaStep(data.mfaToken); return; }
      window.location.href = data.role === 'realtor' ? '/realtor.html' : '/index.html';
    } catch (err) {
      errorEl.textContent = 'Network error. Is the server running?';
      console.error('Login network error:', err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '';
    }
  });

  // ----- Two-factor step -----
  const mfaForm = document.getElementById('mfa-form');
  const mfaCode = document.getElementById('mfa-code');
  const mfaError = document.getElementById('mfa-error');
  const subtitle = document.getElementById('auth-subtitle');
  let pendingToken = null;

  function showMfaStep(token) {
    pendingToken = token;
    loginForm.classList.add('hidden');
    mfaForm.classList.remove('hidden');
    mfaForm.classList.add('flex');
    if (subtitle) subtitle.textContent = 'Two-step verification';
    mfaError.textContent = '';
    mfaCode.value = '';
    mfaCode.focus();
  }
  function backToLogin() {
    pendingToken = null;
    mfaForm.classList.add('hidden');
    mfaForm.classList.remove('flex');
    loginForm.classList.remove('hidden');
    if (subtitle) subtitle.textContent = 'Sign in to continue to your dashboard.';
    errorEl.textContent = '';
  }
  document.getElementById('mfa-back').addEventListener('click', backToLogin);

  mfaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    mfaError.textContent = '';
    const btn = mfaForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.style.opacity = '0.7';
    try {
      const res = await fetch('/api/login/mfa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken: pendingToken, code: mfaCode.value.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        mfaError.textContent = data.error || 'Verification failed.';
        // Expired challenge → send them back to re-enter the password.
        if (res.status === 401 && /expired|sign in again/i.test(data.error || '')) setTimeout(backToLogin, 1500);
        return;
      }
      window.location.href = data.role === 'realtor' ? '/realtor.html' : '/index.html';
    } catch (err) {
      mfaError.textContent = 'Network error. Is the server running?';
    } finally {
      btn.disabled = false; btn.style.opacity = '';
    }
  });

  if (window.lucide) lucide.createIcons();
})();
