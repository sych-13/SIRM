/* =========================================================
   MODULE 4 — Enrollment Management (admin)
   API: GET/POST /enrollments · GET/PUT /enrollments/:id
   ========================================================= */
(function () {
  'use strict';
  const { esc, $ } = UI;
  const COLS = 8;

  async function render(view, { query }) {
    let meta;
    try { meta = await Api.get('/meta'); } catch (err) { view.innerHTML = `<div class="card">${UI.errorState(err, 'retryMeta')}</div>`; $('#retryMeta').onclick = () => Router.resolve(); return; }
    const programs = meta.programs.map((p) => [p.code, `${p.code} · ${p.name}`]);
    const state = {
      search: query.search || '', academic_year: query.academic_year ?? meta.current_term.academic_year, semester: query.semester ?? meta.current_term.semester,
      status: query.status || '', program: query.program || '', sort: query.sort || '', dir: query.dir || 'desc', page: Number(query.page) || 1, per_page: 10,
    };

    view.innerHTML = `<div id="enrRoot">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3">
        <div><h2 class="h4 fw-bold mb-1">Enrollment records</h2><p class="text-muted mb-0">Enroll students per term, update their status, and review enrollment history.</p></div>
        <button class="btn btn-primary" id="addEnr"><i class="bi bi-journal-plus"></i>Enroll student</button>
      </div>
      <div class="row g-3 mb-3" id="enrStats"></div>
      <div class="card">
        <div class="toolbar">
          <div class="search input-icon"><i class="bi bi-search"></i><input class="form-control" id="fSearch" placeholder="Search student no. or name…" value="${esc(state.search)}" aria-label="Search enrollments"></div>
          <select class="form-select w-auto" id="fAY" aria-label="Academic year">${UI.options(meta.academic_years, state.academic_year, 'All academic years')}</select>
          <select class="form-select w-auto" id="fSem" aria-label="Semester">${UI.options(meta.semesters, state.semester, 'All semesters')}</select>
          <select class="form-select w-auto" id="fStatus" aria-label="Status">${UI.options(UI.ENROLL_STATUSES, state.status, 'Any status')}</select>
          <select class="form-select w-auto" id="fProgram" aria-label="Program">${UI.options(meta.programs.map((p) => p.code), state.program, 'All programs')}</select>
          <button class="btn btn-light ms-auto" id="fReset"><i class="bi bi-x-circle"></i>Clear</button>
        </div>
        <div class="table-wrap"><table class="table" aria-live="polite">
          <thead><tr><th>Student</th><th>Academic year</th><th>Semester</th><th>Program</th><th>Year</th><th>Enrolled on</th><th>Status</th><th class="text-end">Actions</th></tr></thead>
          <tbody id="rows"></tbody>
        </table></div>
        <div class="table-foot"><div id="summary">&nbsp;</div><nav><ul class="pagination" id="pager"></ul></nav></div>
      </div></div>
      ${formModal(meta, programs)}
      <div class="modal fade" id="histModal" tabindex="-1" aria-label="Enrollment history"><div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
        <div class="modal-header"><h2 class="modal-title">Enrollment history</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
        <div class="modal-body" id="histBody"></div>
        <div class="modal-footer" id="histFoot"></div>
      </div></div></div>`;

    const formEl = $('#enrForm');
    const formM = new bootstrap.Modal($('#enrModal'));
    const histM = new bootstrap.Modal($('#histModal'));
    const picker = UI.studentPicker('enrStudent');
    let reqId = 0; let editing = null;

    async function load() {
      const my = ++reqId;
      Router.setQuery({ ...state, page: state.page > 1 ? state.page : '', per_page: '', dir: state.sort ? state.dir : '' });
      $('#rows').innerHTML = UI.skeletonRows(COLS, 6);
      try {
        const res = await Api.get('/enrollments', state);
        if (my !== reqId) return;
        drawRows(res.items);
        UI.pager($('#pager'), $('#summary'), res.meta, 'enrollment', (p) => { state.page = p; load(); });
      } catch (err) {
        if (my !== reqId) return;
        $('#rows').innerHTML = `<tr><td colspan="${COLS}">${UI.errorState(err, 'retryList')}</td></tr>`; $('#retryList').onclick = load;
      }
    }
    async function loadStats() {
      // Totals per status for the selected term, straight from the API.
      try {
        const base = { academic_year: state.academic_year, semester: state.semester, per_page: 1 };
        const counts = await Promise.all(['Enrolled', 'Pending', 'Dropped', 'Completed'].map((s) => Api.get('/enrollments', { ...base, status: s }).then((r) => r.meta.total)));
        const icons = ['bi-check2-circle', 'bi-hourglass-split', 'bi-x-circle', 'bi-flag'];
        const label = [state.semester, state.academic_year].filter(Boolean).join(', ') || 'All terms';
        $('#enrStats').innerHTML = UI.ENROLL_STATUSES.map((s, i) => `<div class="col-6 col-xl-3"><div class="card stat-card h-100 ${i === 0 ? 'is-navy' : ''}"><div class="stat-icon"><i class="bi ${icons[i]}"></i></div><div><div class="stat-label">${s}</div><div class="stat-value">${counts[i]}</div><div class="stat-sub">${esc(label)}</div></div></div></div>`).join('');
      } catch (_) { $('#enrStats').innerHTML = ''; }
    }

    function drawRows(items) {
      if (!items.length) {
        const filtered = state.search || state.academic_year || state.semester || state.status || state.program;
        $('#rows').innerHTML = `<tr><td colspan="${COLS}">${filtered
          ? UI.empty({ icon: 'bi-search', title: 'No matching enrollments', text: 'Try another term, status or name.', action: '<button class="btn btn-soft" data-act="clear">Clear filters</button>' })
          : UI.empty({ icon: 'bi-journal', title: 'No enrollments yet', text: 'Enroll a student into a term to get started.', action: '<button class="btn btn-primary" data-act="add"><i class="bi bi-journal-plus"></i>Enroll student</button>' })}</td></tr>`;
        return;
      }
      $('#rows').innerHTML = items.map((e) => `<tr>
        <td><div class="meta"><strong class="d-block">${esc(e.last_name)}, ${esc(e.first_name)}</strong><span class="mono small text-muted">${esc(e.student_number)}</span></div></td>
        <td class="fw-semibold">${esc(e.academic_year)}</td><td>${esc(e.semester)}</td><td>${esc(e.program)}</td><td>${UI.ordinal(e.year_level)}</td>
        <td class="small">${UI.formatDate(e.enrollment_date)}</td>
        <td>${UI.statusPill(e.status)}${e.is_current ? ' <span class="pill pill-muted">Current</span>' : ''}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-sm btn-icon btn-soft" data-act="history" data-id="${e.id}" title="Enrollment history" aria-label="History of ${esc(e.student_name)}"><i class="bi bi-clock-history"></i></button>
          <button class="btn btn-sm btn-icon btn-soft" data-act="edit" data-id="${e.id}" title="Update enrollment" aria-label="Update enrollment of ${esc(e.student_name)}"><i class="bi bi-pencil"></i></button>
        </td></tr>`).join('');
    }

    // ---------- filters ----------
    const reload = () => { state.page = 1; load(); loadStats(); };
    $('#fSearch').addEventListener('input', UI.debounce((e) => { state.search = e.target.value.trim(); state.page = 1; load(); }, 300));
    [['#fAY', 'academic_year'], ['#fSem', 'semester'], ['#fStatus', 'status'], ['#fProgram', 'program']].forEach(([sel, key]) => $(sel).addEventListener('change', (e) => { state[key] = e.target.value; reload(); }));
    const clearFilters = () => { Object.assign(state, { search: '', academic_year: '', semester: '', status: '', program: '' }); ['#fSearch', '#fAY', '#fSem', '#fStatus', '#fProgram'].forEach((s) => { $(s).value = ''; }); reload(); };
    $('#fReset').onclick = clearFilters;

    $('#enrRoot').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'clear') clearFilters();
      if (b.dataset.act === 'add') openForm();
      if (b.dataset.act === 'edit') openForm(Number(b.dataset.id));
      if (b.dataset.act === 'history') openHistory(Number(b.dataset.id));
    });
    $('#addEnr').onclick = () => openForm();

    // ---------- create / update ----------
    async function openForm(id, preset = {}) {
      editing = null; formEl.reset(); UI.showFieldErrors(formEl, {}); picker.clear(); picker.disable(false);
      $('#enrModalTitle').textContent = id ? 'Update enrollment' : 'Enroll a student';
      $('#saveEnr').innerHTML = id ? '<i class="bi bi-check2"></i>Save changes' : '<i class="bi bi-journal-plus"></i>Enroll';
      formEl.elements.academic_year.value = meta.current_term.academic_year;
      formEl.elements.semester.value = meta.current_term.semester;
      formEl.elements.enrollment_date.value = new Date().toISOString().slice(0, 10);
      formEl.elements.status.value = 'Enrolled';
      await UI.hideModal($('#histModal'), histM);
      if (id) {
        try {
          editing = await Api.get(`/enrollments/${id}`);
          picker.set({ id: editing.student_id, student_number: editing.student_number, full_name: editing.student_name }); picker.disable(true);
          ['academic_year', 'semester', 'program', 'year_level', 'enrollment_date', 'status'].forEach((f) => { formEl.elements[f].value = editing[f]; });
        } catch (err) { UI.toast(err.message, 'error'); return; }
      } else if (preset.student) {
        picker.set(preset.student);
        if (preset.program) formEl.elements.program.value = preset.program;
        if (preset.year_level) formEl.elements.year_level.value = preset.year_level;
      }
      formM.show();
    }

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(formEl));
      const errs = {};
      if (!editing && !data.student_id) errs.student_id = 'Select a student from the list.';
      ['academic_year', 'semester', 'program', 'year_level', 'enrollment_date', 'status'].forEach((f) => { if (!data[f]) errs[f] = 'This field is required.'; });
      if (data.academic_year && !/^\d{4}-\d{4}$/.test(data.academic_year)) errs.academic_year = 'Use the format YYYY-YYYY.';
      if (Object.keys(errs).length) { UI.showFieldErrors(formEl, errs); return; }
      data.year_level = Number(data.year_level); if (data.student_id) data.student_id = Number(data.student_id);
      const btn = $('#saveEnr'); UI.setBusy(btn, true);
      try {
        const saved = editing ? await Api.put(`/enrollments/${editing.id}`, data) : await Api.post('/enrollments', data);
        formM.hide();
        UI.toast(editing ? 'Enrollment updated.' : `${saved.student_name} is now enrolled for ${saved.semester}, AY ${saved.academic_year}.`);
        load(); loadStats();
      } catch (err) {
        if (err.status === 422) UI.showFieldErrors(formEl, err.errors);
        UI.toast(err.message, 'error');
      } finally { UI.setBusy(btn, false); }
    });

    // ---------- history ----------
    async function openHistory(id) {
      $('#histBody').innerHTML = UI.loader('Loading history…'); $('#histFoot').innerHTML = ''; histM.show();
      try {
        const e = await Api.get(`/enrollments/${id}`);
        $('#histBody').innerHTML = `<div class="d-flex align-items-center gap-3 mb-3"><span class="avatar avatar-lg">${esc(UI.initials(e.first_name, e.last_name))}</span>
          <div><h3 class="h5 fw-bold mb-0">${esc(e.student_name)}</h3><div class="mono text-muted">${esc(e.student_number)}</div></div></div>
          <div class="table-wrap border rounded-3"><table class="table"><thead><tr><th>AY</th><th>Semester</th><th>Program</th><th>Year</th><th>Date</th><th>Status</th></tr></thead><tbody>
          ${e.history.map((h) => `<tr class="${h.id === e.id ? 'table-active' : ''}"><td class="fw-semibold">${esc(h.academic_year)}</td><td>${esc(h.semester)}</td><td>${esc(h.program)}</td><td>${UI.ordinal(h.year_level)}</td><td class="small">${UI.formatDate(h.enrollment_date)}</td><td>${UI.statusPill(h.status)}</td></tr>`).join('')}
          </tbody></table></div>`;
        const last = e.history[0];
        $('#histFoot').innerHTML = `<a class="btn btn-light me-auto" href="#/students?view=${e.student_id}"><i class="bi bi-person-vcard"></i>Student profile</a>
          <button class="btn btn-primary" id="histEnroll"><i class="bi bi-journal-plus"></i>Enroll in another term</button>`;
        $('#histEnroll').onclick = () => openForm(null, { student: { id: e.student_id, student_number: e.student_number, full_name: e.student_name }, program: last.program, year_level: last.year_level });
      } catch (err) { $('#histBody').innerHTML = UI.errorState(err); }
    }

    await Promise.all([load(), loadStats()]);
    if (query.new) openForm();
    return () => UI.disposeModals([formM, histM]);
  }

  function formModal(meta, programs) {
    const years = [...new Set([...meta.academic_years, nextAY(meta.current_term.academic_year)])].sort().reverse();
    const sel = (name, label, opts, col = 'col-md-6') => `<div class="${col}"><label class="form-label" for="e_${name}">${label} <span class="req">*</span></label><select class="form-select" id="e_${name}" name="${name}" required>${opts}</select><div class="invalid-feedback" data-for="${name}"></div></div>`;
    return `<div class="modal fade" id="enrModal" tabindex="-1" aria-labelledby="enrModalTitle"><div class="modal-dialog modal-lg"><div class="modal-content">
      <form id="enrForm" novalidate class="d-contents">
      <div class="modal-header"><h2 class="modal-title" id="enrModalTitle">Enroll a student</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
      <div class="modal-body"><div class="row g-3">
        <div class="col-12">${UI.studentPickerHtml('enrStudent')}</div>
        ${sel('academic_year', 'Academic year', UI.options(years, '', 'Select…'))}
        ${sel('semester', 'Semester', UI.options(meta.semesters, '', 'Select…'))}
        ${sel('program', 'Course / Program', UI.options(programs, '', 'Select…'))}
        ${sel('year_level', 'Year level', UI.options([1, 2, 3, 4, 5].map((y) => [y, UI.ordinal(y)]), '', 'Select…'))}
        <div class="col-md-6"><label class="form-label" for="e_enrollment_date">Enrollment date <span class="req">*</span></label><input class="form-control" type="date" id="e_enrollment_date" name="enrollment_date" required><div class="invalid-feedback" data-for="enrollment_date"></div></div>
        ${sel('status', 'Enrollment status', UI.options(UI.ENROLL_STATUSES))}
      </div></div>
      <div class="modal-footer"><span class="small text-muted me-auto">One enrollment per student per term.</span><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary" id="saveEnr">Enroll</button></div>
      </form></div></div></div>`;
  }
  const nextAY = (ay) => { const y = Number(ay.slice(0, 4)) + 1; return `${y}-${y + 1}`; };

  Router.register('/enrollment', { title: 'Enrollment Management', section: 'Records', roles: ['admin'], render });
})();
