// Login + Register form handlers.
(function () {
  const tabs = document.querySelectorAll('.auth-tab');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const subtitle = document.getElementById('auth-subtitle');

  function showTab(name) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    if (name === 'login') {
      loginForm.classList.remove('hidden');
      loginForm.classList.add('flex');
      registerForm.classList.add('hidden');
      registerForm.classList.remove('flex');
      subtitle.textContent = 'Sign in to continue to your dashboard.';
    } else {
      registerForm.classList.remove('hidden');
      registerForm.classList.add('flex');
      loginForm.classList.add('hidden');
      loginForm.classList.remove('flex');
      subtitle.textContent = 'Create a new account to get started.';
    }
    document.getElementById('login-error').textContent = '';
    document.getElementById('register-error').textContent = '';
  }

  tabs.forEach(tab => tab.addEventListener('click', () => showTab(tab.dataset.tab)));

  async function submitForm(form, url, errorEl) {
    errorEl.textContent = '';
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.7';

    const body = Object.fromEntries(new FormData(form));

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      // Read body once as text, then try JSON.
      const raw = await res.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch (e) { /* non-JSON body */ }

      if (!res.ok) {
        if (data.error) {
          errorEl.textContent = data.error;
        } else {
          // Non-JSON error — likely Express's default HTML error page.
          // Show status + a hint so the user knows what to check.
          const hint = res.status === 404
            ? 'API route not found. Make sure you started the server with `npm start` and are loading the page from http://localhost:3000.'
            : 'Server returned an unexpected response. Check the terminal where you ran `npm start` for the error.';
          errorEl.textContent = `Request failed (HTTP ${res.status}). ${hint}`;
          console.error('Auth request failed:', res.status, raw);
        }
        return;
      }
      window.location.href = '/index.html';
    } catch (err) {
      errorEl.textContent = 'Network error. Is the server running at http://localhost:3000?';
      console.error('Auth network error:', err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '';
    }
  }

  loginForm.addEventListener('submit', e => {
    e.preventDefault();
    submitForm(loginForm, '/api/login', document.getElementById('login-error'));
  });

  registerForm.addEventListener('submit', e => {
    e.preventDefault();
    submitForm(registerForm, '/api/register', document.getElementById('register-error'));
  });

  if (window.lucide) lucide.createIcons();
})();
