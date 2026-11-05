/* Role-scoped Firestore adapter. The mock engine is reused only for validation and reports. */
(function () {
  'use strict';
  const C = () => window.SIRMS_FIREBASE;
  const COLLECTIONS = { users: 'users', students: 'students', subjects: 'subjects', enrollments: 'enrollments', records: 'academic_records', logs: 'system_logs' };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const rows = (snapshot) => snapshot.docs.map((d) => ({ ...d.data(), id: Number(d.id) }));
  const fail = (message, status = 400, errors = {}) => { throw new ApiError(message, status, errors); };
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const timestampNow = () => {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 19).replace('T', ' ');
  };

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

  function addDerivedFields(state, role) {
    const userById = new Map(state.users.map((u) => [u.id, u]));
    const subjectById = new Map(state.subjects.map((s) => [s.id, s]));
    const studentOwner = new Map(state.users.filter((u) => u.role === 'student' && u.student_id && u.uid).map((u) => [u.student_id, u.uid]));
    for (const s of state.subjects) {
      const teacher = userById.get(Number(s.teacher_id));
      if (s.teacher_id == null || !Number(s.teacher_id)) s.teacher_uids = [];
      else if (teacher && teacher.uid) s.teacher_uids = [teacher.uid];
      else if (role?.role === 'admin') s.teacher_uids = [];
      else s.teacher_uids = s.teacher_uids || [];
    }
    const teachersForStudent = new Map();
    for (const r of state.records) {
      const subject = subjectById.get(Number(r.subject_id));
      const student = state.students.find((s) => s.id === Number(r.student_id));
      r.teacher_uids = subject ? subject.teacher_uids || [] : r.teacher_uids || [];
      r.owner_uid = student
        ? (role?.role === 'admin' || role?.role === 'student' ? studentOwner.get(student.id) || null : r.owner_uid || student.owner_uid || null)
        : null;
      const current = teachersForStudent.get(Number(r.student_id)) || new Set();
      (r.teacher_uids || []).forEach((uid) => current.add(uid));
      teachersForStudent.set(Number(r.student_id), current);
    }
    for (const s of state.students) {
      if (role?.role === 'admin' || role?.role === 'student') s.owner_uid = studentOwner.get(s.id) || null;
      s.teacher_uids = [...(teachersForStudent.get(s.id) || new Set())];
    }
    for (const e of state.enrollments) {
      const student = state.students.find((s) => s.id === Number(e.student_id));
      e.owner_uid = student
        ? (role?.role === 'admin' || role?.role === 'student' ? student.owner_uid || null : e.owner_uid || student.owner_uid || null)
        : null;
      e.teacher_uids = student ? student.teacher_uids || [] : [];
    }
  }

  async function saveDiff(before, after) {
    const f = C();
    if (before.role?.role === 'teacher') {
      // Teachers receive only assigned subjects and related records. Persist
      // grade edits and audit entries directly; rebuilding derived fields from
      // that partial view would overwrite teacher assignments for other classes.
      const oldRecords = new Map((before.records || []).map((row) => [String(row.id), row]));
      const batch = f.writeBatch(f.db);
      let changed = 0;
      for (const row of after.records || []) {
        const previous = oldRecords.get(String(row.id));
        if (!previous) continue;
        const keys = ['grade', 'remarks', 'encoded_by', 'updated_at'];
        if (keys.some((key) => !equal(previous[key] ?? null, row[key] ?? null))) {
          batch.update(f.doc(f.db, 'academic_records', String(row.id)), {
            grade: row.grade ?? null,
            remarks: row.remarks ?? null,
            encoded_by: row.encoded_by ?? null,
            updated_at: row.updated_at,
          });
          changed++;
        }
      }
      for (const row of after.logs || []) {
        if ((before.logs || []).some((old) => old.id === row.id)) continue;
        const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
        batch.set(f.doc(f.db, 'system_logs', String(id)), {
          ...row, id, actor_uid: before.users.find((user) => user.id === row.user_id)?.uid || f.auth.currentUser.uid,
        });
        changed++;
      }
      if (changed) await batch.commit();
      return;
    }
    addDerivedFields(after, before.role);
    const batch = f.writeBatch(f.db);
    let changed = 0;
    for (const [key, name] of Object.entries(COLLECTIONS)) {
      const oldMap = new Map((before[key] || []).map((x) => [String(x.id), x]));
      const newMap = new Map((after[key] || []).map((x) => [String(x.id), x]));
      for (const [id, row] of newMap) {
        if (key === 'logs' && !oldMap.has(id) && before.role?.role !== 'admin') {
          row.id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
        }
        const safe = { ...row };
        if (key === 'users') delete safe.password;
        if (key === 'logs') {
          const actor = (after.users || []).find((u) => u.id === row.user_id);
          if (actor && actor.uid) safe.actor_uid = actor.uid;
        }
        if (!oldMap.has(id) || !equal(oldMap.get(id), row)) {
          const documentId = key === 'logs' ? String(safe.id) : id;
          batch.set(f.doc(f.db, name, documentId), safe); changed++;
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
        if (!prev || prev.role !== 'teacher' || prev.status !== 'active' || prev.name !== u.name || prev.title !== u.title) {
          batch.set(teacherRef, { id: u.id, name: u.name, title: u.title || null, role: 'teacher', status: 'active' }); changed++;
        }
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
    if (method === 'POST' && path === '/auth/login') {
      const profile = before.users.find((u) => u.uid === identity.uid);
      if (profile) {
        const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
        const createdAt = timestampNow();
        await C().setDoc(C().doc(C().db, 'users', String(profile.id)), { last_login_at: createdAt }, { merge: true });
        await C().setDoc(C().doc(C().db, 'system_logs', String(id)), {
          id, user_id: profile.id, actor_uid: identity.uid, action: 'login',
          description: `${profile.name} signed in`, created_at: createdAt,
        });
      }
      return null;
    }
    if (method === 'POST' && /^\/users\/\d+\/reset-password$/.test(path)) {
      const id = Number(path.split('/')[2]);
      const target = before.users.find((u) => u.id === id);
      if (!before.role || before.role.role !== 'admin') fail('You do not have permission to perform this action.', 403);
      if (!target) fail('User not found.', 404);
      await C().sendPasswordResetEmail(auth, target.email);
      return { message: `Password reset email sent to ${target.email}.` };
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
    // Read requests must never enter the Firestore batch-write path. Apart from
    // avoiding unnecessary writes, this keeps teacher/student reads compatible
    // with their intentionally read-only role permissions.
    if (method === 'GET') return result.data;
    const after = engine.getData();
    let createdAccount;
    let verificationSent = false;
    if (method === 'POST' && path === '/users') {
      const newProfile = after.users.find((u) => !before.users.some((old) => old.id === u.id));
      if (!newProfile) fail('User profile was not created.', 500);
      try {
        const credential = await C().createUserWithEmailAndPassword(C().accountAdminAuth, newProfile.email, newProfile.password);
        createdAccount = credential.user;
        newProfile.uid = credential.user.uid;
        try { await C().sendEmailVerification(createdAccount); verificationSent = true; } catch (_) { /* Account creation remains usable if mail delivery is temporarily unavailable. */ }
      } catch (error) {
        fail(errorMessage(error), error.code === 'auth/email-already-in-use' ? 409 : 422);
      }
    }
    for (const u of after.users) delete u.password;
    try { await saveDiff(before, after); }
    catch (error) {
      if (createdAccount) await C().deleteUser(createdAccount).catch(() => {});
      fail(errorMessage(error), 403);
    } finally {
      if (createdAccount) await C().signOut(C().accountAdminAuth).catch(() => {});
    }
    if (createdAccount && result.data && typeof result.data === 'object') result.data.verification_sent = verificationSent;
    return result.data;
  }

  window.FirebaseApi = { handle };
})();
