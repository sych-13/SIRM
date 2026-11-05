/* Firebase Auth owns the credential session; the browser caches only a public profile. */
(function () {
  'use strict';
  const KEY = 'sirms_user';
  const HOME = { admin: '#/dashboard', teacher: '#/dashboard', student: '#/dashboard' };
  const AUTH_ERRORS = {
    'auth/invalid-credential': 'Mali ang email o password. Subukan ulit.',
    'auth/wrong-password': 'Mali ang email o password. Subukan ulit.',
    'auth/user-not-found': 'Walang account para sa email na iyan.',
    'auth/invalid-email': 'Hindi wastong email address.',
    'auth/user-disabled': 'Naka-disable ang account. Makipag-ugnayan sa administrator.',
    'auth/too-many-requests': 'Napakaraming pagsubok. Maghintay muna bago subukan ulit.',
    'auth/network-request-failed': 'Hindi maabot ang Firebase. Suriin ang internet connection at subukan ulit.',
  };

  window.Auth = {
    async login(identifier, password, remember) {
      const firebase = window.SIRMS_FIREBASE;
      await firebase.ready;
      await firebase.setPersistence(firebase.auth, remember ? firebase.browserLocalPersistence : firebase.browserSessionPersistence);
      try {
        await firebase.signInWithEmailAndPassword(firebase.auth, identifier.trim().toLowerCase(), password);
        const signedInUser = firebase.auth.currentUser;
        let verificationSent = false;
        if (signedInUser && !signedInUser.emailVerified) {
          try {
            await firebase.sendEmailVerification(signedInUser);
            verificationSent = true;
          } catch (_) { /* Do not block sign-in if email delivery is temporarily unavailable. */ }
        }
        const user = await Api.get('/auth/me');
        try { await Api.post('/auth/login', {}); } catch (_) { /* sign-in must not fail if audit logging is unavailable */ }
        (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(user));
        return { ...user, email_verified: !!signedInUser?.emailVerified, verification_sent: verificationSent };
      } catch (error) {
        await firebase.signOut(firebase.auth).catch(() => {});
        if (AUTH_ERRORS[error.code]) throw new ApiError(AUTH_ERRORS[error.code], 401);
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
