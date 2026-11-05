/* =========================================================
   Auth helpers (client side).
   The real source of truth is the PHP session (HttpOnly cookie).
   The browser only caches the signed-in user's public profile
   (name, role) so the shell can render instantly.
   ========================================================= */
(function () {
  'use strict';
  const KEY = 'sirms_user';
  const HOME = { admin: '#/dashboard', teacher: '#/dashboard', student: '#/dashboard' };

  window.Auth = {
    async login(identifier, password, remember) {
      const data = await Api.post('/auth/login', { identifier, password, remember: !!remember });
      (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(data.user));
      return data.user;
    },
    async logout() {
      try { await Api.post('/auth/logout'); } catch (_) { /* session may already be gone */ }
      this.clear();
      window.location.replace('index.html?logged_out=1');
    },
    async me() {
      try {
        const user = await Api.get('/auth/me');
        const store = localStorage.getItem(KEY) ? localStorage : sessionStorage;
        store.setItem(KEY, JSON.stringify(user));
        return user;
      } catch (_) {
        this.clear();
        return null;
      }
    },
    cached() {
      try { return JSON.parse(sessionStorage.getItem(KEY) || localStorage.getItem(KEY)); } catch (_) { return null; }
    },
    clear() {
      sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); sessionStorage.removeItem('sirms_csrf');
    },
    homeFor(role) { return HOME[role] || '#/dashboard'; },
  };
})();
