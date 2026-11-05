/* MODULE — Student Portal (read-only views of the student's own records) */
(function () {
  'use strict';
  const { esc } = UI;
  let cache = null; // one fetch per page load; views share it

  async function load(view) {
    if (cache) return cache;
    try { cache = await Api.get('/dashboard/student'); setTimeout(() => { cache = null; }, 60000); return cache; } catch (err) {
      view.innerHTML = `<div class="card">${UI.errorState(err, 'retryPortal')}</div>`;
      UI.$('#retryPortal').onclick = () => Router.resolve(); return null;
    }
  }

  const readOnlyNote = `<p class="small text-muted mt-3 mb-0 no-print"><i class="bi bi-lock me-1"></i>Official records are maintained by the Registrar. To request a correction, visit the Registrar's Office.</p>`;

  function gradesTable(rows) {
    if (!rows.length) return UI.empty({ icon: 'bi-mortarboard', title: 'No academic records yet', text: 'Grades appear here once your teachers post them.' });
    return `<div class="table-wrap"><table class="table"><thead><tr><th>Subject code</th><th>Subject name</th><th class="text-center">Units</th><th class="text-center">Grade</th><th>Remarks</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td class="fw-semibold">${esc(r.subject_code)}</td><td>${esc(r.subject_name)}</td><td class="text-center">${r.units}</td><td class="text-center">${UI.grade(r.grade)}</td><td>${UI.statusPill(r.remarks)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }

  async function dashboard(view) {
    const d = await load(view); if (!d) return;
    const s = d.student, e = d.current_enrollment;
    const current = d.records.filter((r) => r.academic_year === d.current_term.academic_year && r.semester === d.current_term.semester);
    const pct = d.gwa ? Math.max(5, Math.min(100, ((5 - d.gwa) / 4) * 100)) : 0;
    view.innerHTML = `
      <div class="card welcome-card mb-4"><div class="card-body d-flex flex-wrap align-items-center gap-4 position-relative" style="z-index:1">
        ${UI.avatar(s, 'avatar-lg')}
        <div class="flex-grow-1"><p class="small-caps mb-1 mono">${esc(s.student_number)}</p><h2 class="h4 fw-bold mb-1">Hi, ${esc(s.first_name)}!</h2>
          <p class="text-muted mb-2">${esc(s.program || 'No program')} · ${UI.ordinal(s.year_level)}</p>${UI.statusPill(s.enrollment_status)}</div>
        <div class="gwa-ring" style="--p:${pct}%"><div><div><strong>${d.gwa != null ? d.gwa.toFixed(2) : '—'}</strong><span>GWA</span></div></div></div>
      </div></div>
      <div class="row g-3 mb-4">
        ${[['bi-calendar3', 'Academic Year', d.current_term.academic_year], ['bi-collection', 'Semester', d.current_term.semester], ['bi-book', 'Subjects this term', d.subjects_this_term], ['bi-stack', 'Units this term', d.current_units]]
          .map(([i, l, v], k) => `<div class="col-6 col-xl-3"><div class="card stat-card h-100 ${k === 0 ? 'is-navy' : ''}"><div class="stat-icon"><i class="bi ${i}"></i></div><div><div class="stat-label">${l}</div><div class="stat-value" style="font-size:1.35rem">${esc(v)}</div></div></div></div>`).join('')}
      </div>
      <div class="row g-4">
        <div class="col-lg-8"><div class="card h-100"><div class="card-header"><h2>Current term subjects</h2><a class="btn btn-sm btn-soft" href="#/my-grades">All grades</a></div>${gradesTable(current)}</div></div>
        <div class="col-lg-4"><div class="card h-100"><div class="card-header"><h2>Enrollment</h2><a class="btn btn-sm btn-soft" href="#/my-enrollment">History</a></div><div class="card-body">
          ${e ? `<dl class="detail-grid" style="grid-template-columns:1fr 1fr"><div><dt>Status</dt><dd>${UI.statusPill(e.status)}</dd></div><div><dt>Program</dt><dd>${esc(e.program)}</dd></div><div><dt>Year level</dt><dd>${UI.ordinal(e.year_level)}</dd></div><div><dt>Enrolled on</dt><dd>${UI.formatDate(e.enrollment_date)}</dd></div></dl>`
            : UI.empty({ icon: 'bi-journal-x', title: 'Not enrolled this term' })}
          ${readOnlyNote}</div></div></div>
      </div>`;
  }

  async function profile(view) {
    const d = await load(view); if (!d) return;
    const s = d.student;
    const item = (l, v) => `<div><dt>${l}</dt><dd>${esc(v || '—')}</dd></div>`;
    view.innerHTML = `<div class="card"><div class="card-body p-4">
      <div class="d-flex flex-wrap align-items-center gap-3 mb-4">${UI.avatar(s, 'avatar-lg')}<div><h2 class="h4 fw-bold mb-1">${esc(s.full_name)}</h2><div class="mono text-muted">${esc(s.student_number)}</div></div>
        <button class="btn btn-soft ms-auto no-print" onclick="window.print()"><i class="bi bi-printer"></i>Print</button></div>
      <h3 class="section-title"><i class="bi bi-person"></i>Personal information</h3>
      <dl class="detail-grid">${item('First name', s.first_name)}${item('Middle name', s.middle_name)}${item('Last name', s.last_name)}${item('Date of birth', `${UI.formatDate(s.date_of_birth)} (${UI.age(s.date_of_birth)} yrs)`)}${item('Gender', s.gender)}</dl>
      <h3 class="section-title"><i class="bi bi-telephone"></i>Contact</h3>
      <dl class="detail-grid">${item('Email address', s.email)}${item('Contact number', s.contact_number)}${item('Address', s.address)}</dl>
      <h3 class="section-title"><i class="bi bi-shield-check"></i>Guardian</h3>
      <dl class="detail-grid">${item('Guardian name', s.guardian_name)}${item('Guardian contact', s.guardian_contact)}</dl>
      ${readOnlyNote}
    </div></div>`;
  }

  async function enrollment(view) {
    const d = await load(view); if (!d) return;
    view.innerHTML = `<div class="card"><div class="card-header"><h2>Enrollment history</h2><span class="small text-muted">${d.enrollment_history.length} term(s)</span></div>
      ${d.enrollment_history.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Academic year</th><th>Semester</th><th>Program</th><th>Year level</th><th>Enrollment date</th><th>Status</th></tr></thead><tbody>
      ${d.enrollment_history.map((e) => `<tr><td class="fw-semibold">${esc(e.academic_year)}</td><td>${esc(e.semester)}</td><td>${esc(e.program)}</td><td>${UI.ordinal(e.year_level)}</td><td>${UI.formatDate(e.enrollment_date)}</td><td>${UI.statusPill(e.status)}</td></tr>`).join('')}
      </tbody></table></div>` : UI.empty({ icon: 'bi-journal', title: 'No enrollment records' })}
      <div class="card-body pt-0">${readOnlyNote}</div></div>`;
  }

  async function grades(view, { query }) {
    const d = await load(view); if (!d) return;
    const terms = [...new Set(d.records.map((r) => `${r.academic_year}|${r.semester}`))].sort().reverse();
    const sel = query.term && terms.includes(query.term) ? query.term : '';
    const groups = (sel ? [sel] : terms).map((t) => { const [ay, sem] = t.split('|'); return { ay, sem, rows: d.records.filter((r) => r.academic_year === ay && r.semester === sem) }; });
    const termGwa = (rows) => { const g = rows.filter((r) => r.grade != null); const u = g.reduce((a, r) => a + r.units, 0); return u ? (g.reduce((a, r) => a + r.grade * r.units, 0) / u).toFixed(2) : '—'; };
    view.innerHTML = `
      <div class="card mb-4"><div class="toolbar border-0">
        <div><div class="small text-muted">Cumulative GWA</div><div class="fs-4 fw-bold">${d.gwa != null ? d.gwa.toFixed(2) : '—'}</div></div>
        <div class="ms-auto d-flex gap-2 align-items-center">
          <select class="form-select" id="termFilter" aria-label="Filter by term"><option value="">All terms</option>${terms.map((t) => `<option value="${esc(t)}" ${t === sel ? 'selected' : ''}>${esc(t.replace('|', ' · '))}</option>`).join('')}</select>
          <button class="btn btn-soft no-print" onclick="window.print()"><i class="bi bi-printer"></i>Print</button>
        </div></div></div>
      ${groups.length ? groups.map((g) => `<div class="card mb-4"><div class="card-header"><h2>AY ${esc(g.ay)} · ${esc(g.sem)}</h2><span class="small text-muted">Term GWA <strong class="text-body">${termGwa(g.rows)}</strong></span></div>${gradesTable(g.rows)}</div>`).join('')
        : `<div class="card">${UI.empty({ icon: 'bi-mortarboard', title: 'No grades posted yet' })}</div>`}
      ${readOnlyNote}`;
    UI.$('#termFilter').onchange = (e) => Router.go(`#/my-grades${e.target.value ? '?term=' + encodeURIComponent(e.target.value) : ''}`);
  }

  Router.routes['/dashboard'].render.student = dashboard;
  Router.register('/profile', { title: 'My Profile', section: 'My Records', roles: ['student'], render: profile });
  Router.register('/my-enrollment', { title: 'My Enrollment', section: 'My Records', roles: ['student'], render: enrollment });
  Router.register('/my-grades', { title: 'My Grades', section: 'My Records', roles: ['student'], render: grades });
})();
