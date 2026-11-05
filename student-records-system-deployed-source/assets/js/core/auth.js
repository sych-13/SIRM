/* Firebase Auth owns the credential session; the browser caches only a public profile. */
(function () {
  'use strict';
  const KEY = 'sirms_user';
  const HOME = { admin: '#/dashboard', teacher: '#/dashboard', student: '#/dashboard' };

  window.Auth = {
    async login(identifier, password, remember) {
      const firebase = window.SIRMS_FIREBASE;
      await firebase.ready;
      await firebase.setPersistence(firebase.auth, remember ? firebase.browserLocalPersistence : firebase.browserSessionPersistence);
      try {
        await firebase.signInWithEmailAndPassword(firebase.auth, identifier.trim().toLowerCase(), password);
        const user = await Api.get('/auth/me');
        (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(user));
        return user;
      } catch (error) {
        await firebase.signOut(firebase.auth);
        throw error;
      }
    },
    async logout() {
      try { await Api.post('/auth/logout'); } catch (_) { /* session may already be gone */ }
      try { await window.SIRMS_FIREBASE.signOut(window.SIRMS_FIREBASE.auth); } catch (_) { /* already signed out */ }
      this.clear();
      window.location.replace('index.html?logged_out=1');
    },
    async me() {
      try {
        await window.SIRMS_FIREBASE.ready;
        if (!window.SIRMS_FIREBASE.auth.currentUser) { this.clear(); return null; }
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
      if (window.SIRMS_FIREBASE && window.SIRMS_FIREBASE.auth.currentUser) {
        window.SIRMS_FIREBASE.signOut(window.SIRMS_FIREBASE.auth).catch(() => {});
      }
    },
    homeFor(role) { return HOME[role] || '#/dashboard'; },
  };
})();
