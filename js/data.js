// Shared client state. No mock business data — every page loads the real
// per-user data from the API. layout.js fills LF_DATA.user from /api/me.
window.LF_DATA = {
  user: { name: '', role: 'Member', initials: '?', email: '' }
};
