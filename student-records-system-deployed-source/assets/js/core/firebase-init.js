import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  deleteUser,
  signOut,
  onAuthStateChanged,
  connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  setDoc,
  deleteDoc,
  writeBatch,
  connectFirestoreEmulator,
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';

const app = initializeApp(window.CONFIG.FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
const accountAdminApp = initializeApp(window.CONFIG.FIREBASE_CONFIG, 'sirms-account-admin');
const accountAdminAuth = getAuth(accountAdminApp);
const emulatorHost = ['localhost', '127.0.0.1'].includes(window.location.hostname) ? '127.0.0.1' : null;
if (emulatorHost) {
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  connectAuthEmulator(accountAdminAuth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, 8080);
}
const ready = new Promise((resolve) => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    unsubscribe();
    resolve(user);
  }, () => resolve(null));
});

window.SIRMS_FIREBASE = Object.freeze({
  app,
  auth,
  db,
  accountAdminAuth,
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  setDoc,
  deleteDoc,
  writeBatch,
  ready,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  deleteUser,
  signOut,
});
