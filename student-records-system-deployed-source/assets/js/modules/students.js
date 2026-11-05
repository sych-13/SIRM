/* =========================================================
   MODULE 3 — Student Information Management
   Admin: full CRUD · Teacher: read-only directory
   API: GET/POST /students · GET/PUT/DELETE /students/:id
   ========================================================= */
(function () {
  'use strict';
  const { esc, $, $$ } = UI;
  const COLS = 7;

  async function render(view, { query, user }) {
    const canEdit = user.role === 'admin';
    const state = {
      search: query.search || '', program: query.program || '', year_level: query.year_level || '', gender: query.gender || '', status: query.status || '',
      sort: query.sort || 'last_name', dir: query.dir || 'asc', page: Number(query.page) || 1, per_page: Number(query.per_page) || 10,
    };
    let meta = null;
    try { meta = await Api.get('/meta'); } catch (_) { meta = { programs: [] }; }

    view.innerHTML = `<div id="stuRoot">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3">
        <div><h2 class="h4 fw-bold mb-1">Student directory</h2><p class="text-muted mb-0">${canEdit ? 'Add, view, update and remove student profiles.' : 'View student information. Records are maintained by the Registrar.'}</p></div>
        ${canEdit ? '<button class="btn btn-primary" id="addStudent"><i class="bi bi-person-plus"></i>Add student</button>' : ''}
      </div>
      <div class="card">
        <div class="toolbar">
          <div class="search input-icon"><i class="bi bi-search"></i><input class="form-control" id="fSearch" placeholder="Search by student no., first or last name…" value="${esc(state.search)}" aria-label="Search students"></div>
          <select class="form-select w-auto" id="fProgram" aria-label="Program"><option value="">All programs</option>${meta.programs.map((p) => `<option value="${p.code}">${p.code}</option>`).join('')}</select>
          <select class="form-select w-auto" id="fYear" aria-label="Year level"><option value="">All year levels</option>${[1, 2, 3, 4].map((y) => `<option value="${y}">${UI.ordinal(y)}</option>`).join('')}</select>
          <select class="form-select w-auto" id="fStatus" aria-label="Enrollment status"><option value="">Any status</option>${['Enrolled', 'Pending', 'Dropped', 'Not Enrolled'].map((s) => `<option>${s}</option>`).join('')}</select>
          <select class="form-select w-auto" id="fGender" aria-label="Gender"><option value="">Any gender</option><option>Male</option><option>Female</option><option>Other</option></select>
          <button class="btn btn-light ms-auto" id="fReset"><i class="bi bi-x-circle"></i>Clear</button>
        </div>
        <div class="table-wrap"><table class="table" aria-live="polite">
          <thead><tr>
            <th class="sortable" data-sort="student_number">Student No. <i class="bi"></i></th>
            <th class="sortable" data-sort="last_name">Name <i class="bi"></i></th>
            <th class="sortable" data-sort="program">Program <i class="bi"></i></th>
            <th class="sortable" data-sort="year_level">Year <i class="bi"></i></th>
            <th>Contact</th><th>Status</th><th class="text-end">Actions</th>
          </tr></thead>
          <tbody id="rows"></tbody>
        </table></div>
        <div class="table-foot">
          <div id="summary">&nbsp;</div>
          <div class="d-flex align-items-center gap-3">
            <select class="form-select form-select-sm w-auto" id="perPage" aria-label="Rows per page">${[10, 25, 50].map((n) => `<option value="${n}">${n} / page</option>`).join('')}</select>
            <nav><ul class="pagination" id="pager"></ul></nav>
          </div>
        </div>
      </div></div>
      ${formModal(canEdit)}${detailModal()}`;

    $('#fProgram').value = state.program; $('#fYear').value = state.year_level; $('#fStatus').value = state.status; $('#fGender').value = state.gender; $('#perPage').value = String(state.per_page);

    const formEl = $('#studentForm');
    const formM = canEdit ? new bootstrap.Modal($('#studentModal')) : null;
    const detailM = new bootstrap.Modal($('#detailModal'));
    let reqId = 0;

    // ---------- list ----------
    async function load() {
      const my = ++reqId;
      const { per_page, page, ...rest } = state;
      Router.setQuery({ ...rest, page: page > 1 ? page : '', per_page: per_page !== 10 ? per_page : '' });
      $$('th.sortable').forEach((th) => { const i = th.querySelector('i'); i.className = 'bi ' + (th.dataset.sort === state.sort ? (state.dir === 'asc' ? 'bi-caret-up-fill' : 'bi-caret-down-fill') : ''); });
      $('#rows').innerHTML = UI.skeletonRows(COLS, Math.min(state.per_page, 8));
      try {
        const res = await Api.get('/students', state);
        if (my !== reqId) return;
        state.page = res.meta.page;
        drawRows(res.items); drawPager(res.meta);
      } catch (err) {
        if (my !== reqId) return;
        $('#rows').innerHTML = `<tr><td colspan="${COLS}">${UI.errorState(err, 'retryList')}</td></tr>`;
        $('#retryList').onclick = load;
      }
    }

    function drawRows(items) {
      const filtered = state.search || state.program || state.year_level || state.gender || state.status;
      if (!items.length) {
        $('#rows').innerHTML = `<tr><td colspan="${COLS}">${filtered
          ? UI.empty({ icon: 'bi-search', title: 'No matching students', text: 'Try a different name, student number or filter.', action: '<button class="btn btn-soft" data-act="clear">Clear filters</button>' })
          : UI.empty({ icon: 'bi-people', title: 'No students yet', text: 'Student profiles you add will be listed here.', action: canEdit ? '<button class="btn btn-primary" data-act="add"><i class="bi bi-person-plus"></i>Add the first student</button>' : '' })}</td></tr>`;
        $('#summary').textContent = '0 students'; return;
      }
      $('#rows').innerHTML = items.map((s) => `<tr>
        <td class="mono fw-semibold">${esc(s.student_number)}</td>
        <td><div class="person">${UI.avatar(s)}<div class="meta"><strong>${esc(s.last_name)}, ${esc(s.first_name)} ${s.middle_name ? esc(s.middle_name[0]) + '.' : ''}</strong><span>${esc(s.email)}</span></div></div></td>
        <td>${esc(s.program || '—')}</td>
        <td>${s.year_level ? UI.ordinal(s.year_level) : '—'}</td>
        <td class="small">${esc(s.contact_number)}</td>
        <td>${UI.statusPill(s.enrollment_status)}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-sm btn-icon btn-soft" data-act="view" data-id="${s.id}" title="View details" aria-label="View ${esc(s.full_name)}"><i class="bi bi-eye"></i></button>
          ${canEdit ? `<button class="btn btn-sm btn-icon btn-soft" data-act="edit" data-id="${s.id}" title="Edit" aria-label="Edit ${esc(s.full_name)}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-icon btn-soft text-danger" data-act="delete" data-id="${s.id}" data-name="${esc(s.full_name)}" data-num="${esc(s.student_number)}" title="Delete" aria-label="Delete ${esc(s.full_name)}"><i class="bi bi-trash3"></i></button>` : ''}
        </td></tr>`).join('');
    }

    function drawPager(m) {
      const from = m.total ? (m.page - 1) * m.per_page + 1 : 0;
      $('#summary').textContent = `Showing ${from}–${Math.min(m.page * m.per_page, m.total)} of ${m.total} student${m.total === 1 ? '' : 's'}`;
      const pages = []; for (let p = Math.max(1, m.page - 2); p <= Math.min(m.pages, m.page + 2); p++) pages.push(p);
      const li = (p, label, dis, act) => `<li class="page-item ${dis ? 'disabled' : ''} ${act ? 'active' : ''}"><button class="page-link" data-page="${p}" ${dis ? 'disabled' : ''}>${label}</button></li>`;
      $('#pager').innerHTML = li(m.page - 1, '<i class="bi bi-chevron-left"></i>', m.page <= 1) + pages.map((p) => li(p, p, false, p === m.page)).join('') + li(m.page + 1, '<i class="bi bi-chevron-right"></i>', m.page >= m.pages);
    }

    // ---------- filters ----------
    const reload = () => { state.page = 1; load(); };
    $('#fSearch').addEventListener('input', UI.debounce((e) => { state.search = e.target.value.trim(); reload(); }, 300));
    [['#fProgram', 'program'], ['#fYear', 'year_level'], ['#fStatus', 'status'], ['#fGender', 'gender']].forEach(([sel, key]) => $(sel).addEventListener('change', (e) => { state[key] = e.target.value; reload(); }));
    $('#perPage').addEventListener('change', (e) => { state.per_page = Number(e.target.value); reload(); });
    const clearFilters = () => { Object.assign(state, { search: '', program: '', year_level: '', gender: '', status: '' }); ['#fSearch', '#fProgram', '#fYear', '#fStatus', '#fGender'].forEach((s) => { $(s).value = ''; }); reload(); };
    $('#fReset').onclick = clearFilters;
    $$('th.sortable').forEach((th) => th.addEventListener('click', () => {
      state.dir = state.sort === th.dataset.sort && state.dir === 'asc' ? 'desc' : 'asc'; state.sort = th.dataset.sort; load();
    }));
    $('#pager').addEventListener('click', (e) => { const b = e.target.closest('[data-page]'); if (b && !b.disabled) { state.page = Number(b.dataset.page); load(); } });

    // ---------- row actions ----------
    const root = $('#stuRoot');
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const id = Number(b.dataset.id);
      if (b.dataset.act === 'clear') clearFilters();
      if (b.dataset.act === 'add') openForm();
      if (b.dataset.act === 'view') openDetail(id);
      if (b.dataset.act === 'edit' && canEdit) openForm(id);
      if (b.dataset.act === 'delete' && canEdit) removeStudent(id, b.dataset.name, b.dataset.num);
    });
    // Waits for the detail modal to finish closing so two modals never overlap.
    const closeDetail = () => new Promise((resolve) => {
      const el = $('#detailModal');
      if (!el.classList.contains('show')) return resolve();
      el.addEventListener('hidden.bs.modal', () => resolve(), { once: true });
      detailM.hide();
    });
    if (canEdit) $('#addStudent').onclick = () => openForm();

    // ---------- create / update ----------
    let editingId = null;
    async function openForm(id) {
      editingId = id || null;
      formEl.reset(); UI.showFieldErrors(formEl, {}); setPhoto(null);
      $('#studentModalTitle').textContent = id ? 'Edit student information' : 'Add new student';
      $('#saveStudent').innerHTML = id ? '<i class="bi bi-check2"></i>Save changes' : '<i class="bi bi-person-plus"></i>Add student';
      if (id) {
        await closeDetail();
        try {
          const s = await Api.get(`/students/${id}`);
          ['student_number', 'first_name', 'middle_name', 'last_name', 'date_of_birth', 'gender', 'address', 'contact_number', 'email', 'guardian_name', 'guardian_contact'].forEach((f) => { formEl.elements[f].value = s[f] || ''; });
          setPhoto(s.profile_picture);
        } catch (err) { UI.toast(err.message, 'error'); return; }
      }
      formM.show();
    }

    let photoData = null;
    function setPhoto(data) {
      photoData = data || null;
      $('#photoPreview').innerHTML = photoData ? `<img class="avatar avatar-lg" src="${esc(photoData)}" alt="Profile preview">` : '<span class="avatar avatar-lg"><i class="bi bi-person"></i></span>';
      $('#removePhoto').classList.toggle('d-none', !photoData);
    }
    if (canEdit) {
    $('#photoInput').addEventListener('change', (e) => {
      const file = e.target.files[0]; if (!file) return;
      if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { UI.toast('Please choose a PNG, JPG or WEBP image.', 'error'); e.target.value = ''; return; }
      if (file.size > 2 * 1024 * 1024) { UI.toast('Image must be 2 MB or smaller.', 'error'); e.target.value = ''; return; }
      const img = new Image();
      img.onload = () => { // downscale to a 256px square before upload
        const c = document.createElement('canvas'); c.width = c.height = 256; const side = Math.min(img.width, img.height);
        c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
        setPhoto(c.toDataURL('image/jpeg', 0.85)); URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
    });
    $('#removePhoto').onclick = () => { setPhoto(null); $('#photoInput').value = ''; };

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(formEl));
      delete data.photo; data.profile_picture = photoData;
      // client-side checks for fast feedback; the server re-validates everything
      const errs = {};
      ['student_number', 'first_name', 'last_name', 'date_of_birth', 'gender', 'address', 'contact_number', 'email', 'guardian_name', 'guardian_contact'].forEach((f) => { if (!String(data[f] || '').trim()) errs[f] = 'This field is required.'; });
      if (data.email && !formEl.elements.email.checkValidity()) errs.email = 'Enter a valid email address.';
      if (Object.keys(errs).length) { UI.showFieldErrors(formEl, errs); return; }

      const btn = $('#saveStudent'); UI.setBusy(btn, true);
      try {
        if (editingId) await Api.put(`/students/${editingId}`, data); else await Api.post('/students', data);
        formM.hide();
        UI.toast(editingId ? 'Student information updated.' : `${data.first_name} ${data.last_name} was added to the directory.`);
        if (!editingId) { state.sort = 'created_at'; state.dir = 'desc'; state.page = 1; }
        load();
      } catch (err) {
        if (err.status === 422) UI.showFieldErrors(formEl, err.errors);
        UI.toast(err.message, 'error');
      } finally { UI.setBusy(btn, false); }
    });
    } // end canEdit

    // ---------- detail ----------
    async function openDetail(id) {
      const body = $('#detailBody');
      body.innerHTML = UI.loader('Loading profile…'); $('#detailActions').innerHTML = '';
      detailM.show();
      try {
        const s = await Api.get(`/students/${id}`);
        const item = (l, v) => `<div><dt>${l}</dt><dd>${esc(v || '—')}</dd></div>`;
        body.innerHTML = `
          <div class="d-flex flex-wrap align-items-center gap-3 mb-4">${UI.avatar(s, 'avatar-lg')}
            <div><h3 class="h4 fw-bold mb-1">${esc(s.full_name)}</h3><div class="mono text-muted mb-2">${esc(s.student_number)}</div>
            <div class="d-flex gap-2 flex-wrap">${UI.statusPill(s.enrollment_status)}<span class="pill">${esc(s.program || 'No program')}</span>${s.year_level ? `<span class="pill pill-muted">${UI.ordinal(s.year_level)}</span>` : ''}</div></div>
            <div class="ms-auto text-end"><div class="small text-muted">GWA</div><div class="fs-3 fw-bold">${s.gwa != null ? s.gwa.toFixed(2) : '—'}</div></div></div>
          <ul class="nav nav-pills gap-1 mb-3" role="tablist">
            <li class="nav-item"><button class="nav-link active" data-bs-toggle="pill" data-bs-target="#tProfile" type="button">Profile</button></li>
            <li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#tEnroll" type="button">Enrollment history <span class="badge text-bg-light">${s.enrollments.length}</span></button></li>
            <li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#tRecords" type="button">Academic records <span class="badge text-bg-light">${s.records.length}</span></button></li>
          </ul>
          <div class="tab-content">
            <div class="tab-pane fade show active" id="tProfile">
              <h4 class="section-title">Personal</h4><dl class="detail-grid">${item('First name', s.first_name)}${item('Middle name', s.middle_name)}${item('Last name', s.last_name)}${item('Date of birth', `${UI.formatDate(s.date_of_birth)} (${UI.age(s.date_of_birth)} yrs)`)}${item('Gender', s.gender)}</dl>
              <h4 class="section-title">Contact</h4><dl class="detail-grid">${item('Email address', s.email)}${item('Contact number', s.contact_number)}${item('Address', s.address)}</dl>
              <h4 class="section-title">Guardian</h4><dl class="detail-grid">${item('Guardian name', s.guardian_name)}${item('Guardian contact', s.guardian_contact)}</dl>
              <p class="small text-muted mt-4 mb-0">Record ID #${s.id} · Created ${UI.formatDate(s.created_at)} · Last updated ${UI.timeAgo(s.updated_at)}</p>
            </div>
            <div class="tab-pane fade" id="tEnroll">${s.enrollments.length ? `<div class="table-wrap border rounded-3"><table class="table"><thead><tr><th>AY</th><th>Semester</th><th>Program</th><th>Year</th><th>Date</th><th>Status</th></tr></thead><tbody>
              ${s.enrollments.map((e) => `<tr><td class="fw-semibold">${esc(e.academic_year)}</td><td>${esc(e.semester)}</td><td>${esc(e.program)}</td><td>${UI.ordinal(e.year_level)}</td><td class="small">${UI.formatDate(e.enrollment_date)}</td><td>${UI.statusPill(e.status)}</td></tr>`).join('')}</tbody></table></div>`
              : UI.empty({ icon: 'bi-journal', title: 'No enrollment records yet' })}</div>
            <div class="tab-pane fade" id="tRecords">${s.records.length ? `<div class="table-wrap border rounded-3"><table class="table"><thead><tr><th>Code</th><th>Subject</th><th>Units</th><th>Term</th><th>Grade</th><th>Remarks</th></tr></thead><tbody>
              ${s.records.map((r) => `<tr><td class="fw-semibold">${esc(r.subject_code)}</td><td>${esc(r.subject_name)}</td><td>${r.units}</td><td class="small">${esc(r.academic_year)}<br>${esc(r.semester)}</td><td>${UI.grade(r.grade)}</td><td>${UI.statusPill(r.remarks)}</td></tr>`).join('')}</tbody></table></div>`
              : UI.empty({ icon: 'bi-mortarboard', title: 'No academic records yet' })}</div>
          </div>`;
        const gradeReport = `#/reports?type=grades&student_id=${s.id}&student_number=${encodeURIComponent(s.student_number)}&student_name=${encodeURIComponent(s.full_name)}`;
        $('#detailActions').innerHTML = `<a class="btn btn-light me-auto" href="${gradeReport}"><i class="bi bi-file-earmark-person"></i>Grade report</a>` + (canEdit
          ? `<a class="btn btn-soft" href="#/enrollment?search=${encodeURIComponent(s.student_number)}&academic_year=&semester="><i class="bi bi-journal-check"></i>Enrollments</a><a class="btn btn-soft" href="#/academic-records?student_id=${s.id}"><i class="bi bi-mortarboard"></i>Records</a>` : '') + (canEdit
          ? `<button class="btn btn-outline-danger" data-act="delete" data-id="${s.id}" data-name="${esc(s.full_name)}" data-num="${esc(s.student_number)}"><i class="bi bi-trash3"></i>Delete</button><button class="btn btn-primary" data-act="edit" data-id="${s.id}"><i class="bi bi-pencil"></i>Edit</button>` : '');
      } catch (err) { body.innerHTML = UI.errorState(err); }
    }
    $('#detailActions').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'edit') openForm(Number(b.dataset.id));
      if (b.dataset.act === 'delete') removeStudent(Number(b.dataset.id), b.dataset.name, b.dataset.num);
    });

    // ---------- delete ----------
    async function removeStudent(id, name, num) {
      await closeDetail();
      const yes = await UI.confirm({ title: 'Delete student record?', danger: true, confirmText: 'Delete permanently',
        message: `<strong>${esc(name)}</strong> (${esc(num)}) and their enrollment and academic records will be permanently removed. This cannot be undone.` });
      if (!yes) return;
      try { await Api.del(`/students/${id}`); UI.toast(`${name} was deleted.`); load(); } catch (err) { UI.toast(err.message, 'error'); }
    }

    // deep links: #/students?new=1 · #/students?view=ID
    await load();
    if (query.new && canEdit) openForm();
    if (query.view) openDetail(Number(query.view));

    return () => { // cleanup on route change
      [formM, detailM].forEach((m) => { if (m) { m.hide(); m.dispose(); } });
      $$('.modal-backdrop').forEach((el) => el.remove());
      document.body.classList.remove('modal-open'); document.body.style.removeProperty('overflow'); document.body.style.removeProperty('padding-right');
    };
  }

  // ---------- templates ----------
  function field(name, label, { type = 'text', req = true, col = 'col-md-6', attrs = '', placeholder = '' } = {}) {
    return `<div class="${col}"><label class="form-label" for="f_${name}">${label}${req ? ' <span class="req">*</span>' : ''}</label>
      <input class="form-control" id="f_${name}" name="${name}" type="${type}" ${req ? 'required' : ''} placeholder="${placeholder}" ${attrs}>
      <div class="invalid-feedback" data-for="${name}"></div></div>`;
  }
  function formModal(canEdit) {
    if (!canEdit) return '';
    return `<div class="modal fade" id="studentModal" tabindex="-1" aria-labelledby="studentModalTitle"><div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
      <form id="studentForm" novalidate class="d-contents">
      <div class="modal-header"><h2 class="modal-title" id="studentModalTitle">Add new student</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
      <div class="modal-body">
        <div class="photo-drop mb-4"><div id="photoPreview"></div><div><div class="fw-semibold">Profile picture <span class="text-muted fw-normal">(optional)</span></div><div class="small text-muted mb-2">PNG, JPG or WEBP up to 2 MB.</div>
          <label class="btn btn-sm btn-soft mb-0"><i class="bi bi-upload"></i>Upload photo<input type="file" id="photoInput" name="photo" accept="image/png,image/jpeg,image/webp" hidden></label>
          <button type="button" class="btn btn-sm btn-link text-danger d-none" id="removePhoto">Remove</button></div></div>
        <h3 class="section-title">Student information</h3>
        <div class="row g-3">
          ${field('student_number', 'Student number', { placeholder: '2025-01234', attrs: 'pattern="\\d{4}-\\d{5}" maxlength="10"' })}
          <div class="col-md-6"><label class="form-label" for="f_gender">Gender <span class="req">*</span></label><select class="form-select" id="f_gender" name="gender" required><option value="">Select…</option><option>Male</option><option>Female</option><option>Other</option></select><div class="invalid-feedback" data-for="gender"></div></div>
          ${field('first_name', 'First name', { col: 'col-md-4', attrs: 'maxlength="80"' })}
          ${field('middle_name', 'Middle name', { col: 'col-md-4', req: false, attrs: 'maxlength="80"' })}
          ${field('last_name', 'Last name', { col: 'col-md-4', attrs: 'maxlength="80"' })}
          ${field('date_of_birth', 'Date of birth', { type: 'date', attrs: `max="${new Date().toISOString().slice(0, 10)}"` })}
          ${field('contact_number', 'Contact number', { type: 'tel', placeholder: '09XXXXXXXXX' })}
          ${field('email', 'Email address', { type: 'email', col: 'col-12', placeholder: 'name@student.sirms.edu' })}
          ${field('address', 'Address', { col: 'col-12', placeholder: 'House no., street, city' })}
        </div>
        <h3 class="section-title">Guardian</h3>
        <div class="row g-3">
          ${field('guardian_name', 'Guardian name', { attrs: 'maxlength="80"' })}
          ${field('guardian_contact', 'Guardian contact number', { type: 'tel', placeholder: '09XXXXXXXXX' })}
        </div>
      </div>
      <div class="modal-footer"><span class="small text-muted me-auto"><span class="req text-danger">*</span> Required</span><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary" id="saveStudent">Save</button></div>
      </form>
    </div></div></div>`;
  }
  function detailModal() {
    return `<div class="modal fade" id="detailModal" tabindex="-1" aria-label="Student details"><div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content">
      <div class="modal-header"><h2 class="modal-title">Student profile</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
      <div class="modal-body" id="detailBody"></div>
      <div class="modal-footer gap-2" id="detailActions"></div>
    </div></div></div>`;
  }

  Router.register('/students', { title: 'Student Management', section: 'Records', roles: ['admin', 'teacher'], render });
})();
