/* MODULE 2 — Admin Dashboard */
(function () {
  'use strict';
  const { esc } = UI;

  function statCard({ icon, label, value, sub, navy }) {
    return `<div class="col-6 col-xl-3"><div class="card stat-card h-100 ${navy ? 'is-navy' : ''}">
      <div class="stat-icon"><i class="bi ${icon}"></i></div>
      <div><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div>
    </div></div>`;
  }

  async function render(view, { user }) {
    let d;
    try { d = await Api.get('/dashboard/admin'); } catch (err) {
      view.innerHTML = `<div class="card">${UI.errorState(err, 'retryDash')}</div>`;
      UI.$('#retryDash').onclick = () => Router.resolve(); return;
    }
    const t = d.totals;
    const maxProg = Math.max(1, ...d.enrollment_by_program.map((p) => p.enrolled + p.pending));
    const totalCurrent = d.enrollment_by_status.reduce((a, s) => a + s.count, 0);
    const icons = { create: 'bi-plus-lg', update: 'bi-pencil', delete: 'bi-trash3', login: 'bi-box-arrow-in-right', login_failed: 'bi-shield-exclamation', logout: 'bi-box-arrow-right', report: 'bi-file-earmark-text' };
    const hour = new Date().getHours();

    view.innerHTML = `
      <div class="card welcome-card mb-4"><div class="card-body d-flex flex-wrap align-items-center justify-content-between gap-3 position-relative" style="z-index:1">
        <div>
          <p class="small-caps mb-1">AY ${esc(d.current_term.academic_year)} · ${esc(d.current_term.semester)}</p>
          <h2 class="h4 fw-bold mb-1">Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, ${esc(user.name.split(' ')[0])}.</h2>
          <p class="text-muted mb-0">${t.enrolled} of ${t.students} students are officially enrolled this term.</p>
        </div>
        <div class="d-flex gap-2 flex-wrap">
          <a class="btn btn-soft" href="#/reports"><i class="bi bi-file-earmark-arrow-down"></i>Reports</a>
          <a class="btn btn-primary" href="#/students?new=1"><i class="bi bi-person-plus"></i>Add student</a>
        </div>
      </div></div>

      <div class="row g-3 mb-4">
        ${statCard({ icon: 'bi-people-fill', label: 'Total Students', value: t.students, sub: 'Registered student profiles', navy: true })}
        ${statCard({ icon: 'bi-person-workspace', label: 'Total Teachers', value: t.teachers, sub: 'Active faculty accounts' })}
        ${statCard({ icon: 'bi-journal-check', label: 'Enrolled Students', value: t.enrolled, sub: `${d.current_term.semester}, ${d.current_term.academic_year}` })}
        ${statCard({ icon: 'bi-book-half', label: 'Total Subjects', value: t.subjects, sub: 'Offered in the catalog' })}
      </div>

      <div class="row g-4 mb-4">
        <div class="col-lg-7">
          <div class="card h-100">
            <div class="card-header"><h2>Enrollment overview by program</h2>
              <span class="small text-muted"><span class="legend-dot" style="background:var(--blue-600)"></span>Enrolled <span class="legend-dot ms-2" style="background:var(--sky-400)"></span>Pending</span></div>
            <div class="card-body">
              ${d.enrollment_by_program.map((p) => `
                <div class="bar-row" title="${esc(p.name)}: ${p.enrolled} enrolled, ${p.pending} pending">
                  <span class="bar-label">${esc(p.program)}</span>
                  <div class="bar-track"><div class="bar-fill" style="width:${(p.enrolled / maxProg) * 100}%"></div><div class="bar-fill pending" style="width:${(p.pending / maxProg) * 100}%"></div></div>
                  <span class="bar-value">${p.enrolled + p.pending}</span>
                </div>`).join('')}
              <div class="d-flex flex-wrap gap-4 mt-3 pt-3 border-top">
                ${d.enrollment_by_status.map((s) => `<div><div class="small text-muted">${esc(s.status)}</div><div class="fw-bold fs-5">${s.count} <span class="small text-muted fw-normal">${totalCurrent ? Math.round((s.count / totalCurrent) * 100) : 0}%</span></div></div>`).join('')}
              </div>
            </div>
          </div>
        </div>
        <div class="col-lg-5">
          <div class="card h-100">
            <div class="card-header"><h2>Quick actions</h2></div>
            <div class="card-body"><div class="row g-2">
              ${[
                ['#/students?new=1', 'bi-person-plus', 'Add student', 'Create a new profile'],
                ['#/enrollment?new=1', 'bi-journal-plus', 'Enroll student', 'Assign term & program'],
                ['#/academic-records', 'bi-pencil-square', 'Encode grades', 'Update academic records'],
                ['#/reports', 'bi-printer', 'Generate report', 'Master list, grades, CSV'],
                ['#/users', 'bi-person-gear', 'Manage users', 'Roles & account status'],
                ['#/search', 'bi-search', 'Find a student', 'Search by name, term, program'],
              ].map(([href, icon, title, sub]) => `<div class="col-6"><a class="quick-action text-decoration-none" href="${href}"><i class="bi ${icon}"></i><div><strong class="d-block">${title}</strong><span>${sub}</span></div></a></div>`).join('')}
            </div></div>
          </div>
        </div>
      </div>

      <div class="row g-4">
        <div class="col-lg-7">
          <div class="card h-100">
            <div class="card-header"><h2>Recent student registrations</h2><a class="btn btn-sm btn-soft" href="#/students?sort=created_at&dir=desc">View all</a></div>
            ${d.recent_students.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Student</th><th>Program</th><th>Registered</th><th></th></tr></thead><tbody>
              ${d.recent_students.map((s) => `<tr>
                <td><div class="person">${UI.avatar(s)}<div class="meta"><strong>${esc(s.full_name)}</strong><span class="mono">${esc(s.student_number)}</span></div></div></td>
                <td>${esc(s.program || '—')}${s.year_level ? ` <span class="text-muted small">· ${UI.ordinal(s.year_level)}</span>` : ''}</td>
                <td class="text-muted small">${UI.formatDate(s.created_at)}</td>
                <td class="text-end"><a class="btn btn-sm btn-icon btn-soft" href="#/students?view=${s.id}" title="View profile" aria-label="View ${esc(s.full_name)}"><i class="bi bi-eye"></i></a></td>
              </tr>`).join('')}</tbody></table></div>` : UI.empty({ icon: 'bi-person-plus', title: 'No students yet', text: 'Newly registered students appear here.' })}
          </div>
        </div>
        <div class="col-lg-5">
          <div class="card h-100">
            <div class="card-header"><h2>Recent system activity</h2><a class="btn btn-sm btn-soft" href="#/logs">All logs</a></div>
            <div class="card-body pt-1">
              ${d.recent_activity.length ? `<ul class="activity">${d.recent_activity.map((l) => `<li>
                <span class="dot ${esc(l.action)}"><i class="bi ${icons[l.action] || 'bi-activity'}"></i></span>
                <div><p>${esc(l.description)}</p><time>${UI.timeAgo(l.created_at)} · ${esc(l.user_name)}</time></div></li>`).join('')}</ul>`
                : UI.empty({ icon: 'bi-clock-history', title: 'No activity yet' })}
            </div>
          </div>
        </div>
      </div>`;
  }

  Router.register('/dashboard', {
    title: (u) => ({ admin: 'Admin Dashboard', teacher: 'Teacher Dashboard', student: 'My Dashboard' }[u.role]),
    section: 'Overview',
    render: { admin: render }, // teacher & student renderers are attached by their own modules
  });
})();
