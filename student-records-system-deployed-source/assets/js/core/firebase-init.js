import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
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
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';

const app = initializeApp(window.CONFIG.FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
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
  sendPasswordResetEmail,
  signOut,
});
