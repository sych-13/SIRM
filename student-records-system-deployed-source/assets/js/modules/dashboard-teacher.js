/* MODULE 2b — Teacher / Faculty Dashboard */
(function () {
  'use strict';
  const { esc } = UI;

  async function render(view, { user }) {
    let d;
    try { d = await Api.get('/dashboard/teacher'); } catch (err) {
      view.innerHTML = `<div class="card">${UI.errorState(err, 'retryDash')}</div>`;
      UI.$('#retryDash').onclick = () => Router.resolve(); return;
    }
    const t = d.totals;
    const stat = (icon, label, value, sub, navy) => `<div class="col-6 col-xl-3"><div class="card stat-card h-100 ${navy ? 'is-navy' : ''}"><div class="stat-icon"><i class="bi ${icon}"></i></div><div><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div></div></div>`;

    view.innerHTML = `
      <div class="card welcome-card mb-4"><div class="card-body d-flex flex-wrap align-items-center justify-content-between gap-3 position-relative" style="z-index:1">
        <div><p class="small-caps mb-1">${esc(user.title || 'Faculty')} · AY ${esc(d.current_term.academic_year)}</p>
          <h2 class="h4 fw-bold mb-1">Welcome back, ${esc(user.name)}.</h2>
          <p class="text-muted mb-0">${t.pending_grades ? `${t.pending_grades} grade${t.pending_grades > 1 ? 's are' : ' is'} still waiting to be encoded this term.` : 'All grades for this term are encoded. 🎉'}</p></div>
        <div class="d-flex gap-2"><a class="btn btn-soft" href="#/students"><i class="bi bi-people"></i>Student directory</a><a class="btn btn-primary" href="#/grades"><i class="bi bi-pencil-square"></i>Encode grades</a></div>
      </div></div>
      <div class="row g-3 mb-4">
        ${stat('bi-easel2', 'Assigned Subjects', t.subjects, `${t.units} total units`, true)}
        ${stat('bi-people', 'My Students', t.students, 'Across all classes this AY')}
        ${stat('bi-hourglass-split', 'Pending Grades', t.pending_grades, d.current_term.semester)}
        ${stat('bi-calendar3', 'Current Term', d.current_term.semester.split(' ')[0], d.current_term.academic_year)}
      </div>
      <div class="row g-4">
        <div class="col-lg-5">
          <div class="card h-100"><div class="card-header"><h2>My classes</h2></div><div class="card-body d-grid gap-2">
            ${d.classes.length ? d.classes.map((c) => `
              <a class="quick-action text-decoration-none flex-row align-items-center" href="#/grades?subject=${c.id}">
                <i class="bi bi-journal-bookmark"></i>
                <div class="flex-grow-1"><strong class="d-block">${esc(c.code)} · ${esc(c.name)}</strong><span>${c.units} units · ${c.students} students this term</span></div>
                ${c.pending_grades ? `<span class="pill pill-warning">${c.pending_grades} pending</span>` : '<span class="pill pill-success">Complete</span>'}
              </a>`).join('') : UI.empty({ icon: 'bi-easel', title: 'No assigned subjects', text: 'The registrar assigns subjects to faculty.' })}
          </div></div>
        </div>
        <div class="col-lg-7">
          <div class="card h-100"><div class="card-header"><h2>Class roster: ${esc(d.current_term.semester)}</h2><a class="btn btn-sm btn-soft" href="#/grades">Open grade sheet</a></div>
            ${d.roster.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Student</th><th>Subject</th><th class="text-center">Grade</th><th>Remarks</th></tr></thead><tbody>
              ${d.roster.map((r) => `<tr><td><div class="meta"><strong class="d-block">${esc(r.student_name)}</strong><span class="mono small text-muted">${esc(r.student_number)}</span></div></td>
                <td><span class="fw-semibold">${esc(r.subject_code)}</span></td><td class="text-center">${UI.grade(r.grade)}</td><td>${UI.statusPill(r.remarks)}</td></tr>`).join('')}
            </tbody></table></div>` : UI.empty({ icon: 'bi-people', title: 'No students enrolled in your classes yet' })}
          </div>
        </div>
      </div>`;
  }

  Router.routes['/dashboard'].render.teacher = render;
})();
