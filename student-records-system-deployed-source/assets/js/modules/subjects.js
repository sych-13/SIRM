/* =========================================================
   MODULE 5a — Subject Catalog (admin)
   API: GET/POST /subjects · PUT/DELETE /subjects/:id · GET /teachers
   ========================================================= */
(function () {
  'use strict';
  const { esc, $ } = UI;
  const COLS = 6;

  async function render(view, { query }) {
    let meta; let teachers; let catalog;
    try { [meta, teachers, catalog] = await Promise.all([Api.get('/meta'), Api.get('/teachers'), Api.get('/subjects')]); } catch (err) {
      view.innerHTML = `<div class="card">${UI.errorState(err, 'retryMeta')}</div>`; $('#retryMeta').onclick = () => Router.resolve(); return;
    }
    const programOpts = [...meta.programs.map((p) => [p.code, `${p.code} · ${p.name}`]), ['GEN', 'GEN · General Education']];
    const templates = window.SIRMS_SUBJECT_TEMPLATES || [];
    let existingCodes = new Set(catalog.map((s) => String(s.code).toUpperCase()));
    const templateOptions = () => templates.filter((t) => !existingCodes.has(t.code)).map((t) => `<option value="${esc(t.code)}">${esc(t.program)} · ${esc(t.code)} · ${esc(t.name)}</option>`).join('');
    const state = { search: query.search || '', program: query.program || '', teacher_id: query.teacher_id || '' };

    view.innerHTML = `<div id="subRoot">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3">
        <div><h2 class="h4 fw-bold mb-1">Subject catalog</h2><p class="text-muted mb-0">Subject codes, units and the faculty assigned to encode grades.</p></div>
        <div class="d-flex flex-wrap gap-2"><button class="btn btn-soft" id="seedSub"><i class="bi bi-database-add"></i>Add starter subjects</button><button class="btn btn-primary" id="addSub"><i class="bi bi-plus-lg"></i>Add subject</button></div>
      </div>
      <div class="card">
        <div class="toolbar">
          <div class="search input-icon"><i class="bi bi-search"></i><input class="form-control" id="fSearch" placeholder="Search code, subject or teacher…" value="${esc(state.search)}" aria-label="Search subjects"></div>
          <select class="form-select w-auto" id="fProgram" aria-label="Program">${UI.options(programOpts.map(([v]) => v), state.program, 'All programs')}</select>
          <select class="form-select w-auto" id="fTeacher" aria-label="Teacher">${UI.options(teachers.map((t) => [t.id, t.name]), state.teacher_id, 'All teachers')}</select>
          <button class="btn btn-light ms-auto" id="fReset"><i class="bi bi-x-circle"></i>Clear</button>
        </div>
        <div class="table-wrap"><table class="table" aria-live="polite">
          <thead><tr><th>Code</th><th>Subject</th><th class="text-center">Units</th><th>Program</th><th>Assigned teacher</th><th class="text-end">Actions</th></tr></thead>
          <tbody id="rows"></tbody>
        </table></div>
        <div class="table-foot"><div id="summary">&nbsp;</div></div>
      </div></div>
      <div class="modal fade" id="subModal" tabindex="-1" aria-labelledby="subModalTitle"><div class="modal-dialog"><div class="modal-content">
        <form id="subForm" novalidate class="d-contents">
        <div class="modal-header"><h2 class="modal-title" id="subModalTitle">Add subject</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
        <div class="modal-body"><div class="row g-3">
          <div class="col-12"><label class="form-label" for="s_template">Starter subject template</label><select class="form-select" id="s_template"><option value="">Custom subject · enter details below</option>${templateOptions()}</select><div class="form-text">Choose a suggestion to fill the fields, or enter a custom subject. Saved subjects are stored in Firestore. Confirm templates against your school curriculum.</div></div>
          <div class="col-md-5"><label class="form-label" for="s_code">Subject code <span class="req">*</span></label><input class="form-control text-uppercase" id="s_code" name="code" maxlength="20" placeholder="IT101" required><div class="invalid-feedback" data-for="code"></div></div>
          <div class="col-md-3"><label class="form-label" for="s_units">Units <span class="req">*</span></label><input class="form-control" id="s_units" name="units" type="number" min="1" max="10" required><div class="invalid-feedback" data-for="units"></div></div>
          <div class="col-md-4"><label class="form-label" for="s_program">Program <span class="req">*</span></label><select class="form-select" id="s_program" name="program" required>${UI.options(programOpts.map(([v]) => v), '', 'Select…')}</select><div class="invalid-feedback" data-for="program"></div></div>
          <div class="col-12"><label class="form-label" for="s_name">Subject name <span class="req">*</span></label><input class="form-control" id="s_name" name="name" maxlength="150" required><div class="invalid-feedback" data-for="name"></div></div>
          <div class="col-12"><label class="form-label" for="s_teacher">Assigned teacher</label><select class="form-select" id="s_teacher" name="teacher_id">${UI.options(teachers.map((t) => [t.id, `${t.name}${t.title ? ' · ' + t.title : ''}`]), '', '— Unassigned —')}</select><div class="form-text">Only the assigned teacher can encode grades for this subject.</div><div class="invalid-feedback" data-for="teacher_id"></div></div>
        </div></div>
        <div class="modal-footer"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary" id="saveSub">Save</button></div>
        </form></div></div></div>`;

    const formEl = $('#subForm'); const formM = new bootstrap.Modal($('#subModal'));
    let rows = []; let editing = null; let reqId = 0;

    function refreshTemplateOptions() {
      const select = $('#s_template'); const selected = select.value;
      select.innerHTML = `<option value="">Custom subject · enter details below</option>${templateOptions()}`;
      if ([...select.options].some((o) => o.value === selected)) select.value = selected;
    }

    async function load() {
      const my = ++reqId;
      Router.setQuery(state);
      $('#rows').innerHTML = UI.skeletonRows(COLS, 6);
      try {
        const [all, filtered] = await Promise.all([Api.get('/subjects'), Api.get('/subjects', state)]);
        if (my !== reqId) return;
        rows = filtered;
        existingCodes = new Set(all.map((s) => String(s.code).toUpperCase()));
        refreshTemplateOptions();
        draw();
      } catch (err) { if (my === reqId) { $('#rows').innerHTML = `<tr><td colspan="${COLS}">${UI.errorState(err, 'retryList')}</td></tr>`; $('#retryList').onclick = load; } }
    }
    function draw() {
      const units = rows.reduce((a, s) => a + s.units, 0);
      $('#summary').textContent = `${rows.length} subject${rows.length === 1 ? '' : 's'} · ${units} units`;
      if (!rows.length) {
        const filtered = state.search || state.program || state.teacher_id;
        $('#rows').innerHTML = `<tr><td colspan="${COLS}">${filtered ? UI.empty({ icon: 'bi-search', title: 'No matching subjects', action: '<button class="btn btn-soft" data-act="clear">Clear filters</button>' })
          : UI.empty({ icon: 'bi-book', title: 'No subjects yet', text: 'Add the subjects offered by your school.', action: '<button class="btn btn-primary" data-act="add"><i class="bi bi-plus-lg"></i>Add subject</button>' })}</td></tr>`;
        return;
      }
      $('#rows').innerHTML = rows.map((s) => `<tr>
        <td class="mono fw-semibold">${esc(s.code)}</td><td>${esc(s.name)}<div class="small text-muted">${s.records_count} academic record${s.records_count === 1 ? '' : 's'}</div></td>
        <td class="text-center">${s.units}</td><td><span class="pill pill-muted">${esc(s.program)}</span></td>
        <td>${s.teacher_name ? esc(s.teacher_name) : '<span class="text-muted">Unassigned</span>'}</td>
        <td class="text-end text-nowrap">
          <a class="btn btn-sm btn-icon btn-soft" href="#/academic-records?subject_id=${s.id}" title="View records" aria-label="Records of ${esc(s.code)}"><i class="bi bi-mortarboard"></i></a>
          <button class="btn btn-sm btn-icon btn-soft" data-act="edit" data-id="${s.id}" title="Edit" aria-label="Edit ${esc(s.code)}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-icon btn-soft text-danger" data-act="delete" data-id="${s.id}" title="Delete" aria-label="Delete ${esc(s.code)}"><i class="bi bi-trash3"></i></button>
        </td></tr>`).join('');
    }

    $('#fSearch').addEventListener('input', UI.debounce((e) => { state.search = e.target.value.trim(); load(); }, 300));
    $('#fProgram').addEventListener('change', (e) => { state.program = e.target.value; load(); });
    $('#fTeacher').addEventListener('change', (e) => { state.teacher_id = e.target.value; load(); });
    const clearFilters = () => { Object.assign(state, { search: '', program: '', teacher_id: '' }); ['#fSearch', '#fProgram', '#fTeacher'].forEach((s) => { $(s).value = ''; }); load(); };
    $('#fReset').onclick = clearFilters;
    $('#addSub').onclick = () => openForm();
    $('#s_template').addEventListener('change', (e) => {
      const template = templates.find((t) => t.code === e.target.value);
      if (!template) return;
      formEl.elements.code.value = template.code;
      formEl.elements.name.value = template.name;
      formEl.elements.units.value = template.units;
      formEl.elements.program.value = template.program;
    });
    $('#seedSub').onclick = async (e) => {
      if (!templates.length) { UI.toast('Starter subject templates are not available.', 'error'); return; }
      const yes = await UI.confirm({ title: 'Add starter subjects?', confirmText: 'Add subjects', message: 'This adds editable starter examples to the Firestore subject catalog. Existing subject codes will be skipped. Review the list against your official curriculum; you can still add custom subjects.' });
      if (!yes) return;
      const btn = e.currentTarget; UI.setBusy(btn, true, 'Adding…');
      try {
        const result = await Api.post('/subjects/starter-catalog', { subjects: templates });
        UI.toast(`${result.added} starter subjects added; ${result.skipped} existing codes skipped.`);
        await load();
      } catch (err) { UI.toast(err.message, 'error'); }
      finally { UI.setBusy(btn, false); }
    };

    $('#subRoot').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const s = rows.find((x) => x.id === Number(b.dataset.id));
      if (b.dataset.act === 'clear') clearFilters();
      if (b.dataset.act === 'add') openForm();
      if (b.dataset.act === 'edit') openForm(s);
      if (b.dataset.act === 'delete') remove(s);
    });

    function openForm(s) {
      editing = s || null; formEl.reset(); UI.showFieldErrors(formEl, {});
      $('#s_template').value = '';
      $('#subModalTitle').textContent = s ? `Edit ${s.code}` : 'Add subject';
      $('#saveSub').innerHTML = s ? '<i class="bi bi-check2"></i>Save changes' : '<i class="bi bi-plus-lg"></i>Add subject';
      if (s) ['code', 'name', 'units', 'program', 'teacher_id'].forEach((f) => { formEl.elements[f].value = s[f] ?? ''; });
      else formEl.elements.units.value = 3;
      formM.show();
    }
    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(formEl));
      const errs = {}; ['code', 'name', 'units', 'program'].forEach((f) => { if (!String(data[f] || '').trim()) errs[f] = 'This field is required.'; });
      if (Object.keys(errs).length) { UI.showFieldErrors(formEl, errs); return; }
      data.code = data.code.trim().toUpperCase(); data.units = Number(data.units); data.teacher_id = data.teacher_id ? Number(data.teacher_id) : null;
      const btn = $('#saveSub'); UI.setBusy(btn, true);
      try {
        if (editing) await Api.put(`/subjects/${editing.id}`, data); else await Api.post('/subjects', data);
        formM.hide(); UI.toast(editing ? `${data.code} updated.` : `${data.code} added to the catalog.`); load();
      } catch (err) { if (err.status === 422) UI.showFieldErrors(formEl, err.errors); UI.toast(err.message, 'error'); } finally { UI.setBusy(btn, false); }
    });

    async function remove(s) {
      if (s.records_count) { UI.toast(`${s.code} has ${s.records_count} academic records and cannot be deleted.`, 'error'); return; }
      const yes = await UI.confirm({ title: 'Delete subject?', danger: true, confirmText: 'Delete', message: `<strong>${esc(s.code)} · ${esc(s.name)}</strong> will be removed from the catalog.` });
      if (!yes) return;
      try { await Api.del(`/subjects/${s.id}`); UI.toast(`${s.code} was deleted.`); load(); } catch (err) { UI.toast(err.message, 'error'); }
    }

    await load();
    if (query.new) openForm();
    return () => UI.disposeModals([formM]);
  }

  Router.register('/subjects', { title: 'Subject Catalog', section: 'Records', roles: ['admin'], render });
})();
