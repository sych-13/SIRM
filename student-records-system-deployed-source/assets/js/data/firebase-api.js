/* Role-scoped Firestore adapter. The mock engine is reused only for validation and reports. */
(function () {
  'use strict';
  const C = () => window.SIRMS_FIREBASE;
  const COLLECTIONS = { users: 'users', students: 'students', subjects: 'subjects', enrollments: 'enrollments', records: 'academic_records', logs: 'system_logs' };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const rows = (snapshot) => snapshot.docs.map((d) => ({ ...d.data(), id: Number(d.id) }));
  const fail = (message, status = 400, errors = {}) => { throw new ApiError(message, status, errors); };
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  async function getRows(name, conditions = []) {
    const f = C();
    const ref = f.collection(f.db, name);
    const q = conditions.length ? f.query(ref, ...conditions) : ref;
    return rows(await f.getDocs(q));
  }
  async function loadState(user) {
    const f = C();
    const roleSnap = await f.getDoc(f.doc(f.db, 'user_roles', user.uid));
    if (!roleSnap.exists()) fail('This account is not linked to a SIRMS user profile.', 403);
    const role = roleSnap.data();
    if (role.status !== 'active') fail('This account is deactivated. Contact the registrar.', 403);
    const admin = role.role === 'admin';
    const teacher = role.role === 'teacher';
    const uidFilter = f.where('teacher_uids', 'array-contains', user.uid);
    const ownerFilter = f.where('owner_uid', '==', user.uid);
    const [ownUsers, directory, students, subjects, enrollments, records, logs] = await Promise.all([
      admin ? getRows('users') : getRows('users', [f.where('uid', '==', user.uid)]),
      admin ? Promise.resolve([]) : getRows('teacher_directory'),
      getRows('students', admin ? [] : [teacher ? uidFilter : ownerFilter]),
      getRows('subjects', teacher ? [uidFilter] : []),
      getRows('enrollments', admin ? [] : [teacher ? uidFilter : ownerFilter]),
      getRows('academic_records', admin ? [] : [teacher ? uidFilter : ownerFilter]),
      admin ? getRows('system_logs') : Promise.resolve([]),
    ]);
    const usersById = new Map(ownUsers.map((x) => [x.id, x]));
    directory.forEach((x) => { if (!usersById.has(x.id)) usersById.set(x.id, x); });
    return {
      users: [...usersById.values()], students, subjects, enrollments, records, logs,
      role,
    };
  }

  function addDerivedFields(state) {
    const userById = new Map(state.users.map((u) => [u.id, u]));
    const subjectById = new Map(state.subjects.map((s) => [s.id, s]));
    const studentOwner = new Map(state.users.filter((u) => u.role === 'student' && u.student_id && u.uid).map((u) => [u.student_id, u.uid]));
    for (const s of state.subjects) {
      const teacher = userById.get(Number(s.teacher_id));
      s.teacher_uids = teacher && teacher.uid ? [teacher.uid] : s.teacher_uids || [];
    }
    const teachersForStudent = new Map();
    for (const r of state.records) {
      const subject = subjectById.get(Number(r.subject_id));
      const student = state.students.find((s) => s.id === Number(r.student_id));
      r.teacher_uids = subject ? subject.teacher_uids || [] : r.teacher_uids || [];
      r.owner_uid = student ? student.owner_uid || studentOwner.get(student.id) || null : null;
      const current = teachersForStudent.get(Number(r.student_id)) || new Set();
      (r.teacher_uids || []).forEach((uid) => current.add(uid));
      teachersForStudent.set(Number(r.student_id), current);
    }
    for (const s of state.students) {
      s.owner_uid = s.owner_uid || studentOwner.get(s.id) || null;
      s.teacher_uids = [...(teachersForStudent.get(s.id) || new Set())];
    }
    for (const e of state.enrollments) {
      const student = state.students.find((s) => s.id === Number(e.student_id));
      e.owner_uid = student ? student.owner_uid || null : null;
      e.teacher_uids = student ? student.teacher_uids || [] : [];
    }
  }

  async function saveDiff(before, after) {
    const f = C();
    addDerivedFields(after);
    const batch = f.writeBatch(f.db);
    let changed = 0;
    for (const [key, name] of Object.entries(COLLECTIONS)) {
      const oldMap = new Map((before[key] || []).map((x) => [String(x.id), x]));
      const newMap = new Map((after[key] || []).map((x) => [String(x.id), x]));
      for (const [id, row] of newMap) {
        const safe = { ...row };
        if (key === 'users') delete safe.password;
        if (key === 'logs') {
          const actor = (after.users || []).find((u) => u.id === row.user_id);
          if (actor && actor.uid) safe.actor_uid = actor.uid;
        }
        if (!oldMap.has(id) || !equal(oldMap.get(id), row)) {
          batch.set(f.doc(f.db, name, id), safe); changed++;
        }
      }
      for (const id of oldMap.keys()) if (!newMap.has(id)) {
        batch.delete(f.doc(f.db, name, id)); changed++;
      }
    }
    const oldUsers = new Map((before.users || []).map((u) => [u.uid, u]).filter(([uid]) => uid));
    const newUsers = new Map((after.users || []).map((u) => [u.uid, u]).filter(([uid]) => uid));
    for (const [uid, u] of newUsers) {
      const roleProfile = { uid, user_id: u.id, role: u.role, status: u.status, student_id: u.student_id || null };
      const prev = oldUsers.get(uid);
      if (!prev || prev.role !== u.role || prev.status !== u.status || prev.id !== u.id || prev.student_id !== u.student_id) {
        batch.set(f.doc(f.db, 'user_roles', uid), roleProfile); changed++;
      }
      const teacherRef = f.doc(f.db, 'teacher_directory', String(u.id));
      if (u.role === 'teacher' && u.status === 'active') {
        batch.set(teacherRef, { id: u.id, name: u.name, title: u.title || null, role: 'teacher', status: 'active' }); changed++;
      } else if (prev && prev.role === 'teacher') {
        batch.delete(teacherRef); changed++;
      }
    }
    for (const uid of oldUsers.keys()) if (!newUsers.has(uid)) {
      batch.delete(f.doc(f.db, 'user_roles', uid)); changed++;
      batch.delete(f.doc(f.db, 'teacher_directory', String(oldUsers.get(uid).id))); changed++;
    }
    if (changed) await batch.commit();
  }

  function errorMessage(error) {
    const map = {
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/user-not-found': 'Invalid email or password.',
      'auth/wrong-password': 'Invalid email or password.',
      'auth/email-already-in-use': 'That email already has a Firebase Auth account.',
      'auth/weak-password': 'Use a stronger password.',
      'permission-denied': 'Firestore rules denied this action. Check the account role and record assignment.',
      'auth/too-many-requests': 'Too many attempts. Try again later.',
    };
    return map[error.code] || error.message || 'Firebase request failed.';
  }

  async function handle(method, path, query, body) {
    await C().ready;
    const auth = C().auth;
    const identity = auth.currentUser;
    if (!identity) fail('Please sign in to continue.', 401);
    const before = await loadState(identity);
    if (method === 'POST' && /^\/users\/\d+\/reset-password$/.test(path)) {
      const id = Number(path.split('/')[2]);
      const target = before.users.find((u) => u.id === id);
      if (!before.role || before.role.role !== 'admin') fail('You do not have permission to perform this action.', 403);
      if (!target) fail('User not found.', 404);
      await C().sendPasswordResetEmail(auth, target.email);
      return await C().sendPasswordResetEmail(auth, target.email).then(() => ({ message: `Password reset email sent to ${target.email}.` }));
    }
    const seed = { users: before.users, students: before.students, subjects: before.subjects, enrollments: before.enrollments, records: before.records, logs: before.logs };
    const engine = window.SIRMS_createMockServer({ initialDb: seed, fixtures: window.SIRMS_FIXTURES, authUid: identity.uid });
    let payload = body || {};
    if (method === 'PUT' && /^\/users\/\d+$/.test(path)) {
      const id = Number(path.split('/')[2]);
      const existing = before.users.find((u) => u.id === id);
      if (existing && String(payload.email || '').trim().toLowerCase() !== String(existing.email || '').toLowerCase()) fail('Change this account email in Firebase Console, then update the SIRMS profile.', 422, { email: 'Update Auth email in Firebase Console first.' });
    }
    const result = engine.handle(method, path, query || {}, payload);
    if (!result.success) fail(result.message, result.status, result.errors);
    const after = engine.getData();
    if (method === 'POST' && path === '/users') fail('Create the account in Firebase Console, then add the linked Firestore profile. See FIREBASE_SETUP.md.', 403);
    // Non-admins cannot read audit logs, so preserve that collection when they make changes.
    if (before.role.role !== 'admin') after.logs = before.logs;
    for (const u of after.users) delete u.password;
    try { await saveDiff(before, after); }
    catch (error) { fail(errorMessage(error), 403); }
    return result.data;
  }

  window.FirebaseApi = { handle };
})();
