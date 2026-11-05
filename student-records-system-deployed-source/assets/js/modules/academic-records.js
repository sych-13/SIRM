/* =========================================================
   MODULE 5b — Academic Records & Grades (admin)
   API: GET/POST /academic-records · PUT/DELETE /academic-records/:id
   ========================================================= */
(function () {
  'use strict';
  const { esc, $ } = UI;
  const COLS = 8;
  const REMARKS = ['In Progress', 'Passed', 'Failed', 'Incomplete', 'Dropped'];

  async function render(view, { query }) {
    let meta; let subjects;
    try { [meta, subjects] = await Promise.all([Api.get('/meta'), Api.get('/subjects')]); } catch (err) {
      view.innerHTML = `<div class="card">${UI.errorState(err, 'retryMeta')}</div>`; $('#retryMeta').onclick = () => Router.resolve(); return;
    }
    const subjectOpts = subjects.map((s) => [s.id, `${s.code} · ${s.name}`]);
    const state = {
      search: query.search || '', subject_id: query.subject_id || '', academic_year: query.academic_year || '', semester: query.semester || '', remarks: query.remarks || '',
      student_id: query.student_id || '', page: Number(query.page) || 1, per_page: 15,
    };

    view.innerHTML = `<div id="arRoot">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3">
        <div><h2 class="h4 fw-bold mb-1">Academic records</h2><p class="text-muted mb-0">Official subject grades per student and term. Remarks are computed from the grade.</p></div>
        <div class="d-flex gap-2"><a class="btn btn-soft" href="#/subjects"><i class="bi bi-book"></i>Subjects</a><button class="btn btn-primary" id="addRec"><i class="bi bi-plus-lg"></i>Add record</button></div>
      </div>
      <div class="card">
        <div class="toolbar">
          <div class="search input-icon"><i class="bi bi-search"></i><input class="form-control" id="fSearch" placeholder="Student no., name or subject…" value="${esc(state.search)}" aria-label="Search academic records"></div>
          <select class="form-select w-auto" id="fSubject" aria-label="Subject" style="max-width:260px">${UI.options(subjectOpts, state.subject_id, 'All subjects')}</select>
          <select class="form-select w-auto" id="fAY" aria-label="Academic year">${UI.options(meta.academic_years, state.academic_year, 'All academic years')}</select>
          <select class="form-select w-auto" id="fSem" aria-label="Semester">${UI.options(meta.semesters, state.semester, 'All semesters')}</select>
          <select class="form-select w-auto" id="fRemarks" aria-label="Remarks">${UI.options(REMARKS, state.remarks, 'Any remarks')}</select>
          <button class="btn btn-light ms-auto" id="fReset"><i class="bi bi-x-circle"></i>Clear</button>
        </div>
        ${state.student_id ? '<div class="px-3 pb-2"><span class="pill" id="studentChip">Filtered to one student</span> <button class="btn btn-sm btn-link" data-act="allStudents">Show all students</button></div>' : ''}
        <div class="table-wrap"><table class="table" aria-live="polite">
          <thead><tr><th>Student</th><th>Subject</th><th class="text-center">Units</th><th>Term</th><th class="text-center">Grade</th><th>Remarks</th><th>Encoded by</th><th class="text-end">Actions</th></tr></thead>
          <tbody id="rows"></tbody>
        </table></div>
        <div class="table-foot"><div id="summary">&nbsp;</div><nav><ul class="pagination" id="pager"></ul></nav></div>
      </div></div>
      ${formModal(meta, subjectOpts)}`;

    const formEl = $('#arForm'); const formM = new bootstrap.Modal($('#arModal'));
    const picker = UI.studentPicker('arStudent');
    let rows = []; let editing = null; let reqId = 0;

    async function load() {
      const my = ++reqId;
      Router.setQuery({ ...state, page: state.page > 1 ? state.page : '', per_page: '' });
      $('#rows').innerHTML = UI.skeletonRows(COLS, 8);
      try {
        const res = await Api.get('/academic-records', state);
        if (my !== reqId) return;
        rows = res.items; draw();
        UI.pager($('#pager'), $('#summary'), res.meta, 'record', (p) => { state.page = p; load(); });
      } catch (err) { if (my === reqId) { $('#rows').innerHTML = `<tr><td colspan="${COLS}">${UI.errorState(err, 'retryList')}</td></tr>`; $('#retryList').onclick = load; } }
    }
    function draw() {
      if (!rows.length) {
        const filtered = state.search || state.subject_id || state.academic_year || state.semester || state.remarks || state.student_id;
        $('#rows').innerHTML = `<tr><td colspan="${COLS}">${filtered ? UI.empty({ icon: 'bi-search', title: 'No matching records', text: 'Try another subject, term or name.', action: '<button class="btn btn-soft" data-act="clear">Clear filters</button>' })
          : UI.empty({ icon: 'bi-mortarboard', title: 'No academic records yet', text: 'Add a subject record for an enrolled student.', action: '<button class="btn btn-primary" data-act="add"><i class="bi bi-plus-lg"></i>Add record</button>' })}</td></tr>`;
        return;
      }
      if (state.student_id && $('#studentChip')) $('#studentChip').textContent = `${rows[0].student_name} (${rows[0].student_number})`;
      $('#rows').innerHTML = rows.map((r) => `<tr>
        <td><div class="meta"><strong class="d-block">${esc(r.last_name)}, ${esc(r.first_name)}</strong><span class="mono small text-muted">${esc(r.student_number)}</span></div></td>
        <td><span class="fw-semibold">${esc(r.subject_code)}</span><div class="small text-muted">${esc(r.subject_name)}</div></td>
        <td class="text-center">${r.units}</td>
        <td class="small">${esc(r.academic_year)}<br>${esc(r.semester)}</td>
        <td class="text-center">${UI.grade(r.grade)}</td><td>${UI.statusPill(r.remarks)}</td>
        <td class="small text-muted">${esc(r.encoded_by_name || '—')}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-sm btn-icon btn-soft" data-act="edit" data-id="${r.id}" title="Update grade" aria-label="Update ${esc(r.subject_code)} grade of ${esc(r.student_name)}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-icon btn-soft text-danger" data-act="delete" data-id="${r.id}" title="Delete" aria-label="Delete record"><i class="bi bi-trash3"></i></button>
        </td></tr>`).join('');
    }

    const reload = () => { state.page = 1; load(); };
    $('#fSearch').addEventListener('input', UI.debounce((e) => { state.search = e.target.value.trim(); reload(); }, 300));
    [['#fSubject', 'subject_id'], ['#fAY', 'academic_year'], ['#fSem', 'semester'], ['#fRemarks', 'remarks']].forEach(([sel, key]) => $(sel).addEventListener('change', (e) => { state[key] = e.target.value; reload(); }));
    const clearFilters = () => { Object.assign(state, { search: '', subject_id: '', academic_year: '', semester: '', remarks: '', student_id: '' }); ['#fSearch', '#fSubject', '#fAY', '#fSem', '#fRemarks'].forEach((s) => { $(s).value = ''; }); reload(); };
    $('#fReset').onclick = clearFilters;
    $('#addRec').onclick = () => openForm();

    $('#arRoot').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const r = rows.find((x) => x.id === Number(b.dataset.id));
      if (b.dataset.act === 'clear') clearFilters();
      if (b.dataset.act === 'allStudents') { state.student_id = ''; b.parentElement.remove(); reload(); }
      if (b.dataset.act === 'add') openForm();
      if (b.dataset.act === 'edit') openForm(r);
      if (b.dataset.act === 'delete') remove(r);
    });

    // grade ↔ remarks: a numeric grade decides Passed/Failed; Incomplete/Dropped need an empty grade
    const syncRemarks = () => {
      const g = formEl.elements.grade.value; const rem = formEl.elements.remarks;
      if (g !== '') rem.value = Number(g) <= 3 ? 'Passed' : 'Failed';
      else if (['Passed', 'Failed'].includes(rem.value)) rem.value = 'In Progress';
      rem.disabled = g !== '';
    };
    formEl.elements.grade.addEventListener('change', syncRemarks);

    function openForm(r) {
      editing = r || null; formEl.reset(); UI.showFieldErrors(formEl, {}); picker.clear(); picker.disable(!!r);
      $('#arModalTitle').textContent = r ? 'Update academic record' : 'Add academic record';
      $('#saveRec').innerHTML = r ? '<i class="bi bi-check2"></i>Save changes' : '<i class="bi bi-plus-lg"></i>Add record';
      if (r) {
        picker.set({ id: r.student_id, student_number: r.student_number, full_name: r.student_name });
        formEl.elements.subject_id.value = r.subject_id; formEl.elements.academic_year.value = r.academic_year; formEl.elements.semester.value = r.semester;
        formEl.elements.grade.value = r.grade != null ? String(Number(r.grade)) : ''; formEl.elements.remarks.value = r.remarks;
      } else {
        formEl.elements.academic_year.value = state.academic_year || meta.current_term.academic_year;
        formEl.elements.semester.value = state.semester || meta.current_term.semester;
        if (state.subject_id) formEl.elements.subject_id.value = state.subject_id;
      }
      syncRemarks(); formM.show();
    }
    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      formEl.elements.remarks.disabled = false;
      const data = Object.fromEntries(new FormData(formEl)); syncRemarks();
      const errs = {};
      if (!editing && !data.student_id) errs.student_id = 'Select a student from the list.';
      ['subject_id', 'academic_year', 'semester'].forEach((f) => { if (!data[f]) errs[f] = 'This field is required.'; });
      if (Object.keys(errs).length) { UI.showFieldErrors(formEl, errs); return; }
      const body = { student_id: editing ? editing.student_id : Number(data.student_id), subject_id: Number(data.subject_id), academic_year: data.academic_year, semester: data.semester, grade: data.grade === '' ? null : Number(data.grade), remarks: data.remarks };
      const btn = $('#saveRec'); UI.setBusy(btn, true);
      try {
        const saved = editing ? await Api.put(`/academic-records/${editing.id}`, body) : await Api.post('/academic-records', body);
        formM.hide(); UI.toast(editing ? `${saved.subject_code} record of ${saved.student_name} updated.` : `${saved.subject_code} record added for ${saved.student_name}.`); load();
      } catch (err) { if (err.status === 422) UI.showFieldErrors(formEl, err.errors); UI.toast(err.message, 'error'); } finally { UI.setBusy(btn, false); }
    });

    async function remove(r) {
      const yes = await UI.confirm({ title: 'Delete academic record?', danger: true, confirmText: 'Delete record',
        message: `The <strong>${esc(r.subject_code)}</strong> record of <strong>${esc(r.student_name)}</strong> (${esc(r.semester)}, AY ${esc(r.academic_year)}) will be permanently removed.` });
      if (!yes) return;
      try { await Api.del(`/academic-records/${r.id}`); UI.toast('Academic record deleted.'); load(); } catch (err) { UI.toast(err.message, 'error'); }
    }

    await load();
    if (query.new) openForm();
    return () => UI.disposeModals([formM]);
  }

  function formModal(meta, subjectOpts) {
    const sel = (name, label, opts, col = 'col-md-6', req = true) => `<div class="${col}"><label class="form-label" for="r_${name}">${label}${req ? ' <span class="req">*</span>' : ''}</label><select class="form-select" id="r_${name}" name="${name}" ${req ? 'required' : ''}>${opts}</select><div class="invalid-feedback" data-for="${name}"></div></div>`;
    return `<div class="modal fade" id="arModal" tabindex="-1" aria-labelledby="arModalTitle"><div class="modal-dialog modal-lg"><div class="modal-content">
      <form id="arForm" novalidate class="d-contents">
      <div class="modal-header"><h2 class="modal-title" id="arModalTitle">Add academic record</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
      <div class="modal-body"><div class="row g-3">
        <div class="col-12">${UI.studentPickerHtml('arStudent')}</div>
        ${sel('subject_id', 'Subject', UI.options(subjectOpts, '', 'Select…'), 'col-12')}
        ${sel('academic_year', 'Academic year', UI.options(meta.academic_years, '', 'Select…'))}
        ${sel('semester', 'Semester', UI.options(meta.semesters, '', 'Select…'))}
        <div class="col-md-6"><label class="form-label" for="r_grade">Grade</label><select class="form-select" id="r_grade" name="grade">${UI.gradeOptions(null)}</select><div class="form-text">1.00 is the highest; 3.00 is the lowest passing grade.</div><div class="invalid-feedback" data-for="grade"></div></div>
        ${sel('remarks', 'Remarks', UI.options(['In Progress', 'Passed', 'Failed', 'Incomplete', 'Dropped']), 'col-md-6', false)}
      </div><p class="small text-muted mt-3 mb-0"><i class="bi bi-info-circle"></i> The student must have an enrollment for the selected term.</p></div>
      <div class="modal-footer"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary" id="saveRec">Save</button></div>
      </form></div></div></div>`;
  }

  Router.register('/academic-records', { title: 'Academic Records & Grades', section: 'Records', roles: ['admin'], render });
})();
