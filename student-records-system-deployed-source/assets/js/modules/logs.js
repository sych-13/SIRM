/* =========================================================
   MODULE 8b — Activity Logs (admin, read-only)
   API: GET /logs?search&action&user_id&date_from&date_to&page
   ========================================================= */
(function () {
  'use strict';
  const { esc, $ } = UI;
  const COLS = 5;
  const ICONS = { create: 'bi-plus-lg', update: 'bi-pencil', delete: 'bi-trash3', login: 'bi-box-arrow-in-right', login_failed: 'bi-shield-exclamation', logout: 'bi-box-arrow-right', report: 'bi-file-earmark-text' };
  const LABEL = { create: 'Create', update: 'Update', delete: 'Delete', login: 'Sign in', login_failed: 'Failed sign-in', logout: 'Sign out', report: 'Report' };
  const TONE = { create: 'success', update: '', delete: 'danger', login: 'muted', logout: 'muted', login_failed: 'warning', report: '' };

  async function render(view, { query }) {
    const state = { search: query.search || '', action: query.action || '', date_from: query.date_from || '', date_to: query.date_to || '', page: Number(query.page) || 1, per_page: 20 };

    view.innerHTML = `<div id="logRoot">
      <div class="mb-3"><h2 class="h4 fw-bold mb-1">Activity logs</h2><p class="text-muted mb-0">A read-only audit trail of sign-ins and every change to records. Logs cannot be edited or deleted.</p></div>
      <div class="card">
        <div class="toolbar">
          <div class="search input-icon"><i class="bi bi-search"></i><input class="form-control" id="fSearch" placeholder="Search description or user…" value="${esc(state.search)}" aria-label="Search logs"></div>
          <select class="form-select w-auto" id="fAction" aria-label="Action">${UI.options(Object.entries(LABEL), state.action, 'All actions')}</select>
          <div class="d-flex align-items-center gap-1"><label class="small text-muted" for="fFrom">From</label><input class="form-control w-auto" type="date" id="fFrom" value="${esc(state.date_from)}"></div>
          <div class="d-flex align-items-center gap-1"><label class="small text-muted" for="fTo">To</label><input class="form-control w-auto" type="date" id="fTo" value="${esc(state.date_to)}"></div>
          <button class="btn btn-light ms-auto" id="fReset"><i class="bi bi-x-circle"></i>Clear</button>
        </div>
        <div class="table-wrap"><table class="table" aria-live="polite">
          <thead><tr><th style="width:170px">When</th><th>User</th><th>Action</th><th>Description</th><th>IP address</th></tr></thead>
          <tbody id="rows"></tbody>
        </table></div>
        <div class="table-foot"><div id="summary">&nbsp;</div><nav><ul class="pagination" id="pager"></ul></nav></div>
      </div></div>`;

    let reqId = 0;
    async function load() {
      const my = ++reqId;
      Router.setQuery({ ...state, page: state.page > 1 ? state.page : '', per_page: '' });
      $('#rows').innerHTML = UI.skeletonRows(COLS, 10);
      try {
        const res = await Api.get('/logs', state);
        if (my !== reqId) return;
        draw(res.items);
        UI.pager($('#pager'), $('#summary'), res.meta, 'entry', (p) => { state.page = p; load(); });
      } catch (err) { if (my === reqId) { $('#rows').innerHTML = `<tr><td colspan="${COLS}">${UI.errorState(err, 'retryList')}</td></tr>`; $('#retryList').onclick = load; } }
    }
    function draw(items) {
      if (!items.length) { $('#rows').innerHTML = `<tr><td colspan="${COLS}">${UI.empty({ icon: 'bi-clock-history', title: 'No log entries match', text: 'Try a wider date range or another action.' })}</td></tr>`; return; }
      $('#rows').innerHTML = items.map((l) => `<tr>
        <td class="small"><div class="fw-semibold">${UI.formatDate(l.created_at)}</div><div class="text-muted">${esc(String(l.created_at).slice(11, 16))} · ${UI.timeAgo(l.created_at)}</div></td>
        <td>${esc(l.user_name)}${l.user_role ? `<div class="small text-muted">${esc(UI.ROLE_LABEL[l.user_role] || l.user_role)}</div>` : ''}</td>
        <td><span class="pill ${TONE[l.action] ? 'pill-' + TONE[l.action] : ''} text-nowrap"><i class="bi ${ICONS[l.action] || 'bi-activity'} me-1"></i>${esc(LABEL[l.action] || l.action)}</span></td>
        <td>${esc(l.description)}</td>
        <td class="mono small text-muted">${esc(l.ip_address || '—')}</td></tr>`).join('');
    }

    const reload = () => { state.page = 1; load(); };
    $('#fSearch').addEventListener('input', UI.debounce((e) => { state.search = e.target.value.trim(); reload(); }, 300));
    $('#fAction').addEventListener('change', (e) => { state.action = e.target.value; reload(); });
    $('#fFrom').addEventListener('change', (e) => { state.date_from = e.target.value; reload(); });
    $('#fTo').addEventListener('change', (e) => { state.date_to = e.target.value; reload(); });
    $('#fReset').onclick = () => { Object.assign(state, { search: '', action: '', date_from: '', date_to: '' }); ['#fSearch', '#fAction', '#fFrom', '#fTo'].forEach((s) => { $(s).value = ''; }); reload(); };

    await load();
  }

  Router.register('/logs', { title: 'Activity Logs', section: 'Administration', roles: ['admin'], render });
})();
