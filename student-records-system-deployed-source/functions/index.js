const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const createEngine = require('../assets/js/data/mock-server.js');
const fixtures = require('../assets/js/data/fixtures.js');

initializeApp();
const db = getFirestore();
const bootstrapSecret = defineSecret('SIRMS_BOOTSTRAP_SECRET');
const COLLECTIONS = {
  users: 'users', students: 'students', subjects: 'subjects',
  enrollments: 'enrollments', records: 'academic_records', logs: 'system_logs',
};
const PUBLIC_USER_FIELDS = ['id', 'uid', 'name', 'email', 'username', 'role', 'status', 'title', 'student_id', 'created_at', 'updated_at', 'last_login_at'];
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const clone = (x) => JSON.parse(JSON.stringify(x));
const ok = (data, extra = {}) => ({ success: true, data, ...extra });
const fail = (status, message, errors = {}) => ({ success: false, status, message, errors });

function setCors(req, res) {
  const origin = req.get('origin');
  const allowed = new Set([
    'http://localhost:5500', 'http://127.0.0.1:5500',
    'http://localhost:8080', 'http://127.0.0.1:8080',
    'https://student-records-system.netlify.app',
  ]);
  if (origin && (allowed.has(origin) || /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/i.test(origin))) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
}

async function loadState() {
  const entries = await Promise.all(Object.entries(COLLECTIONS).map(async ([key, name]) => {
    const snap = await db.collection(name).get();
    return [key, snap.docs.map((doc) => ({ ...doc.data(), id: Number(doc.id) }))];
  }));
  return Object.fromEntries(entries);
}

async function saveState(before, after) {
  const batches = [];
  let batch = db.batch(); let writes = 0;
  const flush = () => { if (writes) { batches.push(batch.commit()); batch = db.batch(); writes = 0; } };
  for (const [key, collectionName] of Object.entries(COLLECTIONS)) {
    const ref = db.collection(collectionName);
    const oldRows = new Map((before[key] || []).map((row) => [String(row.id), row]));
    const newRows = new Map((after[key] || []).map((row) => [String(row.id), row]));
    for (const [id, row] of newRows) {
      const safe = { ...row };
      if (key === 'users') delete safe.password;
      if (!oldRows.has(id) || JSON.stringify(oldRows.get(id)) !== JSON.stringify(row)) {
        if (writes >= 450) flush();
        batch.set(ref.doc(id), safe, { merge: false }); writes++;
      }
    }
    for (const id of oldRows.keys()) if (!newRows.has(id)) {
      if (writes >= 450) flush();
      batch.delete(ref.doc(id)); writes++;
    }
  }
  flush();
  await Promise.all(batches);
}

async function authUser(req) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  try { return await getAuth().verifyIdToken(token, true); } catch (_) { return null; }
}

async function login(req, res) {
  const identifier = String(req.body.identifier || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!identifier || !password) return res.status(422).json(fail(422, 'Please enter your email/username and password.', { identifier: !identifier ? 'This field is required.' : undefined, password: !password ? 'This field is required.' : undefined }));
  const field = identifier.includes('@') ? 'email' : 'username';
  const snap = await db.collection('users').where(field, '==', identifier).limit(1).get();
  const profile = snap.empty ? null : snap.docs[0].data();
  if (!profile || profile.status !== 'active' || !profile.uid) return res.status(401).json(fail(401, 'Invalid email/username or password.'));
  const apiKey = String(req.body.firebase_api_key || '');
  if (!apiKey) return res.status(400).json(fail(400, 'Firebase sign-in is not configured.'));
  const verify = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: profile.email, password, returnSecureToken: true }),
  });
  const credentials = await verify.json();
  if (!verify.ok || credentials.localId !== profile.uid) return res.status(401).json(fail(401, 'Invalid email/username or password.'));
  const customToken = await getAuth().createCustomToken(profile.uid);
  const state = await loadState();
  const engine = createEngine({ initialDb: state, fixtures, authUid: profile.uid });
  const user = state.users.find((u) => u.uid === profile.uid);
  if (user) {
    user.last_login_at = now();
    state.logs.unshift({ id: Math.max(0, ...state.logs.map((x) => x.id)) + 1, user_id: user.id, action: 'login', description: `${user.name} signed in`, created_at: now() });
    await saveState(engine.getData(), state);
  }
  return res.json(ok({ custom_token: customToken }));
}

