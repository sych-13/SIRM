import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';

const app = initializeApp(window.CONFIG.FIREBASE_CONFIG);
const auth = getAuth(app);
const ready = new Promise((resolve) => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    unsubscribe();
    resolve(user);
  }, () => resolve(null));
});

window.SIRMS_FIREBASE = Object.freeze({
  app,
  auth,
  ready,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signInWithCustomToken,
  signOut,
});
