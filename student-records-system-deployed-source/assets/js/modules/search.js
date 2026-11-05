/* =========================================================
   MODULE 6 — Search & Retrieval (admin, teacher)
   API: GET /search/students?q&academic_year&semester&program&year_level&status
   ========================================================= */
(function () {
  'use strict';
  const { esc, $ } = UI;
  const COLS = 7;

  async function render(view, { query }) {
    let meta;
    try { meta = await Api.get('/meta'); } catch (err) { view.innerHTML = `<div class="card">${UI.errorState(err, 'retryMeta')}</div>`; $('#retryMeta').onclick = () => Router.resolve(); return; }
    const state = { q: query.q || '', academic_year: query.academic_year || '', semester: query.semester || '', program: query.program || '', year_level: query.year_level || '', status: query.status || '', page: Number(query.page) || 1, per_page: 15 };

    view.innerHTML = `<div id="srRoot">
      <div class="card mb-3"><div class="card-body">
        <form id="srForm" role="search" novalidate>
          <div class="d-flex gap-2 flex-wrap mb-3">
            <div class="input-icon flex-grow-1" style="min-width:240px"><i class="bi bi-search"></i><input class="form-control form-control-lg" name="q" value="${esc(state.q)}" placeholder="Student number, first name or last name" aria-label="Search students" autofocus></div>
            <button class="btn btn-primary btn-lg"><i class="bi bi-search"></i>Search</button>
          </div>
          <div class="filter-grid">
            <div><label class="form-label" for="sAY">Academic year</label><select class="form-select" id="sAY" name="academic_year">${UI.options(meta.academic_years, state.academic_year, 'Any year')}</select></div>
            <div><label class="form-label" for="sSem">Semester</label><select class="form-select" id="sSem" name="semester">${UI.options(meta.semesters, state.semester, 'Any semester')}</select></div>
            <div><label class="form-label" for="sProg">Course / Program</label><select class="form-select" id="sProg" name="program">${UI.options(meta.programs.map((p) => [p.code, `${p.code} · ${p.name}`]), state.program, 'Any program')}</select></div>
            <div><label class="form-label" for="sYear">Year level</label><select class="form-select" id="sYear" name="year_level">${UI.options([1, 2, 3, 4, 5].map((y) => [y, UI.ordinal(y)]), state.year_level, 'Any year level')}</select></div>
            <div><label class="form-label" for="sStatus">Enrollment status</label><select class="form-select" id="sStatus" name="status">${UI.options(UI.ENROLL_STATUSES, state.status, 'Any status')}</select></div>
            <div><button type="button" class="btn btn-light w-100" id="srReset"><i class="bi bi-x-circle"></i>Reset</button></div>
          </div>
        </form>
      </div></div>
      <div class="card">
        <div class="card-header"><h2>Results</h2><span class="small text-muted" id="srHint"></span></div>
        <div class="table-wrap"><table class="table" aria-live="polite">
          <thead><tr><th>Student No.</th><th>Name</th><th>Program</th><th>Year</th><th>Term</th><th>Status</th><th class="text-end">Open</th></tr></thead>
          <tbody id="rows"></tbody>
        </table></div>
        <div class="table-foot"><div id="summary">&nbsp;</div><nav><ul class="pagination" id="pager"></ul></nav></div>
      </div></div>`;

    const form = $('#srForm'); let reqId = 0;
    const termFiltered = () => state.academic_year || state.semester || state.program || state.year_level || state.status;

    async function load() {
      const my = ++reqId;
      Router.setQuery({ ...state, page: state.page > 1 ? state.page : '', per_page: '' });
      $('#srHint').textContent = termFiltered() ? 'One row per matching enrollment' : 'Latest enrollment shown for each student';
      $('#rows').innerHTML = UI.skeletonRows(COLS, 6);
      try {
        const res = await Api.get('/search/students', state);
        if (my !== reqId) return;
        draw(res.items);
        UI.pager($('#pager'), $('#summary'), res.meta, 'result', (p) => { state.page = p; load(); });
      } catch (err) { if (my === reqId) { $('#rows').innerHTML = `<tr><td colspan="${COLS}">${UI.errorState(err, 'retryList')}</td></tr>`; $('#retryList').onclick = load; } }
    }
    const mark = (text) => {
      const safe = esc(text); const t = state.q.trim(); if (!t) return safe;
      const i = String(text).toLowerCase().indexOf(t.toLowerCase());
      return i < 0 ? safe : esc(String(text).slice(0, i)) + `<mark>${esc(String(text).slice(i, i + t.length))}</mark>` + esc(String(text).slice(i + t.length));
    };
    function draw(items) {
      if (!items.length) {
        $('#rows').innerHTML = `<tr><td colspan="${COLS}">${UI.empty({ icon: 'bi-search', title: 'No students found', text: 'Check the spelling or remove some filters.' })}</td></tr>`; return;
      }
      $('#rows').innerHTML = items.map((s) => `<tr>
        <td class="mono fw-semibold">${mark(s.student_number)}</td>
        <td><div class="person">${UI.avatar(s, 'avatar-sm')}<div class="meta"><strong>${mark(s.last_name)}, ${mark(s.first_name)}${s.middle_name ? ' ' + esc(s.middle_name[0]) + '.' : ''}</strong><span>${esc(s.email)}</span></div></div></td>
        <td>${esc(s.program || '—')}</td><td>${s.year_level ? UI.ordinal(s.year_level) : '—'}</td>
        <td class="small">${s.academic_year ? `${esc(s.academic_year)}<br>${esc(s.semester)}` : '—'}</td>
        <td>${UI.statusPill(s.status)}</td>
        <td class="text-end"><a class="btn btn-sm btn-soft" href="#/students?view=${s.student_id}"><i class="bi bi-person-vcard"></i>Profile</a></td></tr>`).join('');
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      Object.assign(state, { q: d.q.trim(), academic_year: d.academic_year, semester: d.semester, program: d.program, year_level: d.year_level, status: d.status, page: 1 });
      load();
    });
    form.querySelectorAll('select').forEach((s) => s.addEventListener('change', () => form.requestSubmit()));
    $('#srReset').onclick = () => { form.reset(); form.querySelectorAll('select').forEach((s) => { s.value = ''; }); form.elements.q.value = ''; form.requestSubmit(); };

    await load();
  }

  Router.register('/search', { title: 'Search & Retrieval', section: 'Records', roles: ['admin', 'teacher'], render });
})();
