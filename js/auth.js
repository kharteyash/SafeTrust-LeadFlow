// Login form handler. Account creation is admin-only (no self-service signup).
(function () {
  const loginForm = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');

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
      window.location.href = data.role === 'realtor' ? '/realtor.html' : '/index.html';
    } catch (err) {
      errorEl.textContent = 'Network error. Is the server running?';
      console.error('Login network error:', err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '';
    }
  });

  if (window.lucide) lucide.createIcons();
})();
