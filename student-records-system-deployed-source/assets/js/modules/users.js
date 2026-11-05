/* =========================================================
   MODULE 8a — User Management (admin)
   API: GET/POST /users · GET/PUT /users/:id · PUT /users/:id/status
        POST /users/:id/reset-password
   ========================================================= */
(function () {
  'use strict';
  const { esc, $ } = UI;
  const COLS = 6;
  const PW_HINT = 'At least 8 characters with upper and lower case letters and a number.';

  function genPassword() {
    const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%&*?'];
    const rnd = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
    const chars = sets.map((s) => s[rnd(s.length)]);
    const all = sets.join(''); while (chars.length < 12) chars.push(all[rnd(all.length)]);
    for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
    return chars.join('');
  }

  async function render(view, { query, user: me }) {
    const state = { search: query.search || '', role: query.role || '', status: query.status || '', page: Number(query.page) || 1, per_page: 10 };

    view.innerHTML = `<div id="usrRoot">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3">
        <div><h2 class="h4 fw-bold mb-1">User accounts</h2><p class="text-muted mb-0">Create Firebase accounts, assign roles, and control who can sign in.</p></div>
        <button class="btn btn-primary" id="addUser"><i class="bi bi-person-plus"></i>Create account</button>
      </div>
      <div class="card">
        <div class="toolbar">
          <div class="search input-icon"><i class="bi bi-search"></i><input class="form-control" id="fSearch" placeholder="Search name, email or username…" value="${esc(state.search)}" aria-label="Search users"></div>
          <select class="form-select w-auto" id="fRole" aria-label="Role">${UI.options(Object.entries(UI.ROLE_LABEL), state.role, 'All roles')}</select>
          <select class="form-select w-auto" id="fStatus" aria-label="Status">${UI.options([['active', 'Active'], ['inactive', 'Inactive']], state.status, 'Any status')}</select>
          <button class="btn btn-light ms-auto" id="fReset"><i class="bi bi-x-circle"></i>Clear</button>
        </div>
        <div class="table-wrap"><table class="table" aria-live="polite">
          <thead><tr><th>User</th><th>Username</th><th>Role</th><th>Status</th><th>Last sign-in</th><th class="text-end">Actions</th></tr></thead>
          <tbody id="rows"></tbody>
        </table></div>
        <div class="table-foot"><div id="summary">&nbsp;</div><nav><ul class="pagination" id="pager"></ul></nav></div>
      </div></div>
      ${userModal()}`;

    const formEl = $('#userForm'); const formM = new bootstrap.Modal($('#userModal'));
    const formModalEl = $('#userModal');
    let formModalReady = false;
    formModalEl.addEventListener('shown.bs.modal', () => { formModalReady = true; $('#saveUser').disabled = false; });
    formModalEl.addEventListener('hide.bs.modal', () => { formModalReady = false; });
    const picker = UI.studentPicker('uStudent', {
      onSelect: (s) => { // prefill from the student record when creating a student account
        if (!s || editing || !s.email) return;
        if (!formEl.elements.name.value) formEl.elements.name.value = s.full_name;
        if (!formEl.elements.email.value) formEl.elements.email.value = s.email;
        if (!formEl.elements.username.value) formEl.elements.username.value = s.student_number;
      },
    });
    let rows = []; let editing = null; let reqId = 0;

    async function load() {
      const my = ++reqId;
      Router.setQuery({ ...state, page: state.page > 1 ? state.page : '', per_page: '' });
      $('#rows').innerHTML = UI.skeletonRows(COLS, 6);
      try {
        const res = await Api.get('/users', state);
        if (my !== reqId) return;
        rows = res.items; draw();
        UI.pager($('#pager'), $('#summary'), res.meta, 'user', (p) => { state.page = p; load(); });
      } catch (err) { if (my === reqId) { $('#rows').innerHTML = `<tr><td colspan="${COLS}">${UI.errorState(err, 'retryList')}</td></tr>`; $('#retryList').onclick = load; } }
    }
    const roleIcon = { admin: 'bi-shield-lock', teacher: 'bi-person-workspace', student: 'bi-mortarboard' };
    function draw() {
      if (!rows.length) {
        $('#rows').innerHTML = `<tr><td colspan="${COLS}">${UI.empty({ icon: 'bi-person-x', title: 'No matching users', action: '<button class="btn btn-soft" data-act="clear">Clear filters</button>' })}</td></tr>`; return;
      }
      $('#rows').innerHTML = rows.map((u) => {
        const self = u.id === me.id; const [first, ...rest] = u.name.replace(/^(Prof\.|Dr\.)\s*/, '').split(' ');
        return `<tr>
        <td><div class="person"><span class="avatar">${esc(UI.initials(first, rest.pop()))}</span><div class="meta"><strong>${esc(u.name)}${self ? ' <span class="pill pill-muted">You</span>' : ''}</strong><span>${esc(u.email)}</span></div></div></td>
        <td class="mono small">${esc(u.username)}</td>
        <td><i class="bi ${roleIcon[u.role]} text-primary me-1"></i>${esc(UI.ROLE_LABEL[u.role])}${u.student_number ? `<div class="small text-muted mono">${esc(u.student_number)}</div>` : u.title ? `<div class="small text-muted">${esc(u.title)}</div>` : ''}</td>
        <td>${UI.statusPill(u.status === 'active' ? 'Active' : 'Inactive')}</td>
        <td class="small text-muted">${u.last_login_at ? UI.timeAgo(u.last_login_at) : 'Never'}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-sm btn-icon btn-soft" data-act="edit" data-id="${u.id}" title="Edit account" aria-label="Edit ${esc(u.name)}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-icon btn-soft" data-act="reset" data-id="${u.id}" title="Send password reset email" aria-label="Send password reset email to ${esc(u.name)}"><i class="bi bi-key"></i></button>
          ${self ? '' : `<button class="btn btn-sm btn-icon btn-soft ${u.status === 'active' ? 'text-danger' : 'text-success'}" data-act="status" data-id="${u.id}" title="${u.status === 'active' ? 'Deactivate' : 'Activate'}" aria-label="${u.status === 'active' ? 'Deactivate' : 'Activate'} ${esc(u.name)}"><i class="bi ${u.status === 'active' ? 'bi-person-slash' : 'bi-person-check'}"></i></button>`}
        </td></tr>`;
      }).join('');
    }

    const reload = () => { state.page = 1; load(); };
    $('#fSearch').addEventListener('input', UI.debounce((e) => { state.search = e.target.value.trim(); reload(); }, 300));
    $('#fRole').addEventListener('change', (e) => { state.role = e.target.value; reload(); });
    $('#fStatus').addEventListener('change', (e) => { state.status = e.target.value; reload(); });
    const clearFilters = () => { Object.assign(state, { search: '', role: '', status: '' }); ['#fSearch', '#fRole', '#fStatus'].forEach((s) => { $(s).value = ''; }); reload(); };
    $('#fReset').onclick = clearFilters;
    $('#addUser').onclick = () => openForm();

    $('#usrRoot').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const u = rows.find((x) => x.id === Number(b.dataset.id));
      if (b.dataset.act === 'clear') clearFilters();
      if (b.dataset.act === 'edit') openForm(u);
      if (b.dataset.act === 'reset') sendReset(u);
      if (b.dataset.act === 'status') toggleStatus(u);
    });

    // ---------- create / edit ----------
    const syncRole = () => {
      const role = formEl.elements.role.value;
      $('#uStudentBox').classList.toggle('d-none', role !== 'student');
      $('#uTitleBox').classList.toggle('d-none', role === 'student');
    };
    formEl.elements.role.addEventListener('change', syncRole);
    $('#genPw').onclick = () => { formEl.elements.password.value = genPassword(); formEl.elements.password.type = 'text'; };

    function openForm(u) {
      editing = u || null; formEl.reset(); UI.showFieldErrors(formEl, {}); picker.clear();
      formModalReady = false; $('#saveUser').disabled = true;
      $('#userModalTitle').textContent = u ? `Edit ${u.name}` : 'Create user account';
      $('#saveUser').innerHTML = u ? '<i class="bi bi-check2"></i>Save changes' : '<i class="bi bi-person-plus"></i>Create account';
      $('#uPwBox').classList.toggle('d-none', !!u);
      formEl.elements.password.type = 'password';
      const self = u && u.id === me.id;
      formEl.elements.role.disabled = !!self; formEl.elements.status.disabled = !!self;
      formEl.elements.email.readOnly = !!u;
      if (u) {
        ['name', 'email', 'username', 'role', 'title', 'status'].forEach((f) => { formEl.elements[f].value = u[f] || ''; });
        if (u.student_id) picker.set({ id: u.student_id, student_number: u.student_number, full_name: u.name });
      } else { formEl.elements.role.value = 'teacher'; formEl.elements.status.value = 'active'; }
      syncRole(); formM.show();
    }
    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!formModalReady) return;
      const data = Object.fromEntries(new FormData(formEl));
      if (editing && editing.id === me.id) { data.role = editing.role; data.status = editing.status; }
      const errs = {};
      ['name', 'email', 'username', 'role'].forEach((f) => { if (!String(data[f] || '').trim()) errs[f] = 'This field is required.'; });
      if (data.role === 'student' && !data.student_id) errs.student_id = 'Link the account to a student record.';
      if (!editing && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/.test(data.password || '')) errs.password = PW_HINT;
      if (Object.keys(errs).length) { UI.showFieldErrors(formEl, errs); return; }
      data.student_id = data.role === 'student' ? Number(data.student_id) : null;
      if (data.role === 'student') data.title = null;
      if (editing) delete data.password;
      const btn = $('#saveUser'); UI.setBusy(btn, true);
      try {
        if (editing) await Api.put(`/users/${editing.id}`, data); else await Api.post('/users', data);
        formM.hide(); UI.toast(editing ? 'Account updated.' : `Firebase account created for ${data.name}.`); load();
      } catch (err) { if (err.status === 422) UI.showFieldErrors(formEl, err.errors); UI.toast(err.message, 'error'); } finally { UI.setBusy(btn, false); }
    });

    // ---------- password reset email ----------
    async function sendReset(u) {
      try { await Api.post(`/users/${u.id}/reset-password`, {}); UI.toast(`Password reset email sent to ${u.email}.`); }
      catch (err) { UI.toast(err.message, 'error'); }
    }

    async function toggleStatus(u) {
      const activate = u.status !== 'active';
      const yes = await UI.confirm({ title: activate ? 'Activate account?' : 'Deactivate account?', danger: !activate, confirmText: activate ? 'Activate' : 'Deactivate',
        message: activate ? `<strong>${esc(u.name)}</strong> will be able to sign in again.` : `<strong>${esc(u.name)}</strong> will be signed out and can no longer sign in until reactivated.` });
      if (!yes) return;
      try { await Api.put(`/users/${u.id}/status`, { status: activate ? 'active' : 'inactive' }); UI.toast(`${u.name} was ${activate ? 'activated' : 'deactivated'}.`); load(); } catch (err) { UI.toast(err.message, 'error'); }
    }

    await load();
    return () => UI.disposeModals([formM]);
  }

  function userModal() {
    const inp = (name, label, { type = 'text', col = 'col-md-6', req = true, attrs = '' } = {}) => `<div class="${col}"><label class="form-label" for="u_${name}">${label}${req ? ' <span class="req">*</span>' : ''}</label><input class="form-control" id="u_${name}" name="${name}" type="${type}" ${attrs}><div class="invalid-feedback" data-for="${name}"></div></div>`;
    return `<div class="modal fade" id="userModal" tabindex="-1" aria-labelledby="userModalTitle"><div class="modal-dialog modal-lg"><div class="modal-content">
      <form id="userForm" novalidate class="d-contents" autocomplete="off">
      <div class="modal-header"><h2 class="modal-title" id="userModalTitle">Create user account</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
      <div class="modal-body"><div class="row g-3">
        <div class="col-md-6"><label class="form-label" for="u_role">Role <span class="req">*</span></label><select class="form-select" id="u_role" name="role">${UI.options([['admin', 'Administrator / Registrar'], ['teacher', 'Teacher / Faculty'], ['student', 'Student']])}</select><div class="invalid-feedback" data-for="role"></div></div>
        <div class="col-md-6"><label class="form-label" for="u_status">Status</label><select class="form-select" id="u_status" name="status">${UI.options([['active', 'Active'], ['inactive', 'Inactive']])}</select><div class="invalid-feedback" data-for="status"></div></div>
        <div class="col-12 d-none" id="uStudentBox">${UI.studentPickerHtml('uStudent', { label: 'Linked student record' })}<div class="form-text">Students can only see the record linked here.</div></div>
        ${inp('name', 'Full name', { col: 'col-12', attrs: 'maxlength="120"' })}
        ${inp('email', 'Email address', { type: 'email', attrs: 'maxlength="120"' })}
        ${inp('username', 'Username', { attrs: 'maxlength="60"' })}
        <div class="col-12" id="uTitleBox"><label class="form-label" for="u_title">Title / Department</label><input class="form-control" id="u_title" name="title" maxlength="120" placeholder="e.g. College of Computing"><div class="invalid-feedback" data-for="title"></div></div>
        <div class="col-12" id="uPwBox"><label class="form-label" for="u_password">Initial password <span class="req">*</span></label>
          <div class="input-group"><input class="form-control" id="u_password" name="password" type="password" autocomplete="new-password"><button type="button" class="btn btn-light" id="genPw"><i class="bi bi-magic"></i>Generate</button><div class="invalid-feedback" data-for="password"></div></div>
          <div class="form-text">${PW_HINT} Firebase Authentication stores the password; it is never saved in Firestore.</div></div>
      </div></div>
      <div class="modal-footer"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary" id="saveUser">Save</button></div>
      </form></div></div></div>`;
  }
  Router.register('/users', { title: 'User Management', section: 'Administration', roles: ['admin'], render });
})();
