/* =========================================================
   Shared UI helpers used by every module.
   ========================================================= */
(function () {
  'use strict';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const UI = {
    esc,
    $: (sel, root = document) => root.querySelector(sel),
    $$: (sel, root = document) => Array.from(root.querySelectorAll(sel)),

    debounce(fn, ms = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },

    formatDate(v, opts = { year: 'numeric', month: 'short', day: 'numeric' }) {
      if (!v) return '—';
      const d = new Date(String(v).replace(' ', 'T'));
      return isNaN(d) ? esc(v) : d.toLocaleDateString('en-PH', opts);
    },
    timeAgo(v) {
      const d = new Date(String(v).replace(' ', 'T')); const s = (Date.now() - d) / 1000;
      if (s < 60) return 'just now';
      if (s < 3600) return `${Math.floor(s / 60)} min ago`;
      if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
      if (s < 86400 * 7) return `${Math.floor(s / 86400)} day${s < 172800 ? '' : 's'} ago`;
      return UI.formatDate(v);
    },
    age(dob) { if (!dob) return ''; const d = new Date(dob); const n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return a; },
    initials(first, last) { return `${(first || '?')[0] || ''}${(last || '')[0] || ''}`.toUpperCase(); },
    avatar(s, cls = '') {
      if (s.profile_picture) return `<img class="avatar ${cls}" src="${esc(s.profile_picture)}" alt="">`;
      return `<span class="avatar ${cls}" aria-hidden="true">${esc(UI.initials(s.first_name, s.last_name))}</span>`;
    },
    statusPill(status) {
      const map = { Enrolled: 'success', Active: 'success', active: 'success', Passed: 'success', Completed: 'muted', Pending: 'warning', 'In Progress': 'warning', Dropped: 'danger', Failed: 'danger', inactive: 'danger', Inactive: 'danger', Incomplete: 'warning', 'Not Enrolled': 'muted' };
      return `<span class="pill pill-${map[status] || 'muted'}">${esc(status)}</span>`;
    },
    ordinal(n) { return n ? `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'} Year` : '—'; },
    grade(g) { if (g == null) return '<span class="text-muted">—</span>'; return `<span class="grade ${g <= 3 ? 'grade-good' : 'grade-fail'}">${Number(g).toFixed(2)}</span>`; },

    loader(label = 'Loading…') { return `<div class="page-loader"><div class="text-center"><div class="spinner-border text-primary mb-2" role="status"></div><div class="small">${esc(label)}</div></div></div>`; },
    skeletonRows(cols, rows = 6) { return Array.from({ length: rows }, () => `<tr>${Array.from({ length: cols }, () => '<td><div class="skeleton" style="height:14px"></div></td>').join('')}</tr>`).join(''); },
    empty({ icon = 'bi-inbox', title = 'Nothing here yet', text = '', action = '' } = {}) {
      return `<div class="empty-state"><div class="icon"><i class="bi ${icon}"></i></div><h3>${esc(title)}</h3>${text ? `<p class="mb-3">${esc(text)}</p>` : ''}${action}</div>`;
    },
    errorState(err, retryId) {
      return UI.empty({ icon: 'bi-exclamation-octagon', title: 'Something went wrong', text: err && err.message ? err.message : 'Please try again.', action: retryId ? `<button class="btn btn-soft" id="${retryId}"><i class="bi bi-arrow-clockwise"></i>Retry</button>` : '' });
    },

    toast(message, type = 'success') {
      const icons = { success: 'bi-check-circle-fill', error: 'bi-x-octagon-fill', info: 'bi-info-circle-fill' };
      const el = document.createElement('div');
      el.className = `toast align-items-center bg-white is-${type}`;
      el.setAttribute('role', type === 'error' ? 'alert' : 'status');
      el.innerHTML = `<div class="d-flex"><div class="toast-body"><i class="bi ${icons[type] || icons.info} fs-5"></i>${esc(message)}</div><button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
      document.getElementById('toasts').appendChild(el);
      const t = new bootstrap.Toast(el, { delay: 3800 }); t.show();
      el.addEventListener('hidden.bs.toast', () => el.remove());
    },

    confirm({ title = 'Are you sure?', message = '', confirmText = 'Confirm', danger = false } = {}) {
      return new Promise((resolve) => {
        const wrap = document.createElement('div');
        wrap.innerHTML = `<div class="modal fade" tabindex="-1"><div class="modal-dialog modal-dialog-centered" style="max-width:420px"><div class="modal-content">
          <div class="modal-body text-center p-4">
            <div class="mx-auto mb-3 d-grid" style="place-items:center;width:56px;height:56px;border-radius:16px;background:${danger ? 'var(--danger-bg)' : 'var(--blue-50)'};color:${danger ? 'var(--danger)' : 'var(--blue-600)'};font-size:1.5rem"><i class="bi ${danger ? 'bi-trash3' : 'bi-question-circle'}"></i></div>
            <h3 class="h5 fw-bold">${esc(title)}</h3><p class="text-muted mb-4">${message}</p>
            <div class="d-flex gap-2 justify-content-center"><button class="btn btn-light" data-act="no">Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="yes">${esc(confirmText)}</button></div>
          </div></div></div></div>`;
        const el = wrap.firstElementChild; document.body.appendChild(el);
        const m = new bootstrap.Modal(el); let answer = false;
        el.querySelector('[data-act="yes"]').onclick = () => { answer = true; m.hide(); };
        el.querySelector('[data-act="no"]').onclick = () => m.hide();
        el.addEventListener('hidden.bs.modal', () => { el.remove(); resolve(answer); });
        m.show();
      });
    },

    setBusy(btn, busy, label) {
      if (!btn) return;
      if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>${esc(label || 'Saving…')}`; }
      else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
    },

    // Applies server-side 422 errors to Bootstrap form fields.
    showFieldErrors(form, errors = {}) {
      UI.$$('.is-invalid', form).forEach((el) => el.classList.remove('is-invalid'));
      UI.$$('.invalid-feedback[data-for]', form).forEach((el) => { el.textContent = ''; });
      Object.entries(errors).forEach(([field, msg]) => {
        if (!msg) return;
        const input = form.elements[field];
        if (input && input.classList) {
          input.classList.add('is-invalid');
          if (input.type === 'hidden' && input.dataset.visible) { const v = form.querySelector(input.dataset.visible); if (v) v.classList.add('is-invalid'); }
        }
        const fb = form.querySelector(`.invalid-feedback[data-for="${field}"]`); if (fb) fb.textContent = msg;
      });
      const first = form.querySelector('.is-invalid'); if (first) first.focus();
    },

    // ---------- shared building blocks for list modules ----------
    GRADES: [1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 5.0],
    SEMESTERS: ['1st Semester', '2nd Semester', 'Summer'],
    ENROLL_STATUSES: ['Enrolled', 'Pending', 'Dropped', 'Completed'],
    ROLE_LABEL: { admin: 'Administrator', teacher: 'Teacher', student: 'Student' },

    // <option>s from strings or [value, label] pairs
    options(list, selected = '', placeholder = null) {
      const opts = list.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(l)}</option>`; }).join('');
      return (placeholder != null ? `<option value="">${esc(placeholder)}</option>` : '') + opts;
    },
    gradeOptions(selected) {
      return `<option value="">— Not graded —</option>` + UI.GRADES.map((g) => `<option value="${g}" ${selected != null && Number(selected) === g ? 'selected' : ''}>${g.toFixed(2)}${g === 5 ? ' (Failed)' : ''}</option>`).join('');
    },

    // Pagination: renders summary text + page buttons; calls onPage(n) on click.
    pager(ulEl, summaryEl, m, noun = 'record', onPage) {
      const from = m.total ? (m.page - 1) * m.per_page + 1 : 0;
      summaryEl.textContent = m.total ? `Showing ${from}–${Math.min(m.page * m.per_page, m.total)} of ${m.total} ${noun}${m.total === 1 ? '' : 's'}` : `0 ${noun}s`;
      const pages = []; for (let p = Math.max(1, m.page - 2); p <= Math.min(m.pages, m.page + 2); p++) pages.push(p);
      const li = (p, label, dis, act) => `<li class="page-item ${dis ? 'disabled' : ''} ${act ? 'active' : ''}"><button class="page-link" data-page="${p}" ${dis ? 'disabled' : ''}>${label}</button></li>`;
      ulEl.innerHTML = li(m.page - 1, '<i class="bi bi-chevron-left"></i>', m.page <= 1) + pages.map((p) => li(p, p, false, p === m.page)).join('') + li(m.page + 1, '<i class="bi bi-chevron-right"></i>', m.page >= m.pages);
      ulEl.onclick = (e) => { const b = e.target.closest('[data-page]'); if (b && !b.disabled) onPage(Number(b.dataset.page)); };
    },

    // Closes and disposes Bootstrap modals when a route is left.
    disposeModals(modals) {
      modals.forEach((m) => { if (m) { try { m.hide(); m.dispose(); } catch (_) { /* already gone */ } } });
      UI.$$('.modal-backdrop').forEach((el) => el.remove());
      document.body.classList.remove('modal-open'); document.body.style.removeProperty('overflow'); document.body.style.removeProperty('padding-right');
    },
    // Resolves after a modal has fully closed (so two modals never overlap).
    hideModal(el, m) {
      return new Promise((resolve) => {
        if (!el.classList.contains('show')) return resolve();
        el.addEventListener('hidden.bs.modal', () => resolve(), { once: true }); m.hide();
      });
    },

    // Searchable student selector backed by GET /students. Markup goes inside a form.
    studentPickerHtml(id, { name = 'student_id', label = 'Student', required = true } = {}) {
      return `<label class="form-label" for="${id}">${esc(label)}${required ? ' <span class="req">*</span>' : ''}</label>
        <div class="picker" id="${id}_wrap">
          <div class="input-icon"><i class="bi bi-person-search"></i><input class="form-control" id="${id}" autocomplete="off" placeholder="Type a student number or name…" role="combobox" aria-expanded="false" aria-autocomplete="list"></div>
          <input type="hidden" name="${name}" data-visible="#${id}">
          <div class="invalid-feedback" data-for="${name}"></div>
          <div class="picker-menu" role="listbox" hidden></div>
        </div>`;
    },
    studentPicker(id, { onSelect } = {}) {
      const input = document.getElementById(id); const wrap = document.getElementById(`${id}_wrap`);
      const hidden = wrap.querySelector('input[type=hidden]'); const menu = wrap.querySelector('.picker-menu');
      let items = []; let seq = 0;
      const close = () => { menu.hidden = true; input.setAttribute('aria-expanded', 'false'); };
      const choose = (s) => {
        hidden.value = s ? s.id : ''; input.value = s ? `${s.student_number} · ${s.full_name}` : '';
        input.classList.remove('is-invalid'); close(); if (onSelect) onSelect(s);
      };
      const search = UI.debounce(async () => {
        const term = input.value.trim(); const my = ++seq;
        if (term.length < 2) { close(); return; }
        menu.innerHTML = '<div class="picker-empty"><span class="spinner-border spinner-border-sm me-2"></span>Searching…</div>'; menu.hidden = false;
        try {
          const res = await Api.get('/students', { search: term, per_page: 8, sort: 'last_name' });
          if (my !== seq) return;
          items = res.items;
          menu.innerHTML = items.length ? items.map((s, i) => `<button type="button" class="picker-item" role="option" data-i="${i}">${UI.avatar(s, 'avatar-sm')}<span><strong>${esc(s.full_name)}</strong><small class="mono">${esc(s.student_number)}${s.program ? ' · ' + esc(s.program) : ''}</small></span></button>`).join('')
            : '<div class="picker-empty">No matching students.</div>';
          input.setAttribute('aria-expanded', 'true');
        } catch (err) { if (my === seq) menu.innerHTML = `<div class="picker-empty text-danger">${esc(err.message)}</div>`; }
      }, 250);
      input.addEventListener('input', () => { hidden.value = ''; search(); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowDown') { const f = menu.querySelector('.picker-item'); if (f) { e.preventDefault(); f.focus(); } } });
      menu.addEventListener('keydown', (e) => {
        const cur = document.activeElement;
        if (e.key === 'ArrowDown' && cur.nextElementSibling) { e.preventDefault(); cur.nextElementSibling.focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); (cur.previousElementSibling || input).focus(); }
        if (e.key === 'Escape') { close(); input.focus(); }
      });
      menu.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) choose(items[Number(b.dataset.i)]); });
      input.addEventListener('blur', () => setTimeout(() => { if (!wrap.contains(document.activeElement)) close(); }, 150));
      return { set: choose, clear: () => choose(null), get value() { return hidden.value ? Number(hidden.value) : null; }, disable(on) { input.disabled = on; } };
    },

    loadScript(src) {
      UI._scripts = UI._scripts || {};
      if (!UI._scripts[src]) {
        UI._scripts[src] = new Promise((resolve, reject) => {
          const s = document.createElement('script'); s.src = src; s.onload = resolve;
          s.onerror = () => { delete UI._scripts[src]; reject(new Error('Could not load the PDF library. Check your connection.')); };
          document.head.appendChild(s);
        });
      }
      return UI._scripts[src];
    },
  };
  window.UI = UI;
})();
