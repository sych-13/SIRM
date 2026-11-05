/* =========================================================
   FIXTURES — realistic stub data for Milestone 1.
   ---------------------------------------------------------
   Every record here mirrors a row in the planned MySQL schema
   (users, students, enrollments, subjects, academic_records,
   system_logs). When the PHP REST API goes live (see PLAN.md),
   this file is no longer loaded: set CONFIG.USE_MOCK_API = false
   in core/config.js and the same screens read real data.
   ========================================================= */
(function () {
  'use strict';

  const PROGRAMS = [
    { code: 'BSIT', name: 'BS Information Technology' },
    { code: 'BSCS', name: 'BS Computer Science' },
    { code: 'BSBA', name: 'BS Business Administration' },
    { code: 'BSED', name: 'Bachelor of Secondary Education' },
    { code: 'BSN', name: 'BS Nursing' },
  ];

  // [first, middle, last, gender, dob, city]
  const PEOPLE = [
    ['Andrea', 'Santos', 'Dela Cruz', 'Female', '2005-03-14', 'Quezon City'],
    ['Miguel', 'Ramos', 'Villanueva', 'Male', '2004-11-02', 'Makati City'],
    ['Patricia', 'Lim', 'Reyes', 'Female', '2005-07-21', 'Pasig City'],
    ['Joshua', 'Aquino', 'Bautista', 'Male', '2003-09-30', 'Taguig City'],
    ['Kristine', 'Mendoza', 'Garcia', 'Female', '2004-01-18', 'Manila'],
    ['Carlo', 'Torres', 'Navarro', 'Male', '2005-05-09', 'Caloocan City'],
    ['Bea', 'Castillo', 'Fernandez', 'Female', '2004-12-25', 'Marikina City'],
    ['Paolo', 'Gonzales', 'Mercado', 'Male', '2003-06-11', 'Parañaque City'],
    ['Janine', 'Rivera', 'Soriano', 'Female', '2005-02-03', 'Las Piñas City'],
    ['Rafael', 'Domingo', 'Salazar', 'Male', '2004-08-16', 'Mandaluyong City'],
    ['Camille', 'Flores', 'Aguilar', 'Female', '2005-10-07', 'San Juan City'],
    ['Nathan', 'Cruz', 'Pascual', 'Male', '2004-04-22', 'Valenzuela City'],
    ['Erika', 'Morales', 'Tolentino', 'Female', '2003-12-01', 'Malabon City'],
    ['Daniel', 'Valdez', 'Ocampo', 'Male', '2005-01-29', 'Antipolo City'],
    ['Sophia', 'Jimenez', 'Manalo', 'Female', '2004-06-05', 'Bacoor City'],
    ['Gabriel', 'Lopez', 'De Guzman', 'Male', '2005-09-13', 'Imus City'],
    ['Alyssa', 'Perez', 'Santiago', 'Female', '2004-03-27', 'Quezon City'],
    ['Mark', 'Sarmiento', 'Javier', 'Male', '2003-10-19', 'Pasay City'],
    ['Nicole', 'Ignacio', 'Robles', 'Female', '2005-08-08', 'Muntinlupa City'],
    ['Adrian', 'Velasco', 'Castro', 'Male', '2004-02-14', 'Navotas City'],
    ['Hannah', 'Padilla', 'Cortez', 'Female', '2005-11-23', 'Makati City'],
    ['Ian', 'Gutierrez', 'Marquez', 'Male', '2004-07-01', 'Pasig City'],
    ['Trisha', 'Dizon', 'Hernandez', 'Female', '2003-05-17', 'Taguig City'],
    ['Kevin', 'Alvarez', 'Lacson', 'Male', '2005-04-04', 'Manila'],
    ['Mae', 'Concepcion', 'Rosales', 'Female', '2004-09-09', 'Marikina City'],
    ['Luis', 'Espinosa', 'Panganiban', 'Male', '2005-12-12', 'Quezon City'],
  ];
  const GUARDIANS = ['Maria', 'Jose', 'Rosario', 'Antonio', 'Teresita', 'Ramon', 'Elena', 'Roberto'];

  const pad = (n, w) => String(n).padStart(w, '0');
  const iso = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
  const daysAgo = (n, h = 9) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, (n * 17) % 60, 0, 0); return iso(d); };

  const students = PEOPLE.map((p, i) => {
    const [first, middle, last, gender, dob, city] = p;
    const batch = i < 9 ? 2023 : i < 18 ? 2024 : 2025;
    return {
      id: i + 1,
      student_number: `${batch}-${pad(1001 + i * 7, 5)}`,
      first_name: first,
      middle_name: middle,
      last_name: last,
      date_of_birth: dob,
      gender,
      address: `${12 + i * 3} ${['Rizal St.', 'Mabini Ave.', 'Bonifacio Rd.', 'Luna St.'][i % 4]}, ${city}`,
      contact_number: `09${pad(170000000 + i * 3917331, 9)}`,
      email: `${first.toLowerCase()}.${last.toLowerCase().replace(/\s+/g, '')}@student.sirms.edu`,
      guardian_name: `${GUARDIANS[i % GUARDIANS.length]} ${last}`,
      guardian_contact: `09${pad(280000000 + i * 2711113, 9)}`,
      profile_picture: null,
      created_at: daysAgo((PEOPLE.length - i) * 4, 8 + (i % 8)),
      updated_at: daysAgo((PEOPLE.length - i) * 2),
    };
  });

  const users = [
    { id: 1, name: 'Elena Marasigan', email: 'admin@sirms.edu', username: 'admin', role: 'admin', status: 'active', password: 'Admin@123', title: 'University Registrar' },
    { id: 2, name: 'Prof. Ricardo Valencia', email: 'r.valencia@sirms.edu', username: 'rvalencia', role: 'teacher', status: 'active', password: 'Teacher@123', title: 'College of Computing' },
    { id: 3, name: 'Dr. Liza Manansala', email: 'l.manansala@sirms.edu', username: 'lmanansala', role: 'teacher', status: 'active', password: 'Teacher@123', title: 'College of Business' },
    { id: 4, name: 'Prof. Arnel Bautista', email: 'a.bautista@sirms.edu', username: 'abautista', role: 'teacher', status: 'active', password: 'Teacher@123', title: 'College of Education' },
    { id: 5, name: 'Prof. Grace Sy', email: 'g.sy@sirms.edu', username: 'gsy', role: 'teacher', status: 'inactive', password: 'Teacher@123', title: 'College of Nursing' },
    { id: 6, name: 'Andrea Dela Cruz', email: students[0].email, username: students[0].student_number, role: 'student', status: 'active', password: 'Student@123', student_id: 1 },
  ];

  const subjects = [
    { id: 1, code: 'IT101', name: 'Introduction to Computing', units: 3, program: 'BSIT', teacher_id: 2 },
    { id: 2, code: 'IT102', name: 'Computer Programming 1', units: 3, program: 'BSIT', teacher_id: 2 },
    { id: 3, code: 'CS201', name: 'Data Structures & Algorithms', units: 3, program: 'BSCS', teacher_id: 2 },
    { id: 4, code: 'IT210', name: 'Web Systems & Technologies', units: 3, program: 'BSIT', teacher_id: 2 },
    { id: 5, code: 'GE101', name: 'Purposive Communication', units: 3, program: 'GEN', teacher_id: 4 },
    { id: 6, code: 'GE102', name: 'Mathematics in the Modern World', units: 3, program: 'GEN', teacher_id: 4 },
    { id: 7, code: 'BA110', name: 'Principles of Management', units: 3, program: 'BSBA', teacher_id: 3 },
    { id: 8, code: 'BA120', name: 'Financial Accounting', units: 3, program: 'BSBA', teacher_id: 3 },
    { id: 9, code: 'ED101', name: 'The Teaching Profession', units: 3, program: 'BSED', teacher_id: 4 },
    { id: 10, code: 'NU101', name: 'Anatomy & Physiology', units: 5, program: 'BSN', teacher_id: 5 },
    { id: 11, code: 'PE101', name: 'Physical Activities Towards Health', units: 2, program: 'GEN', teacher_id: 4 },
    { id: 12, code: 'NS101', name: 'NSTP 1', units: 3, program: 'GEN', teacher_id: 3 },
  ];

  // Enrollments: everyone has a current-term record; older batches have history.
  const CURRENT = { academic_year: '2025-2026', semester: '1st Semester' };
  const enrollments = [];
  const programOf = {};
  let eid = 1;
  students.forEach((s, i) => {
    const program = PROGRAMS[i % PROGRAMS.length].code;
    const batch = Number(s.student_number.slice(0, 4));
    for (let y = batch; y <= 2025; y++) {
      const ay = `${y}-${y + 1}`;
      const level = y - batch + 1;
      const sems = y === 2025 ? ['1st Semester'] : ['1st Semester', '2nd Semester'];
      sems.forEach((sem) => {
        const isCurrent = ay === CURRENT.academic_year && sem === CURRENT.semester;
        let status = 'Completed';
        if (isCurrent) status = i % 9 === 4 ? 'Pending' : i % 13 === 11 ? 'Dropped' : 'Enrolled';
        enrollments.push({
          id: eid++, student_id: s.id, academic_year: ay, semester: sem, program,
          year_level: level, enrollment_date: `${y}-${sem.startsWith('1st') ? '08-0' : '01-1'}${(i % 8) + 1}`,
          status, is_current: isCurrent,
        });
      });
    }
    programOf[s.id] = program;
  });

  // Academic records for the demo student + a cross-section of classes.
  const GRADES = [1.25, 1.5, 1.75, 1.0, 2.0, 1.5, 2.25, 1.75, 2.5, 1.25, 3.0, 1.5];
  const records = [];
  let rid = 1;
  const addRecord = (student, subject, ay, sem, grade) => {
    const remarks = grade == null ? 'In Progress' : grade <= 3.0 ? 'Passed' : 'Failed';
    const stamp = sem.startsWith('1st') ? `${ay.slice(0, 4)}-08-20 09:00:00` : `${ay.slice(5)}-01-20 09:00:00`;
    records.push({ id: rid++, student_id: student.id, subject_id: subject.id, academic_year: ay, semester: sem, grade, remarks, encoded_by: grade == null ? null : subject.teacher_id, created_at: stamp, updated_at: stamp });
  };
  students.forEach((s, i) => {
    const pool = subjects.filter((sub) => sub.program === programOf[s.id] || sub.program === 'GEN');
    const batch = Number(s.student_number.slice(0, 4));
    if (batch <= 2024) {
      pool.slice(0, 4).forEach((sub, k) => addRecord(s, sub, '2024-2025', k % 2 ? '2nd Semester' : '1st Semester', (i === 7 && k === 2 ? 5.0 : GRADES[(i + k) % GRADES.length])));
    }
    pool.slice(0, 3).forEach((sub, k) => addRecord(s, sub, CURRENT.academic_year, CURRENT.semester, (i + k) % 3 === 0 ? null : GRADES[(i * 2 + k) % GRADES.length]));
  });

  const logs = [
    { id: 1, user_id: 1, action: 'login', description: 'Elena Marasigan signed in', created_at: daysAgo(0, 8) },
    { id: 2, user_id: 1, action: 'create', description: `Added student ${students[25].first_name} ${students[25].last_name} (${students[25].student_number})`, created_at: daysAgo(0, 9) },
    { id: 3, user_id: 2, action: 'update', description: 'Prof. Ricardo Valencia updated grades for IT210 – Web Systems & Technologies', created_at: daysAgo(1, 15) },
    { id: 4, user_id: 1, action: 'update', description: `Updated enrollment status of ${students[4].first_name} ${students[4].last_name} to Pending`, created_at: daysAgo(1, 11) },
    { id: 5, user_id: 1, action: 'create', description: 'Created teacher account for Prof. Grace Sy', created_at: daysAgo(2, 10) },
    { id: 6, user_id: 3, action: 'update', description: 'Dr. Liza Manansala encoded grades for BA110 – Principles of Management', created_at: daysAgo(3, 14) },
    { id: 7, user_id: 1, action: 'delete', description: 'Removed duplicate student record 2025-01999', created_at: daysAgo(4, 16) },
    { id: 8, user_id: 1, action: 'report', description: 'Generated Enrollment Report — AY 2025-2026, 1st Semester', created_at: daysAgo(5, 13) },
  ];

  window.SIRMS_FIXTURES = { PROGRAMS, CURRENT, users, students, subjects, enrollments, records, logs };
})();
