/* =========================================================
   SIRMS data engine — shared route validation and report logic.
   ---------------------------------------------------------
   The Firebase adapter supplies Firestore records and authenticated
   identity; this engine applies existing route validation and shaping.
   ========================================================= */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory;
  else root.SIRMS_createMockServer = factory;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMockServer(options) {
  'use strict';
  options = options || {};
  const DB_KEY = 'sirms_mock_db_v2';
  const SESSION_KEY = 'sirms_mock_session';
  const F = options.fixtures || (typeof window !== 'undefined' ? window.SIRMS_FIXTURES : require('./fixtures.js'));
  const browser = typeof window !== 'undefined';
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const SEMESTERS = ['1st Semester', '2nd Semester', 'Summer'];
  const ENROLL_STATUSES = ['Enrolled', 'Pending', 'Dropped', 'Completed'];
  const GRADES = [1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 5.0];
  const PROGRAM_CODES = F.PROGRAMS.map((p) => p.code);
  const LOG_ACTIONS = ['login', 'login_failed', 'logout', 'create', 'update', 'delete', 'report'];

  // ---------- storage ----------
  let db = options.initialDb ? clone(options.initialDb) : load();
  function load() {
    if (browser) {
      try { const raw = localStorage.getItem(DB_KEY); if (raw) return JSON.parse(raw); } catch (_) { /* reseed */ }
      localStorage.removeItem('sirms_mock_db_v1');
    }
    const seeded = clone({ users: F.users, students: F.students, subjects: F.subjects, enrollments: F.enrollments, records: F.records, logs: F.logs });
    if (browser) localStorage.setItem(DB_KEY, JSON.stringify(seeded));
    return seeded;
  }
  const save = () => {
    if (typeof options.onSave === 'function') options.onSave(clone(db));
    else if (browser) localStorage.setItem(DB_KEY, JSON.stringify(db));
  };
  const nextId = (rows) => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  const now = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 19).replace('T', ' '); };
  const today = () => now().slice(0, 10);

  // ---------- session ----------
  const getSession = () => {
    if (!browser) return null;
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY)); } catch (_) { return null; }
  };
  const currentUser = () => {
    if (options.authUid) return db.users.find((u) => u.uid === options.authUid && u.status === 'active') || null;
    const s = getSession(); return s ? db.users.find((u) => u.id === s.user_id && u.status === 'active') : null;
  };
  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, username: u.username, role: u.role, title: u.title || null, student_id: u.student_id || null });
  const csrf = () => Math.random().toString(36).slice(2);

  // ---------- response helpers ----------
  const ok = (data, extra) => ({ success: true, status: 200, data, ...extra });
  const fail = (status, message, errors) => ({ success: false, status, message, errors });
  const invalid = (errors) => fail(422, 'Please correct the highlighted fields.', errors);
  const log = (user, action, description) => db.logs.unshift({ id: nextId(db.logs), user_id: user ? user.id : null, action, description, created_at: now() });

  // ---------- derived lookups ----------
  const fullName = (s) => `${s.first_name} ${s.middle_name ? s.middle_name[0] + '. ' : ''}${s.last_name}`;
  const isCurrentTerm = (ay, sem) => ay === F.CURRENT.academic_year && sem === F.CURRENT.semester;
  const currentEnrollment = (sid) => db.enrollments.find((e) => e.student_id === sid && e.is_current) || null;
  const latestEnrollment = (sid) => currentEnrollment(sid) || db.enrollments.filter((e) => e.student_id === sid).sort((a, b) => b.academic_year.localeCompare(a.academic_year) || b.semester.localeCompare(a.semester) || b.id - a.id)[0] || null;
  const studentById = (id) => db.students.find((s) => s.id === id);
  const subjectById = (id) => db.subjects.find((s) => s.id === id);
  const userById = (id) => db.users.find((u) => u.id === id);
  const studentRow = (s) => {
    const e = latestEnrollment(s.id);
    return { ...s, full_name: fullName(s), program: e ? e.program : null, year_level: e ? e.year_level : null, enrollment_status: e && e.is_current ? e.status : 'Not Enrolled' };
  };
  const enrollmentRow = (e) => { const s = studentById(e.student_id) || {}; return { ...e, student_number: s.student_number, student_name: s.first_name ? fullName(s) : '', first_name: s.first_name, last_name: s.last_name }; };
  const recordRow = (r) => {
    const sub = subjectById(r.subject_id) || {};
    const st = studentById(r.student_id) || {};
    const enc = r.encoded_by ? userById(r.encoded_by) : null;
    return { ...r, subject_code: sub.code, subject_name: sub.name, units: sub.units, teacher_id: sub.teacher_id || null, student_number: st.student_number, student_name: st.first_name ? fullName(st) : '', first_name: st.first_name, last_name: st.last_name, encoded_by_name: enc ? enc.name : null };
  };
  const gwa = (rows) => {
    const graded = rows.filter((r) => r.grade != null);
    const units = graded.reduce((a, r) => a + r.units, 0);
    return units ? Math.round((graded.reduce((a, r) => a + r.grade * r.units, 0) / units) * 100) / 100 : null;
  };
  const remarksFor = (grade, requested) => (grade != null ? (grade <= 3 ? 'Passed' : 'Failed') : ['Incomplete', 'Dropped'].includes(requested) ? requested : 'In Progress');

  // RBAC scope: a teacher only sees students/records in subjects assigned to them.
  const teacherSubjectIds = (u) => new Set(db.subjects.filter((s) => s.teacher_id === u.id).map((s) => s.id));
  const teacherStudentIds = (u) => { const subs = teacherSubjectIds(u); return new Set(db.records.filter((r) => subs.has(r.subject_id)).map((r) => r.student_id)); };
  const canSeeStudent = (u, sid) => u.role === 'admin' || (u.role === 'teacher' && teacherStudentIds(u).has(sid));

  // ---------- generic list helpers ----------
  const matches = (term, values) => !term || values.some((v) => v != null && String(v).toLowerCase().includes(term));
  const sortRows = (rows, key, dir) => rows.sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? ''), undefined, { numeric: true }) * (dir === 'desc' ? -1 : 1));
  function paginate(rows, q) {
    const perPage = Math.min(Math.max(Number(q.per_page) || 10, 1), 100);
    const total = rows.length; const pages = Math.max(1, Math.ceil(total / perPage));
    const page = Math.min(Math.max(Number(q.page) || 1, 1), pages);
    return { items: rows.slice((page - 1) * perPage, page * perPage), meta: { total, page, per_page: perPage, pages } };
  }
  const inDateRange = (value, from, to) => { const d = String(value || '').slice(0, 10); return (!from || d >= from) && (!to || d <= to); };
  const trimAll = (input, fields) => { const d = {}; fields.forEach((f) => { const v = input[f]; d[f] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v ?? null; }); return d; };
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v));
  const validAY = (v) => { const m = /^(\d{4})-(\d{4})$/.exec(v || ''); return !!m && Number(m[2]) === Number(m[1]) + 1; };
  const PASSWORD_RX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;
  const PASSWORD_MSG = 'Use 8+ characters with upper and lower case letters and a number.';

  // ---------- student record validation ----------
  const STUDENT_FIELDS = ['student_number', 'first_name', 'middle_name', 'last_name', 'date_of_birth', 'gender', 'address', 'contact_number', 'email', 'guardian_name', 'guardian_contact', 'profile_picture'];
  function validateStudent(input, ignoreId) {
    const d = trimAll(input, STUDENT_FIELDS);
    const e = {};
    ['student_number', 'first_name', 'last_name', 'date_of_birth', 'gender', 'address', 'contact_number', 'email', 'guardian_name', 'guardian_contact']
      .forEach((f) => { if (!d[f]) e[f] = 'This field is required.'; });
    if (d.student_number) d.student_number = d.student_number.toUpperCase();
    if (d.student_number && !/^(?:\d{4}-\d{5}|CA\d{9})$/.test(d.student_number)) e.student_number = 'Use YYYY-NNNNN or CA followed by 9 digits (e.g. CA202601209).';
    if (d.student_number && !e.student_number && db.students.some((s) => s.student_number === d.student_number && s.id !== ignoreId)) e.student_number = 'This student number is already registered.';
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) e.email = 'Enter a valid email address.';
    if (d.email && !e.email && db.students.some((s) => s.email.toLowerCase() === d.email.toLowerCase() && s.id !== ignoreId)) e.email = 'This email is already used by another student.';
    ['contact_number', 'guardian_contact'].forEach((f) => { if (d[f] && !/^(\+63|0)9\d{9}$/.test(d[f].replace(/[\s-]/g, ''))) e[f] = 'Enter a valid PH mobile number (09XXXXXXXXX).'; });
    if (d.gender && !['Male', 'Female', 'Other'].includes(d.gender)) e.gender = 'Select a valid gender.';
    if (d.date_of_birth && (!isDate(d.date_of_birth) || d.date_of_birth > today())) e.date_of_birth = 'Enter a valid date of birth.';
    ['first_name', 'middle_name', 'last_name'].forEach((f) => { if (d[f] && d[f].length > 80) e[f] = 'Maximum of 80 characters.'; });
    if (d.guardian_name && d.guardian_name.length > 120) e.guardian_name = 'Maximum of 120 characters.';
    if (d.address && d.address.length > 255) e.address = 'Maximum of 255 characters.';
    if (d.profile_picture && !/^data:image\/(png|jpeg|webp);base64,/.test(d.profile_picture)) e.profile_picture = 'Upload a PNG, JPG or WEBP image.';
    if (d.contact_number) d.contact_number = d.contact_number.replace(/[\s-]/g, '');
    if (d.guardian_contact) d.guardian_contact = d.guardian_contact.replace(/[\s-]/g, '');
    return { data: d, errors: e };
  }

  function validateEnrollment(input) {
    const d = trimAll(input, ['student_id', 'academic_year', 'semester', 'program', 'year_level', 'enrollment_date', 'status']);
    const e = {};
    ['student_id', 'academic_year', 'semester', 'program', 'year_level', 'enrollment_date', 'status'].forEach((f) => { if (d[f] == null || d[f] === '') e[f] = 'This field is required.'; });
    d.student_id = d.student_id != null ? Number(d.student_id) : null;
    d.year_level = d.year_level != null ? Number(d.year_level) : null;
    if (d.student_id && !studentById(d.student_id)) e.student_id = 'Select an existing student.';
    if (d.academic_year && !validAY(d.academic_year)) e.academic_year = 'Use the format YYYY-YYYY (e.g. 2025-2026).';
    if (d.semester && !SEMESTERS.includes(d.semester)) e.semester = 'Select a valid option.';
    if (d.program && !PROGRAM_CODES.includes(d.program)) e.program = 'Select a valid option.';
    if (d.year_level != null && !(Number.isInteger(d.year_level) && d.year_level >= 1 && d.year_level <= 6)) e.year_level = 'Must be between 1 and 6.';
    if (d.enrollment_date && !isDate(d.enrollment_date)) e.enrollment_date = 'Enter a valid date (YYYY-MM-DD).';
    if (d.status && !ENROLL_STATUSES.includes(d.status)) e.status = 'Select a valid option.';
    return { data: d, errors: e };
  }

  function validateSubject(input, ignoreId) {
    const d = trimAll(input, ['code', 'name', 'units', 'program', 'teacher_id']);
    const e = {};
    ['code', 'name', 'units', 'program'].forEach((f) => { if (d[f] == null || d[f] === '') e[f] = 'This field is required.'; });
    if (d.code) d.code = d.code.toUpperCase();
    if (d.code && !/^[A-Z0-9-]{2,20}$/.test(d.code)) e.code = 'Use 2–20 letters, numbers or dashes (e.g. IT101).';
    if (d.code && !e.code && db.subjects.some((s) => s.code === d.code && s.id !== ignoreId)) e.code = 'This subject code already exists.';
    if (d.name && d.name.length > 150) e.name = 'Maximum of 150 characters.';
    d.units = d.units != null ? Number(d.units) : null;
    if (d.units != null && !(Number.isInteger(d.units) && d.units >= 1 && d.units <= 10)) e.units = 'Must be between 1 and 10.';
    if (d.program && ![...PROGRAM_CODES, 'GEN'].includes(d.program)) e.program = 'Select a valid option.';
    d.teacher_id = d.teacher_id ? Number(d.teacher_id) : null;
    if (d.teacher_id) { const t = userById(d.teacher_id); if (!t || t.role !== 'teacher' || t.status !== 'active') e.teacher_id = 'Select an active teacher.'; }
    return { data: d, errors: e };
  }

  function validateGrade(input) {
    const e = {};
    let grade = input.grade === '' || input.grade == null ? null : Number(input.grade);
    if (grade != null && !GRADES.includes(grade)) e.grade = 'Use the grading scale 1.00–3.00 (in 0.25 steps) or 5.00.';
    const remarks = input.remarks || null;
    if (remarks && !['In Progress', 'Passed', 'Failed', 'Incomplete', 'Dropped'].includes(remarks)) e.remarks = 'Select a valid option.';
    if (grade != null && ['Incomplete', 'Dropped'].includes(remarks)) grade = null;
    return { grade, remarks: remarksFor(grade, remarks), errors: e };
  }

  function validateRecord(input, existing) {
    const d = trimAll(input, ['student_id', 'subject_id', 'academic_year', 'semester']);
    if (existing) d.student_id = existing.student_id;
    const e = {};
    ['student_id', 'subject_id', 'academic_year', 'semester'].forEach((f) => { if (d[f] == null || d[f] === '') e[f] = 'This field is required.'; });
    d.student_id = d.student_id ? Number(d.student_id) : null; d.subject_id = d.subject_id ? Number(d.subject_id) : null;
    if (d.student_id && !studentById(d.student_id)) e.student_id = 'Select an existing student.';
    if (d.subject_id && !subjectById(d.subject_id)) e.subject_id = 'Select an existing subject.';
    if (d.academic_year && !validAY(d.academic_year)) e.academic_year = 'Use the format YYYY-YYYY (e.g. 2025-2026).';
    if (d.semester && !SEMESTERS.includes(d.semester)) e.semester = 'Select a valid option.';
    const g = validateGrade(input); Object.assign(e, g.errors);
    let enrollment = null;
    if (!Object.keys(e).length) {
      enrollment = db.enrollments.find((x) => x.student_id === d.student_id && x.academic_year === d.academic_year && x.semester === d.semester);
      if (!enrollment) e.academic_year = 'The student has no enrollment for this term. Enroll them first.';
      else if (db.records.some((r) => r.student_id === d.student_id && r.subject_id === d.subject_id && r.academic_year === d.academic_year && r.semester === d.semester && (!existing || r.id !== existing.id))) e.subject_id = 'The student already has a record for this subject in this term.';
    }
    return { data: { ...d, grade: g.grade, remarks: g.remarks, enrollment_id: enrollment ? enrollment.id : null }, errors: e };
  }

  function validateUser(input, existing) {
    const d = trimAll(input, ['name', 'email', 'username', 'role', 'title', 'student_id', 'status', 'password']);
    const e = {};
    ['name', 'email', 'username', 'role'].forEach((f) => { if (!d[f]) e[f] = 'This field is required.'; });
    if (d.name && d.name.length > 120) e.name = 'Maximum of 120 characters.';
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) e.email = 'Enter a valid email address.';
    if (d.email && !e.email && db.users.some((u) => u.email.toLowerCase() === d.email.toLowerCase() && (!existing || u.id !== existing.id))) e.email = 'This email is already used by another account.';
    if (d.username && !/^[A-Za-z0-9._-]{3,60}$/.test(d.username)) e.username = 'Use 3–60 letters, numbers, dots, dashes or underscores.';
    if (d.username && !e.username && db.users.some((u) => u.username.toLowerCase() === d.username.toLowerCase() && (!existing || u.id !== existing.id))) e.username = 'This username is already taken.';
    if (d.role && !['admin', 'teacher', 'student'].includes(d.role)) e.role = 'Select a valid option.';
    if (d.title && d.title.length > 120) e.title = 'Maximum of 120 characters.';
    d.status = d.status || (existing ? existing.status : 'active');
    if (!['active', 'inactive'].includes(d.status)) e.status = 'Select a valid option.';
    d.student_id = d.role === 'student' && d.student_id ? Number(d.student_id) : null;
    if (d.role === 'student') {
      if (!d.student_id) e.student_id = 'Link the account to a student record.';
      else if (!studentById(d.student_id)) e.student_id = 'Select an existing student.';
      else if (db.users.some((u) => u.student_id === d.student_id && (!existing || u.id !== existing.id))) e.student_id = 'This student already has an account.';
    }
    if (!existing) { if (!d.password) e.password = 'This field is required.'; else if (!PASSWORD_RX.test(d.password)) e.password = PASSWORD_MSG; }
    if (d.email) d.email = d.email.toLowerCase();
    if (d.username) d.username = d.username.toLowerCase();
    return { data: d, errors: e };
  }
  const userRow = (u) => { const s = u.student_id ? studentById(u.student_id) : null; return { ...publicUser(u), status: u.status, last_login_at: u.last_login_at || null, created_at: u.created_at || null, student_number: s ? s.student_number : null }; };

  // ---------- routes ----------
  const routes = [];
  const route = (method, pattern, roles, handler) => {
    const keys = []; const rx = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '(\\d+)'; }) + '$');
    routes.push({ method, rx, keys, roles, handler });
  };

  // AUTH (Module 1)
  route('POST', '/auth/login', null, (_, __, body) => {
    const id = String(body.identifier || '').trim().toLowerCase();
    if (!id || !body.password) return fail(422, 'Please enter your email/username and password.', { identifier: !id ? 'This field is required.' : undefined, password: !body.password ? 'This field is required.' : undefined });
    const user = db.users.find((u) => u.email.toLowerCase() === id || u.username.toLowerCase() === id);
    if (!user || user.password !== body.password) { log(user, 'login_failed', `Failed sign-in attempt for "${id.slice(0, 60)}"`); save(); return fail(401, 'Invalid email/username or password.'); }
    if (user.status !== 'active') return fail(403, 'This account is deactivated. Please contact the registrar.');
    if (browser) (body.remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify({ user_id: user.id }));
    user.last_login_at = now();
    log(user, 'login', `${user.name} signed in`); save();
    return ok({ user: publicUser(user) }, { csrf_token: csrf() });
  });
  route('POST', '/auth/logout', [], (u) => { if (u) { log(u, 'logout', `${u.name} signed out`); save(); } if (browser) { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } return ok(null); });
  route('GET', '/auth/me', [], (u) => ok(publicUser(u), { csrf_token: csrf() }));

  // META
  route('GET', '/meta', [], () => {
    const years = [...new Set([F.CURRENT.academic_year, ...db.enrollments.map((e) => e.academic_year)])].sort().reverse();
    return ok({ programs: F.PROGRAMS, semesters: SEMESTERS, current_term: F.CURRENT, academic_years: years });
  });

  // DASHBOARDS (Module 2)
  route('GET', '/dashboard/admin', ['admin'], () => {
    const current = db.enrollments.filter((e) => e.is_current);
    const byProgram = F.PROGRAMS.map((p) => ({
      program: p.code, name: p.name,
      enrolled: current.filter((e) => e.program === p.code && e.status === 'Enrolled').length,
      pending: current.filter((e) => e.program === p.code && e.status === 'Pending').length,
    }));
    const byStatus = ['Enrolled', 'Pending', 'Dropped'].map((s) => ({ status: s, count: current.filter((e) => e.status === s).length }));
    return ok({
      totals: {
        students: db.students.length,
        teachers: db.users.filter((u) => u.role === 'teacher' && u.status === 'active').length,
        enrolled: current.filter((e) => e.status === 'Enrolled').length,
        subjects: db.subjects.length,
      },
      current_term: F.CURRENT,
      enrollment_by_program: byProgram,
      enrollment_by_status: byStatus,
      recent_students: [...db.students].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5).map(studentRow),
      recent_activity: db.logs.slice(0, 7).map((l) => ({ ...l, user_name: (userById(l.user_id) || {}).name || 'System' })),
    });
  });

  route('GET', '/dashboard/teacher', ['teacher'], (u) => {
    const mine = db.subjects.filter((s) => s.teacher_id === u.id);
    const inTerm = (r) => r.academic_year === F.CURRENT.academic_year && r.semester === F.CURRENT.semester;
    const classes = mine.map((sub) => {
      const recs = db.records.filter((r) => r.subject_id === sub.id && inTerm(r));
      return { ...sub, students: recs.length, pending_grades: recs.filter((r) => r.grade == null && r.remarks === 'In Progress').length };
    });
    const ids = new Set(db.records.filter((r) => mine.some((m) => m.id === r.subject_id) && r.academic_year === F.CURRENT.academic_year).map((r) => r.student_id));
    const roster = db.records.filter((r) => mine.some((m) => m.id === r.subject_id) && inTerm(r))
      .map(recordRow).sort((a, b) => (a.grade == null ? 0 : 1) - (b.grade == null ? 0 : 1) || a.last_name.localeCompare(b.last_name)).slice(0, 8);
    return ok({
      current_term: F.CURRENT,
      totals: { subjects: mine.length, students: ids.size, pending_grades: classes.reduce((a, c) => a + c.pending_grades, 0), units: mine.reduce((a, c) => a + c.units, 0) },
      classes, roster,
    });
  });

  route('GET', '/dashboard/student', ['student'], (u) => {
    const s = studentById(u.student_id);
    if (!s) return fail(404, 'Student profile not found.');
    const recs = db.records.filter((r) => r.student_id === s.id).map(recordRow).sort((a, b) => b.academic_year.localeCompare(a.academic_year) || b.semester.localeCompare(a.semester) || a.subject_code.localeCompare(b.subject_code));
    const history = db.enrollments.filter((e) => e.student_id === s.id).sort((a, b) => b.academic_year.localeCompare(a.academic_year) || b.semester.localeCompare(a.semester));
    const current = recs.filter((r) => isCurrentTerm(r.academic_year, r.semester));
    return ok({
      student: studentRow(s), current_term: F.CURRENT, current_enrollment: currentEnrollment(s.id), enrollment_history: history,
      records: recs, gwa: gwa(recs), current_units: current.reduce((a, r) => a + r.units, 0), subjects_this_term: current.length,
    });
  });

  // STUDENTS (Module 3)
  route('GET', '/students', ['admin', 'teacher'], (u, _, __, q) => {
    let rows = db.students;
    if (u.role === 'teacher') { const ids = teacherStudentIds(u); rows = rows.filter((s) => ids.has(s.id)); }
    rows = rows.map(studentRow);
    const term = String(q.search || '').trim().toLowerCase();
    rows = rows.filter((s) => matches(term, [s.student_number, s.first_name, s.last_name, s.full_name, `${s.first_name} ${s.last_name}`, s.email]));
    if (q.gender) rows = rows.filter((s) => s.gender === q.gender);
    if (q.program) rows = rows.filter((s) => s.program === q.program);
    if (q.year_level) rows = rows.filter((s) => String(s.year_level) === String(q.year_level));
    if (q.status) rows = rows.filter((s) => s.enrollment_status === q.status);
    const sort = ['student_number', 'last_name', 'program', 'year_level', 'created_at'].includes(q.sort) ? q.sort : 'last_name';
    sortRows(rows, sort, q.dir);
    return ok(paginate(rows, q));
  });

  route('GET', '/students/:id', ['admin', 'teacher'], (u, p) => {
    const s = studentById(p.id);
    if (!s || !canSeeStudent(u, s.id)) return fail(404, 'Student not found.');
    let recs = db.records.filter((r) => r.student_id === s.id).map(recordRow);
    recs.sort((a, b) => b.academic_year.localeCompare(a.academic_year) || b.semester.localeCompare(a.semester) || a.subject_code.localeCompare(b.subject_code));
    const all = gwa(recs);
    if (u.role === 'teacher') { const subs = teacherSubjectIds(u); recs = recs.filter((r) => subs.has(r.subject_id)); }
    const enrollments = db.enrollments.filter((e) => e.student_id === s.id).sort((a, b) => b.academic_year.localeCompare(a.academic_year) || b.semester.localeCompare(a.semester));
    return ok({ ...studentRow(s), enrollments, records: recs, gwa: all });
  });

  route('POST', '/students', ['admin'], (u, _, body) => {
    const { data, errors } = validateStudent(body || {});
    if (Object.keys(errors).length) return invalid(errors);
    const row = { id: nextId(db.students), ...data, created_at: now(), updated_at: now() };
    db.students.push(row);
    log(u, 'create', `Added student ${row.first_name} ${row.last_name} (${row.student_number})`); save();
    return ok(studentRow(row), { message: 'Student record created.' });
  });

  route('PUT', '/students/:id', ['admin'], (u, p, body) => {
    const idx = db.students.findIndex((x) => x.id === p.id);
    if (idx < 0) return fail(404, 'Student not found.');
    const { data, errors } = validateStudent(body || {}, p.id);
    if (Object.keys(errors).length) return invalid(errors);
    db.students[idx] = { ...db.students[idx], ...data, updated_at: now() };
    log(u, 'update', `Updated profile of ${data.first_name} ${data.last_name} (${data.student_number})`); save();
    return ok(studentRow(db.students[idx]), { message: 'Student record updated.' });
  });

  route('DELETE', '/students/:id', ['admin'], (u, p) => {
    const s = studentById(p.id);
    if (!s) return fail(404, 'Student not found.');
    db.students = db.students.filter((x) => x.id !== p.id);
    db.enrollments = db.enrollments.filter((x) => x.student_id !== p.id);
    db.records = db.records.filter((x) => x.student_id !== p.id);
    db.users = db.users.filter((x) => x.student_id !== p.id);
    log(u, 'delete', `Deleted student ${s.first_name} ${s.last_name} (${s.student_number})`); save();
    return ok(null, { message: 'Student record deleted.' });
  });

  // ENROLLMENTS (Module 4)
  route('GET', '/enrollments', ['admin'], (u, _, __, q) => {
    let rows = db.enrollments.map(enrollmentRow);
    const term = String(q.search || '').trim().toLowerCase();
    rows = rows.filter((e) => matches(term, [e.student_number, e.first_name, e.last_name, e.student_name, `${e.first_name} ${e.last_name}`]));
    ['academic_year', 'semester', 'status', 'program'].forEach((k) => { if (q[k]) rows = rows.filter((e) => e[k] === q[k]); });
    if (q.year_level) rows = rows.filter((e) => String(e.year_level) === String(q.year_level));
    if (q.student_id) rows = rows.filter((e) => e.student_id === Number(q.student_id));
    const sort = ['enrollment_date', 'academic_year', 'student_number', 'last_name', 'program', 'year_level', 'status'].includes(q.sort) ? q.sort : 'enrollment_date';
    sortRows(rows, sort, q.sort ? q.dir : 'desc');
    return ok(paginate(rows, q));
  });

  route('GET', '/enrollments/:id', ['admin'], (u, p) => {
    const e = db.enrollments.find((x) => x.id === p.id);
    if (!e) return fail(404, 'Enrollment not found.');
    const history = db.enrollments.filter((x) => x.student_id === e.student_id).sort((a, b) => b.academic_year.localeCompare(a.academic_year) || b.semester.localeCompare(a.semester));
    return ok({ ...enrollmentRow(e), history });
  });

  route('POST', '/enrollments', ['admin'], (u, _, body) => {
    const { data, errors } = validateEnrollment(body || {});
    if (!Object.keys(errors).length && db.enrollments.some((x) => x.student_id === data.student_id && x.academic_year === data.academic_year && x.semester === data.semester)) errors.semester = 'This student already has an enrollment for this term.';
    if (Object.keys(errors).length) return invalid(errors);
    const row = { id: nextId(db.enrollments), ...data, is_current: isCurrentTerm(data.academic_year, data.semester), created_at: now(), updated_at: now() };
    db.enrollments.push(row);
    const s = studentById(row.student_id);
    log(u, 'create', `Enrolled ${s.first_name} ${s.last_name} (${s.student_number}) in ${row.program} for ${row.semester}, AY ${row.academic_year}`); save();
    return ok(enrollmentRow(row), { message: 'Student enrolled.' });
  });

  route('PUT', '/enrollments/:id', ['admin'], (u, p, body) => {
    const idx = db.enrollments.findIndex((x) => x.id === p.id);
    if (idx < 0) return fail(404, 'Enrollment not found.');
    const cur = db.enrollments[idx];
    const { data, errors } = validateEnrollment({ ...(body || {}), student_id: cur.student_id });
    if (!Object.keys(errors).length && db.enrollments.some((x) => x.id !== cur.id && x.student_id === cur.student_id && x.academic_year === data.academic_year && x.semester === data.semester)) errors.semester = 'This student already has an enrollment for this term.';
    if (Object.keys(errors).length) return invalid(errors);
    db.enrollments[idx] = { ...cur, ...data, is_current: isCurrentTerm(data.academic_year, data.semester), updated_at: now() };
    db.records.forEach((r) => { if (r.enrollment_id === cur.id) { r.academic_year = data.academic_year; r.semester = data.semester; } });
    const s = studentById(cur.student_id);
    log(u, 'update', `Updated enrollment of ${s.first_name} ${s.last_name} (${data.semester}, AY ${data.academic_year}) to ${data.status}`); save();
    return ok(enrollmentRow(db.enrollments[idx]), { message: 'Enrollment updated.' });
  });

  // SUBJECTS (Module 5)
  route('GET', '/teachers', ['admin'], () => ok(db.users.filter((x) => x.role === 'teacher' && x.status === 'active').map((t) => ({ id: t.id, name: t.name, title: t.title || null })).sort((a, b) => a.name.localeCompare(b.name))));

  route('GET', '/subjects', ['admin', 'teacher'], (u, _, __, q) => {
    let rows = db.subjects;
    if (u.role === 'teacher') rows = rows.filter((s) => s.teacher_id === u.id);
    rows = rows.map((s) => ({ ...s, teacher_name: (userById(s.teacher_id) || {}).name || null, records_count: db.records.filter((r) => r.subject_id === s.id).length }));
    const term = String(q.search || '').trim().toLowerCase();
    rows = rows.filter((s) => matches(term, [s.code, s.name, s.teacher_name]));
    if (q.program) rows = rows.filter((s) => s.program === q.program);
    if (q.teacher_id) rows = rows.filter((s) => s.teacher_id === Number(q.teacher_id));
    return ok(sortRows(rows, 'code', 'asc'));
  });

  route('POST', '/subjects', ['admin'], (u, _, body) => {
    const { data, errors } = validateSubject(body || {});
    if (Object.keys(errors).length) return invalid(errors);
    const row = { id: nextId(db.subjects), ...data, created_at: now(), updated_at: now() };
    db.subjects.push(row);
    log(u, 'create', `Added subject ${row.code} – ${row.name}`); save();
    return ok(row, { message: 'Subject created.' });
  });

  route('POST', '/subjects/starter-catalog', ['admin'], (u, _, body) => {
    const templates = Array.isArray(body.subjects) ? body.subjects : [];
    if (!templates.length || templates.length > 100) return fail(422, 'A valid starter subject list is required.');
    const existing = new Set(db.subjects.map((s) => String(s.code).toUpperCase()));
    const seen = new Set(); const pending = []; let skipped = 0;
    for (const template of templates) {
      const code = String(template.code || '').trim().toUpperCase();
      if (existing.has(code) || seen.has(code)) { skipped++; continue; }
      const { data, errors } = validateSubject({ ...template, code, teacher_id: null });
      if (Object.keys(errors).length) return invalid({ starter_catalog: `Invalid starter subject ${code || '(missing code)'}.` });
      seen.add(code); pending.push(data);
    }
    const createdAt = now();
    pending.forEach((data) => db.subjects.push({ id: nextId(db.subjects), ...data, created_at: createdAt, updated_at: createdAt }));
    if (pending.length) {
      log(u, 'create', `Added ${pending.length} starter subjects to the catalog`);
      save();
    }
    return ok({ added: pending.length, skipped, total: db.subjects.length }, { message: 'Starter subjects added to the Firestore catalog.' });
  });

  route('PUT', '/subjects/:id', ['admin'], (u, p, body) => {
    const idx = db.subjects.findIndex((x) => x.id === p.id);
    if (idx < 0) return fail(404, 'Subject not found.');
    const { data, errors } = validateSubject(body || {}, p.id);
    if (Object.keys(errors).length) return invalid(errors);
    db.subjects[idx] = { ...db.subjects[idx], ...data, updated_at: now() };
    log(u, 'update', `Updated subject ${data.code} – ${data.name}`); save();
    return ok(db.subjects[idx], { message: 'Subject updated.' });
  });

  route('DELETE', '/subjects/:id', ['admin'], (u, p) => {
    const s = subjectById(p.id);
    if (!s) return fail(404, 'Subject not found.');
    const n = db.records.filter((r) => r.subject_id === s.id).length;
    if (n) return fail(409, `${s.code} has ${n} academic record${n > 1 ? 's' : ''} and cannot be deleted.`);
    db.subjects = db.subjects.filter((x) => x.id !== s.id);
    log(u, 'delete', `Deleted subject ${s.code} – ${s.name}`); save();
    return ok(null, { message: 'Subject deleted.' });
  });

  // ACADEMIC RECORDS & GRADES (Module 5)
  route('GET', '/academic-records', ['admin', 'teacher'], (u, _, __, q) => {
    let rows = db.records;
    if (u.role === 'teacher') { const subs = teacherSubjectIds(u); rows = rows.filter((r) => subs.has(r.subject_id)); }
    rows = rows.map(recordRow);
    const term = String(q.search || '').trim().toLowerCase();
    rows = rows.filter((r) => matches(term, [r.student_number, r.first_name, r.last_name, r.student_name, `${r.first_name} ${r.last_name}`, r.subject_code, r.subject_name]));
    ['academic_year', 'semester', 'remarks'].forEach((k) => { if (q[k]) rows = rows.filter((r) => r[k] === q[k]); });
    if (q.subject_id) rows = rows.filter((r) => r.subject_id === Number(q.subject_id));
    if (q.student_id) rows = rows.filter((r) => r.student_id === Number(q.student_id));
    const sort = ['last_name', 'student_number', 'subject_code', 'academic_year', 'grade', 'updated_at'].includes(q.sort) ? q.sort : null;
    if (sort) sortRows(rows, sort, q.dir);
    else rows.sort((a, b) => b.academic_year.localeCompare(a.academic_year) || b.semester.localeCompare(a.semester) || a.last_name.localeCompare(b.last_name) || a.subject_code.localeCompare(b.subject_code));
    return ok(paginate(rows, q));
  });

  route('POST', '/academic-records', ['admin'], (u, _, body) => {
    const { data, errors } = validateRecord(body || {});
    if (Object.keys(errors).length) return invalid(errors);
    const row = { id: nextId(db.records), ...data, encoded_by: data.grade != null ? u.id : null, created_at: now(), updated_at: now() };
    db.records.push(row);
    const r = recordRow(row);
    log(u, 'create', `Added ${r.subject_code} record for ${r.student_name} (${r.semester}, AY ${r.academic_year})`); save();
    return ok(r, { message: 'Academic record added.' });
  });

  route('PUT', '/academic-records/:id', ['admin'], (u, p, body) => {
    const idx = db.records.findIndex((x) => x.id === p.id);
    if (idx < 0) return fail(404, 'Academic record not found.');
    const { data, errors } = validateRecord(body || {}, db.records[idx]);
    if (Object.keys(errors).length) return invalid(errors);
    const prev = db.records[idx];
    db.records[idx] = { ...prev, ...data, encoded_by: data.grade !== prev.grade ? (data.grade != null ? u.id : null) : prev.encoded_by, updated_at: now() };
    const r = recordRow(db.records[idx]);
    log(u, 'update', `Updated ${r.subject_code} record of ${r.student_name} (${r.semester}, AY ${r.academic_year})`); save();
    return ok(r, { message: 'Academic record updated.' });
  });

  route('PUT', '/academic-records/:id/grade', ['admin', 'teacher'], (u, p, body) => {
    const rec = db.records.find((x) => x.id === p.id);
    if (!rec) return fail(404, 'Academic record not found.');
    if (u.role === 'teacher' && !teacherSubjectIds(u).has(rec.subject_id)) return fail(403, 'You can only encode grades for subjects assigned to you.');
    const { grade, remarks, errors } = validateGrade(body || {});
    if (Object.keys(errors).length) return invalid(errors);
    const before = rec.grade;
    Object.assign(rec, { grade, remarks, encoded_by: grade != null ? u.id : null, updated_at: now() });
    const r = recordRow(rec);
    log(u, 'update', `${u.name} set ${r.subject_code} grade of ${r.student_name} to ${grade != null ? grade.toFixed(2) : remarks}${before != null ? ` (was ${Number(before).toFixed(2)})` : ''}`); save();
    return ok(r, { message: 'Grade saved.' });
  });

  route('DELETE', '/academic-records/:id', ['admin'], (u, p) => {
    const rec = db.records.find((x) => x.id === p.id);
    if (!rec) return fail(404, 'Academic record not found.');
    const r = recordRow(rec);
    db.records = db.records.filter((x) => x.id !== rec.id);
    log(u, 'delete', `Deleted ${r.subject_code} record of ${r.student_name} (${r.semester}, AY ${r.academic_year})`); save();
    return ok(null, { message: 'Academic record deleted.' });
  });

  // SEARCH (Module 6)
  route('GET', '/search/students', ['admin', 'teacher'], (u, _, __, q) => {
    const term = String(q.q || '').trim().toLowerCase();
    const termFilters = q.academic_year || q.semester || q.program || q.year_level || q.status;
    let students = db.students;
    if (u.role === 'teacher') { const ids = teacherStudentIds(u); students = students.filter((s) => ids.has(s.id)); }
    students = students.filter((s) => matches(term, [s.student_number, s.first_name, s.last_name, `${s.first_name} ${s.last_name}`, `${s.last_name}, ${s.first_name}`]));
    let rows;
    if (termFilters) {
      const ids = new Set(students.map((s) => s.id));
      rows = db.enrollments.filter((e) => ids.has(e.student_id)
        && (!q.academic_year || e.academic_year === q.academic_year) && (!q.semester || e.semester === q.semester)
        && (!q.program || e.program === q.program) && (!q.year_level || String(e.year_level) === String(q.year_level)) && (!q.status || e.status === q.status))
        .map((e) => ({ e, s: studentById(e.student_id) }));
    } else {
      rows = students.map((s) => ({ e: latestEnrollment(s.id), s }));
    }
    rows = rows.map(({ e, s }) => ({ student_id: s.id, student_number: s.student_number, first_name: s.first_name, middle_name: s.middle_name, last_name: s.last_name, full_name: fullName(s), email: s.email, profile_picture: s.profile_picture,
      enrollment_id: e ? e.id : null, academic_year: e ? e.academic_year : null, semester: e ? e.semester : null, program: e ? e.program : null, year_level: e ? e.year_level : null, status: e ? e.status : 'Not Enrolled' }));
    rows.sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name) || String(b.academic_year).localeCompare(String(a.academic_year)));
    return ok(paginate(rows, q));
  });

  // REPORTS (Module 7)
  const COLS = {
    'master-list': [['student_number', 'Student No.'], ['last_name', 'Last Name'], ['first_name', 'First Name'], ['middle_name', 'Middle Name'], ['gender', 'Gender'], ['date_of_birth', 'Birth Date'], ['program', 'Program'], ['year_level', 'Year'], ['status', 'Status'], ['email', 'Email'], ['contact_number', 'Contact']],
    enrollment: [['student_number', 'Student No.'], ['student_name', 'Student Name'], ['academic_year', 'Academic Year'], ['semester', 'Semester'], ['program', 'Program'], ['year_level', 'Year'], ['enrollment_date', 'Enrollment Date'], ['status', 'Status']],
    'academic-records': [['student_number', 'Student No.'], ['student_name', 'Student Name'], ['subject_code', 'Code'], ['subject_name', 'Subject'], ['units', 'Units'], ['academic_year', 'Academic Year'], ['semester', 'Semester'], ['grade', 'Grade'], ['remarks', 'Remarks']],
    grades: [['academic_year', 'Academic Year'], ['semester', 'Semester'], ['subject_code', 'Code'], ['subject_name', 'Subject'], ['units', 'Units'], ['grade', 'Grade'], ['remarks', 'Remarks']],
  };
  const TITLES = { 'master-list': 'Student Master List', enrollment: 'Enrollment Report', 'academic-records': 'Academic Records Report', grades: 'Student Grade Report' };
  const fmtGrade = (g) => (g == null ? '' : Number(g).toFixed(2));
  const countBy = (rows, key) => rows.reduce((m, r) => { m[r[key]] = (m[r[key]] || 0) + 1; return m; }, {});

  function buildReport(type, u, q) {
    const filters = {};
    if (q.academic_year) filters['Academic Year'] = q.academic_year;
    if (q.semester) filters.Semester = q.semester;
    if (q.program) filters.Program = q.program;
    if (q.status) filters.Status = q.status;
    if (q.date_from || q.date_to) filters.Date = `${q.date_from || '…'} to ${q.date_to || '…'}`;
    const termOk = (r) => (!q.academic_year || r.academic_year === q.academic_year) && (!q.semester || r.semester === q.semester);
    let rows = []; let summary = []; let student = null;

    if (type === 'master-list') {
      const term = q.academic_year || q.semester;
      rows = db.students.filter((s) => inDateRange(s.created_at, q.date_from, q.date_to)).map((s) => {
        const e = term ? db.enrollments.filter((x) => x.student_id === s.id && termOk(x)).sort((a, b) => b.id - a.id)[0] : latestEnrollment(s.id);
        if (term && !e) return null;
        return { ...s, program: e ? e.program : '', year_level: e ? e.year_level : '', status: e ? e.status : 'Not Enrolled' };
      }).filter(Boolean).filter((r) => (!q.program || r.program === q.program) && (!q.status || r.status === q.status));
      rows.sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
      summary = [['Total students', rows.length], ...Object.entries(countBy(rows, 'gender')).map(([k, v]) => [k, v])];
    }
    if (type === 'enrollment') {
      rows = db.enrollments.filter((e) => termOk(e) && inDateRange(e.enrollment_date, q.date_from, q.date_to) && (!q.program || e.program === q.program) && (!q.status || e.status === q.status)).map(enrollmentRow);
      rows.sort((a, b) => b.academic_year.localeCompare(a.academic_year) || a.semester.localeCompare(b.semester) || a.program.localeCompare(b.program) || a.last_name.localeCompare(b.last_name));
      summary = [['Total enrollments', rows.length], ...Object.entries(countBy(rows, 'status')).map(([k, v]) => [k, v])];
    }
    if (type === 'academic-records' || type === 'grades') {
      let recs = db.records;
      if (u.role === 'teacher') { const subs = teacherSubjectIds(u); recs = recs.filter((r) => subs.has(r.subject_id)); }
      if (type === 'grades') {
        const s = studentById(Number(q.student_id));
        if (!s || !canSeeStudent(u, s.id)) return fail(422, 'Select a student for the grade report.', { student_id: 'Select a student.' });
        recs = recs.filter((r) => r.student_id === s.id);
        const sr = studentRow(s);
        student = { id: s.id, student_number: s.student_number, full_name: sr.full_name, program: sr.program, year_level: sr.year_level };
      }
      if (q.subject_id) recs = recs.filter((r) => r.subject_id === Number(q.subject_id));
      rows = recs.filter((r) => termOk(r) && inDateRange(r.updated_at, q.date_from, q.date_to)).map(recordRow).map((r) => ({ ...r, grade: fmtGrade(r.grade) }));
      rows.sort((a, b) => b.academic_year.localeCompare(a.academic_year) || a.semester.localeCompare(b.semester) || (type === 'grades' ? 0 : a.last_name.localeCompare(b.last_name)) || a.subject_code.localeCompare(b.subject_code));
      const g = gwa(rows.map((r) => ({ grade: r.grade === '' ? null : Number(r.grade), units: r.units })));
      summary = [['Total records', rows.length], ['Total units', rows.reduce((a, r) => a + r.units, 0)], ['Passed', rows.filter((r) => r.remarks === 'Passed').length], ['Failed', rows.filter((r) => r.remarks === 'Failed').length], [type === 'grades' ? 'GWA' : 'Weighted average', g != null ? g.toFixed(2) : '—']];
      if (student) filters.Student = `${student.full_name} (${student.student_number})`;
    }
    const columns = COLS[type].map(([key, label]) => ({ key, label }));
    const data = {
      type, title: TITLES[type], filters, columns,
      rows: rows.map((r) => Object.fromEntries(columns.map((c) => [c.key, r[c.key] ?? '']))),
      summary: summary.map(([label, value]) => ({ label, value })), student, generated_at: now(), generated_by: u.name,
    };
    log(u, 'report', `Generated ${data.title}${Object.keys(filters).length ? ' — ' + Object.values(filters).join(', ') : ''}${q.format === 'csv' ? ' (CSV)' : ''}`); save();
    if (q.format === 'csv') return ok({ filename: `${type}-${today()}.csv`, content: toCsv(data) });
    return ok(data);
  }
  const csvCell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function toCsv(d) {
    const lines = [[d.title], ...Object.entries(d.filters).map(([k, v]) => [k, v]), ['Generated', `${d.generated_at} by ${d.generated_by}`], [], d.columns.map((c) => c.label), ...d.rows.map((r) => d.columns.map((c) => r[c.key])), [], ...d.summary.map((s) => [s.label, s.value])];
    return '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n');
  }
  route('GET', '/reports/master-list', ['admin'], (u, _, __, q) => buildReport('master-list', u, q));
  route('GET', '/reports/enrollment', ['admin'], (u, _, __, q) => buildReport('enrollment', u, q));
  route('GET', '/reports/academic-records', ['admin', 'teacher'], (u, _, __, q) => buildReport('academic-records', u, q));
  route('GET', '/reports/grades', ['admin', 'teacher'], (u, _, __, q) => buildReport('grades', u, q));

  // USERS & LOGS (Module 8)
  route('GET', '/users', ['admin'], (u, _, __, q) => {
    let rows = db.users.map(userRow);
    const term = String(q.search || '').trim().toLowerCase();
    rows = rows.filter((x) => matches(term, [x.name, x.email, x.username, x.student_number]));
    if (q.role) rows = rows.filter((x) => x.role === q.role);
    if (q.status) rows = rows.filter((x) => x.status === q.status);
    sortRows(rows, ['name', 'role', 'last_login_at', 'created_at'].includes(q.sort) ? q.sort : 'name', q.dir);
    return ok(paginate(rows, q));
  });
  route('GET', '/users/:id', ['admin'], (u, p) => { const x = userById(p.id); return x ? ok(userRow(x)) : fail(404, 'User not found.'); });
  route('POST', '/users', ['admin'], (u, _, body) => {
    const { data, errors } = validateUser(body || {});
    if (Object.keys(errors).length) return invalid(errors);
    const { password, ...rest } = data;
    const row = { id: nextId(db.users), ...rest, password, created_at: now(), updated_at: now() };
    db.users.push(row);
    log(u, 'create', `Created ${row.role} account for ${row.name}`); save();
    return ok(userRow(row), { message: 'User account created.' });
  });
  route('PUT', '/users/:id', ['admin'], (u, p, body) => {
    const x = userById(p.id);
    if (!x) return fail(404, 'User not found.');
    const { data, errors } = validateUser(body || {}, x);
    if (x.id === u.id && data.role && data.role !== x.role) errors.role = 'You cannot change your own role.';
    if (x.id === u.id && data.status === 'inactive') errors.status = 'You cannot deactivate your own account.';
    if (Object.keys(errors).length) return invalid(errors);
    delete data.password;
    Object.assign(x, data, { updated_at: now() });
    log(u, 'update', `Updated account of ${x.name}`); save();
    return ok(userRow(x), { message: 'User account updated.' });
  });
  route('PUT', '/users/:id/status', ['admin'], (u, p, body) => {
    const x = userById(p.id);
    if (!x) return fail(404, 'User not found.');
    if (!['active', 'inactive'].includes(body.status)) return invalid({ status: 'Select a valid option.' });
    if (x.id === u.id) return fail(422, 'You cannot deactivate your own account.', { status: 'You cannot deactivate your own account.' });
    x.status = body.status; x.updated_at = now();
    log(u, 'update', `${body.status === 'active' ? 'Activated' : 'Deactivated'} account of ${x.name}`); save();
    return ok(userRow(x), { message: body.status === 'active' ? 'Account activated.' : 'Account deactivated.' });
  });
  route('POST', '/users/:id/reset-password', ['admin'], (u, p, body) => {
    const x = userById(p.id);
    if (!x) return fail(404, 'User not found.');
    if (!body.password) return invalid({ password: 'This field is required.' });
    if (!PASSWORD_RX.test(body.password)) return invalid({ password: PASSWORD_MSG });
    x.password = body.password; x.updated_at = now();
    log(u, 'update', `Reset the password of ${x.name}`); save();
    return ok(null, { message: 'Password reset. Share the new password with the user securely.' });
  });

  route('GET', '/logs', ['admin'], (u, _, __, q) => {
    let rows = db.logs.map((l) => { const x = userById(l.user_id); return { ...l, user_name: x ? x.name : 'System', user_role: x ? x.role : null }; });
    const term = String(q.search || '').trim().toLowerCase();
    rows = rows.filter((l) => matches(term, [l.description, l.user_name]));
    if (q.action) rows = rows.filter((l) => l.action === q.action);
    if (q.user_id) rows = rows.filter((l) => l.user_id === Number(q.user_id));
    rows = rows.filter((l) => inDateRange(l.created_at, q.date_from, q.date_to));
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
    return ok({ ...paginate(rows, q), actions: LOG_ACTIONS });
  });

  // ---------- dispatcher ----------
  const server = {
    handle(method, path, query, body) {
      const clean = path.split('?')[0];
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = clean.match(r.rx); if (!m) continue;
        const params = {}; r.keys.forEach((k, i) => { params[k] = Number(m[i + 1]); });
        const user = currentUser();
        if (r.roles) {
          if (!user) return fail(401, 'Your session has expired. Please sign in again.');
          if (r.roles.length && !r.roles.includes(user.role)) return fail(403, 'You do not have permission to perform this action.');
        }
        try { return r.handler(user, params, body || {}, query || {}); } catch (e) { console.error(e); return fail(500, 'Unexpected server error.'); }
      }
      return fail(404, `Endpoint ${method} ${clean} was not found.`);
    },
    reset() { if (browser) localStorage.removeItem(DB_KEY); db = load(); },
    getData() { return clone(db); },
  };
  if (browser && !options.initialDb) window.MockServer = server;
  return server;
});