async function bootstrapAdmin(req, res) {
  const secret = String(req.get('x-sirms-bootstrap-secret') || '');
  if (!secret || secret !== bootstrapSecret.value()) return res.status(403).json(fail(403, 'Invalid setup credential.'));
  const existing = await db.collection('users').where('role', '==', 'admin').limit(1).get();
  if (!existing.empty) return res.status(409).json(fail(409, 'An administrator account already exists.'));
  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase();
  const username = String(body.username || '').trim().toLowerCase();
  const name = String(body.name || '').trim();
  const password = String(body.password || '');
  if (!email || !username || !name || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/.test(password)) return res.status(422).json(fail(422, 'Provide name, email, username, and a strong password.'));
  const account = await getAuth().createUser({ email, password, displayName: name });
  const profile = { id: 1, uid: account.uid, name, email, username, role: 'admin', status: 'active', title: 'University Registrar', student_id: null, created_at: now(), updated_at: now(), last_login_at: null };
  await db.collection('users').doc('1').set(profile);
  return res.status(201).json(ok({ id: 1, email, username, role: 'admin' }, { message: 'Administrator account created.' }));
}

async function apiHandler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const path = req.path.replace(/\/$/, '') || '/';
  if (path === '/setup/bootstrap-admin' && req.method === 'POST') return bootstrapAdmin(req, res);
  if (path === '/auth/login' && req.method === 'POST') return login(req, res);

  const identity = await authUser(req);
  if (!identity) return res.status(401).json(fail(401, 'Please sign in to continue.'));
  const before = await loadState();
  const engine = createEngine({ initialDb: before, fixtures, authUid: identity.uid });
  const result = engine.handle(req.method, path, req.query, req.body || {});
  if (result.success) {
    const after = engine.getData();
    let authUserToCreate;
    const userCreate = path === '/users' && req.method === 'POST';
    if (userCreate) {
      authUserToCreate = after.users.find((u) => !before.users.some((old) => old.id === u.id));
      if (!authUserToCreate) return res.status(500).json(fail(500, 'Account record was not created.'));
      try {
        const account = await getAuth().createUser({ email: authUserToCreate.email, password: authUserToCreate.password, displayName: authUserToCreate.name, disabled: authUserToCreate.status !== 'active' });
        authUserToCreate.uid = account.uid;
      } catch (error) {
        return res.status(error.code === 'auth/email-already-exists' ? 409 : 422).json(fail(422, 'Could not create the Firebase account. Check that the email is unique and valid.'));
      }
    }
    const reset = path.match(/^\/users\/(\d+)\/reset-password$/);
    const statusChange = path.match(/^\/users\/(\d+)\/status$/);
    const profileChange = req.method === 'PUT' && /^\/users\/\d+$/.test(path);
    const targetId = reset ? Number(reset[1]) : statusChange ? Number(statusChange[1]) : profileChange ? Number(path.split('/')[2]) : null;
    const target = targetId ? after.users.find((u) => u.id === targetId) : null;
    const removedUsers = before.users.filter((u) => u.uid && !after.users.some((next) => next.id === u.id));
    try {
      if (target && target.uid && reset) {
        await getAuth().updateUser(target.uid, { password: req.body.password });
        await getAuth().revokeRefreshTokens(target.uid);
      }
      if (target && target.uid && statusChange) {
        await getAuth().updateUser(target.uid, { disabled: target.status !== 'active' });
        if (target.status !== 'active') await getAuth().revokeRefreshTokens(target.uid);
      }
      if (target && target.uid && profileChange) await getAuth().updateUser(target.uid, { email: target.email, displayName: target.name, disabled: target.status !== 'active' });
      for (const u of after.users) delete u.password;
      await saveState(before, after);
      await Promise.all(removedUsers.map((u) => getAuth().deleteUser(u.uid).catch((error) => {
        if (error.code !== 'auth/user-not-found') throw error;
      })));
    } catch (error) {
      if (authUserToCreate && authUserToCreate.uid) await getAuth().deleteUser(authUserToCreate.uid).catch(() => {});
      console.error('Firebase data write failed', error);
      return res.status(500).json(fail(500, 'Could not save the request to Firebase.'));
    }
  }
  if (!result.success) return res.status(result.status || 400).json(result);
  if (result.data && result.data.content != null && req.query.format === 'csv') {
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${result.data.filename || 'report.csv'}"`);
    return res.status(200).send(result.data.content);
  }
  return res.status(200).json(result);
}

exports.api = onRequest({ region: 'asia-southeast1', cors: false, secrets: [bootstrapSecret], timeoutSeconds: 120 }, (req, res) => {
  Promise.resolve(apiHandler(req, res)).catch((error) => {
    console.error('SIRMS API error', error);
    if (!res.headersSent) res.status(500).json(fail(500, 'Unexpected server error.'));
  });
});
