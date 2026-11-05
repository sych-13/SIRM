/* =========================================================
   MODULE 5c — Grade Encoding (teacher)
   Grade sheet for subjects assigned to the signed-in teacher.
   API: GET /subjects · GET /academic-records · PUT /academic-records/:id/grade
   ========================================================= */
(function () {
  'use strict';
  const { esc, $, $$ } = UI;

  async function render(view, { query }) {
    let meta; let subjects;
    try { [meta, subjects] = await Promise.all([Api.get('/meta'), Api.get('/subjects')]); } catch (err) {
      view.innerHTML = `<div class="card">${UI.errorState(err, 'retryMeta')}</div>`; $('#retryMeta').onclick = () => Router.resolve(); return;
    }
    if (!subjects.length) {
      view.innerHTML = `<div class="card">${UI.empty({ icon: 'bi-easel', title: 'No subjects assigned to you', text: 'The registrar assigns subjects to faculty. Once assigned, your grade sheets appear here.' })}</div>`;
      return;
    }
    const state = {
      subject_id: Number(query.subject) || subjects[0].id,
      academic_year: query.academic_year || meta.current_term.academic_year,
      semester: query.semester || meta.current_term.semester,
    };
    if (!subjects.some((s) => s.id === state.subject_id)) state.subject_id = subjects[0].id;

    view.innerHTML = `<div id="gsRoot">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3">
        <div><h2 class="h4 fw-bold mb-1">Grade sheet</h2><p class="text-muted mb-0">Encode grades for the students in your classes. Changes are saved when you click <strong>Save grades</strong>.</p></div>
        <a class="btn btn-soft" href="#/reports?type=academic-records"><i class="bi bi-printer"></i>Print class report</a>
      </div>
      <div class="card mb-3"><div class="card-body"><div class="filter-grid">
        <div><label class="form-label" for="gSubject">Subject</label><select class="form-select" id="gSubject">${UI.options(subjects.map((s) => [s.id, `${s.code} · ${s.name}`]), state.subject_id)}</select></div>
        <div><label class="form-label" for="gAY">Academic year</label><select class="form-select" id="gAY">${UI.options(meta.academic_years, state.academic_year)}</select></div>
        <div><label class="form-label" for="gSem">Semester</label><select class="form-select" id="gSem">${UI.options(meta.semesters, state.semester)}</select></div>
      </div></div></div>
      <div class="card">
        <div class="card-header"><h2 id="gsTitle">Class list</h2><div class="d-flex align-items-center gap-2"><span class="small text-muted" id="dirtyInfo"></span><button class="btn btn-primary" id="saveAll" disabled><i class="bi bi-check2-all"></i>Save grades</button></div></div>
        <div class="table-wrap"><table class="table" aria-live="polite">
          <thead><tr><th>#</th><th>Student</th><th>Grade</th><th>Remarks</th><th>Last updated</th></tr></thead>
          <tbody id="rows"></tbody>
        </table></div>
        <div class="table-foot"><div id="summary">&nbsp;</div><div class="small text-muted">Scale: 1.00 (highest) – 3.00 (passing) · 5.00 failed</div></div>
      </div></div>`;

    let rows = []; let reqId = 0;
    const dirty = new Map(); // record id → { grade, remarks }

    async function load() {
      const my = ++reqId; dirty.clear(); updateDirty();
      Router.setQuery({ subject: state.subject_id, academic_year: state.academic_year, semester: state.semester });
      const s = subjects.find((x) => x.id === state.subject_id);
      $('#gsTitle').textContent = `${s.code} · ${s.name} (${s.units} units)`;
      $('#rows').innerHTML = UI.skeletonRows(5, 6);
      try {
        const res = await Api.get('/academic-records', { subject_id: state.subject_id, academic_year: state.academic_year, semester: state.semester, sort: 'last_name', per_page: 100 });
        if (my !== reqId) return;
        rows = res.items; draw();
      } catch (err) { if (my === reqId) { $('#rows').innerHTML = `<tr><td colspan="5">${UI.errorState(err, 'retryList')}</td></tr>`; $('#retryList').onclick = load; } }
    }
    function draw() {
      if (!rows.length) {
        $('#rows').innerHTML = `<tr><td colspan="5">${UI.empty({ icon: 'bi-people', title: 'No students in this class for the selected term', text: 'Students appear here once the registrar adds their academic records for this subject.' })}</td></tr>`;
        $('#summary').textContent = '0 students'; return;
      }
      $('#rows').innerHTML = rows.map((r, i) => `<tr data-id="${r.id}">
        <td class="text-muted">${i + 1}</td>
        <td><div class="meta"><strong class="d-block">${esc(r.last_name)}, ${esc(r.first_name)}</strong><span class="mono small text-muted">${esc(r.student_number)}</span></div></td>
        <td><select class="form-select form-select-sm grade-select" data-field="grade" aria-label="Grade for ${esc(r.student_name)}">${UI.gradeOptions(r.grade)}</select></td>
        <td><select class="form-select form-select-sm w-auto" data-field="remarks" aria-label="Remarks for ${esc(r.student_name)}" ${r.grade != null ? 'disabled' : ''}>
          ${r.grade != null ? `<option>${esc(r.remarks)}</option>` : UI.options(['In Progress', 'Incomplete', 'Dropped'], r.remarks)}</select>
          <div class="invalid-feedback d-block small" data-err></div></td>
        <td class="small text-muted">${r.updated_at ? UI.timeAgo(r.updated_at) : '—'}</td></tr>`).join('');
      summarize();
    }
    function summarize() {
      const graded = rows.filter((r) => r.grade != null).length;
      $('#summary').textContent = `${rows.length} student${rows.length === 1 ? '' : 's'} · ${graded} graded · ${rows.length - graded} pending`;
    }
    function updateDirty() {
      $('#saveAll').disabled = dirty.size === 0;
      $('#dirtyInfo').textContent = dirty.size ? `${dirty.size} unsaved change${dirty.size > 1 ? 's' : ''}` : '';
    }

    $('#rows').addEventListener('change', (e) => {
      const sel = e.target.closest('select[data-field]'); if (!sel) return;
      const tr = sel.closest('tr'); const id = Number(tr.dataset.id); const r = rows.find((x) => x.id === id);
      const gSel = tr.querySelector('[data-field="grade"]'); const rSel = tr.querySelector('[data-field="remarks"]');
      const grade = gSel.value === '' ? null : Number(gSel.value);
      if (sel === gSel) {
        rSel.disabled = grade != null;
        rSel.innerHTML = grade != null ? `<option>${grade <= 3 ? 'Passed' : 'Failed'}</option>` : UI.options(['In Progress', 'Incomplete', 'Dropped'], r.grade == null ? r.remarks : 'In Progress');
      }
      const remarks = grade != null ? (grade <= 3 ? 'Passed' : 'Failed') : rSel.value;
      const changed = grade !== (r.grade == null ? null : Number(r.grade)) || remarks !== r.remarks;
      if (changed) dirty.set(id, { grade, remarks }); else dirty.delete(id);
      tr.classList.toggle('is-dirty', changed); tr.classList.remove('is-saved');
      tr.querySelector('[data-err]').textContent = '';
      updateDirty();
    });

    $('#saveAll').addEventListener('click', async () => {
      const btn = $('#saveAll'); UI.setBusy(btn, true, 'Saving…');
      let saved = 0; let failed = 0;
      for (const [id, body] of [...dirty]) {
        const tr = $(`tr[data-id="${id}"]`);
        try {
          const r = await Api.put(`/academic-records/${id}/grade`, body);
          const idx = rows.findIndex((x) => x.id === id); rows[idx] = { ...rows[idx], ...r };
          dirty.delete(id); saved++;
          if (tr) { tr.classList.remove('is-dirty'); tr.classList.add('is-saved'); tr.cells[4].textContent = 'just now'; }
        } catch (err) {
          failed++;
          if (tr) tr.querySelector('[data-err]').textContent = (err.errors && (err.errors.grade || err.errors.remarks)) || err.message;
        }
      }
      UI.setBusy(btn, false); updateDirty(); summarize();
      if (saved) UI.toast(`${saved} grade${saved > 1 ? 's' : ''} saved.`);
      if (failed) UI.toast(`${failed} grade${failed > 1 ? 's' : ''} could not be saved. Check the highlighted rows.`, 'error');
    });

    const confirmDiscard = async () => !dirty.size || UI.confirm({ title: 'Discard unsaved grades?', message: `You have ${dirty.size} unsaved change${dirty.size > 1 ? 's' : ''} on this sheet.`, confirmText: 'Discard' });
    [['#gSubject', 'subject_id'], ['#gAY', 'academic_year'], ['#gSem', 'semester']].forEach(([sel, key]) => $(sel).addEventListener('change', async (e) => {
      if (!(await confirmDiscard())) { e.target.value = state[key]; return; }
      state[key] = key === 'subject_id' ? Number(e.target.value) : e.target.value; load();
    }));
    const beforeUnload = (e) => { if (dirty.size) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);

    await load();
    return () => { window.removeEventListener('beforeunload', beforeUnload); $$('.modal-backdrop').forEach((el) => el.remove()); };
  }

  Router.register('/grades', { title: 'Grade Encoding', section: 'Teaching', roles: ['teacher'], render });
})();
