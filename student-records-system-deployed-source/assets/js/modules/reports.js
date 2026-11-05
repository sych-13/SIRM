/* =========================================================
   MODULE 7 — Report Generation (admin; teacher: own classes)
   API: GET /reports/{master-list|enrollment|academic-records|grades}?…&format=json|csv
   Print uses the print stylesheet; PDF is generated in the browser
   with jsPDF + AutoTable from the same JSON the preview shows.
   ========================================================= */
(function () {
  'use strict';
  const { esc, $, $$ } = UI;
  const JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
  const AUTOTABLE = 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js';

  const TYPES = [
    { key: 'master-list', icon: 'bi-people', title: 'Student Master List', text: 'Every student with program, year level and status.', roles: ['admin'], filters: ['term', 'program', 'status', 'date'], dateLabel: 'Registered between' },
    { key: 'enrollment', icon: 'bi-journal-check', title: 'Enrollment Report', text: 'Enrollments per term with status totals.', roles: ['admin'], filters: ['term', 'program', 'status', 'date'], dateLabel: 'Enrollment date between' },
    { key: 'academic-records', icon: 'bi-mortarboard', title: 'Academic Records Report', text: 'Subject grades and remarks for a term or subject.', roles: ['admin', 'teacher'], filters: ['term', 'subject', 'date'], dateLabel: 'Last updated between' },
    { key: 'grades', icon: 'bi-file-earmark-person', title: 'Student Grade Report', text: 'One student\'s grades per term with GWA.', roles: ['admin', 'teacher'], filters: ['student', 'term'] },
  ];

  async function render(view, { query, user }) {
    const types = TYPES.filter((t) => t.roles.includes(user.role));
    let meta; let subjects;
    try { [meta, subjects] = await Promise.all([Api.get('/meta'), Api.get('/subjects')]); } catch (err) {
      view.innerHTML = `<div class="card">${UI.errorState(err, 'retryMeta')}</div>`; $('#retryMeta').onclick = () => Router.resolve(); return;
    }
    let type = types.find((t) => t.key === query.type) || types[0];
    let report = null; let lastFilters = null;

    view.innerHTML = `<div id="reportRoot">
      <div class="row g-3 mb-3 no-print" id="typeList">${types.map((t) => `<div class="col-sm-6 col-xl-3"><button type="button" class="report-type h-100" data-type="${t.key}" aria-pressed="false"><i class="bi ${t.icon}"></i><div><strong>${t.title}</strong><span>${t.text}</span></div></button></div>`).join('')}</div>
      <div class="card mb-3 no-print"><div class="card-body">
        <form id="repForm" novalidate>
          <div class="filter-grid" id="repFilters"></div>
          <div class="d-flex gap-2 flex-wrap mt-3"><button class="btn btn-primary" id="genBtn"><i class="bi bi-play-circle"></i>Generate report</button><button type="button" class="btn btn-light" id="repReset"><i class="bi bi-x-circle"></i>Reset filters</button></div>
        </form>
      </div></div>
      <div id="reportOutput"></div>
    </div>`;

    let picker = null;
    function drawFilters() {
      $$('.report-type').forEach((b) => { const on = b.dataset.type === type.key; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
      const f = type.filters; const parts = [];
      if (f.includes('student')) parts.push(`<div style="grid-column:1/-1">${UI.studentPickerHtml('repStudent')}</div>`);
      if (f.includes('term')) {
        parts.push(`<div><label class="form-label" for="rAY">Academic year</label><select class="form-select" id="rAY" name="academic_year">${UI.options(meta.academic_years, type.key === 'grades' ? '' : meta.current_term.academic_year, 'All academic years')}</select></div>`);
        parts.push(`<div><label class="form-label" for="rSem">Semester</label><select class="form-select" id="rSem" name="semester">${UI.options(meta.semesters, type.key === 'grades' || type.key === 'master-list' ? '' : meta.current_term.semester, 'All semesters')}</select></div>`);
      }
      if (f.includes('program')) parts.push(`<div><label class="form-label" for="rProg">Program</label><select class="form-select" id="rProg" name="program">${UI.options(meta.programs.map((p) => p.code), '', 'All programs')}</select></div>`);
      if (f.includes('status')) parts.push(`<div><label class="form-label" for="rStatus">Status</label><select class="form-select" id="rStatus" name="status">${UI.options(type.key === 'master-list' ? [...UI.ENROLL_STATUSES, 'Not Enrolled'] : UI.ENROLL_STATUSES, '', 'Any status')}</select></div>`);
      if (f.includes('subject')) parts.push(`<div><label class="form-label" for="rSub">Subject</label><select class="form-select" id="rSub" name="subject_id">${UI.options(subjects.map((s) => [s.id, `${s.code} · ${s.name}`]), '', user.role === 'teacher' ? 'All my subjects' : 'All subjects')}</select></div>`);
      if (f.includes('date')) {
        parts.push(`<div><label class="form-label" for="rFrom">${type.dateLabel}: from</label><input class="form-control" type="date" id="rFrom" name="date_from"><div class="invalid-feedback" data-for="date_from"></div></div>`);
        parts.push(`<div><label class="form-label" for="rTo">to</label><input class="form-control" type="date" id="rTo" name="date_to"><div class="invalid-feedback" data-for="date_to"></div></div>`);
      }
      $('#repFilters').innerHTML = parts.join('');
      picker = f.includes('student') ? UI.studentPicker('repStudent') : null;
      if (picker && query.student_id && query.student_number) picker.set({ id: Number(query.student_id), student_number: query.student_number, full_name: query.student_name || '' });
    }
    function filters() {
      const d = Object.fromEntries(new FormData($('#repForm')));
      return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== ''));
    }
    function validate(f) {
      const errs = {};
      if (type.key === 'grades' && !f.student_id) errs.student_id = 'Select a student.';
      if (f.date_from && f.date_to && f.date_from > f.date_to) errs.date_to = 'End date must be on or after the start date.';
      UI.showFieldErrors($('#repForm'), errs);
      return !Object.keys(errs).length;
    }

    async function generate() {
      const f = filters(); if (!validate(f)) return;
      const btn = $('#genBtn'); UI.setBusy(btn, true, 'Generating…');
      $('#reportOutput').innerHTML = `<div class="card">${UI.loader('Generating report from live records…')}</div>`;
      try {
        report = await Api.get(`/reports/${type.key}`, f); lastFilters = f;
        drawReport();
      } catch (err) {
        if (err.status === 422) UI.showFieldErrors($('#repForm'), err.errors);
        $('#reportOutput').innerHTML = `<div class="card">${UI.errorState(err, 'retryRep')}</div>`; $('#retryRep').onclick = generate;
      } finally { UI.setBusy(btn, false); }
    }

    function cell(col, v) {
      if (col.key === 'grade') return v === '' ? '<span class="text-muted">—</span>' : UI.grade(Number(v));
      if (col.key === 'status' || col.key === 'remarks') return v ? UI.statusPill(v) : '';
      if (col.key === 'year_level') return v ? UI.ordinal(Number(v)) : '—';
      if (/date/.test(col.key)) return UI.formatDate(v);
      if (col.key === 'student_number' || col.key === 'subject_code') return `<span class="mono fw-semibold">${esc(v)}</span>`;
      return esc(v);
    }
    function drawReport() {
      const r = report;
      const filt = Object.entries(r.filters);
      $('#reportOutput').innerHTML = `<div class="card report-sheet">
        <div class="card-header report-actions no-print"><h2>${esc(r.title)} <span class="pill pill-muted ms-1">${r.rows.length} row${r.rows.length === 1 ? '' : 's'}</span></h2>
          <div class="d-flex gap-2 flex-wrap">
            <button class="btn btn-sm btn-light" id="printBtn" ${r.rows.length ? '' : 'disabled'}><i class="bi bi-printer"></i>Print</button>
            <button class="btn btn-sm btn-soft" id="pdfBtn" ${r.rows.length ? '' : 'disabled'}><i class="bi bi-filetype-pdf"></i>PDF</button>
            <button class="btn btn-sm btn-soft" id="csvBtn" ${r.rows.length ? '' : 'disabled'}><i class="bi bi-filetype-csv"></i>CSV</button>
          </div></div>
        <div class="card-body">
          <div class="report-head"><img src="assets/img/logo.svg" alt=""><div><div class="small-caps">${esc(CONFIG.SCHOOL_NAME)}</div><h3 class="h5 fw-bold mb-0">${esc(r.title)}</h3></div></div>
          <div class="report-meta">${filt.length ? filt.map(([k, v]) => `<span><strong>${esc(k)}:</strong> ${esc(v)}</span>`).join('') : '<span>All records</span>'}<span><strong>Generated:</strong> ${UI.formatDate(r.generated_at, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} by ${esc(r.generated_by)}</span></div>
          ${r.student ? `<div class="report-meta"><span><strong>Program:</strong> ${esc(r.student.program || '—')}</span><span><strong>Year level:</strong> ${r.student.year_level ? UI.ordinal(r.student.year_level) : '—'}</span></div>` : ''}
          ${r.rows.length ? `<div class="table-wrap border rounded-3"><table class="table mb-0"><thead><tr><th>#</th>${r.columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>
            ${r.rows.map((row, i) => `<tr><td class="text-muted">${i + 1}</td>${r.columns.map((c) => `<td>${cell(c, row[c.key])}</td>`).join('')}</tr>`).join('')}
          </tbody></table></div>` : UI.empty({ icon: 'bi-file-earmark', title: 'No records match these filters', text: 'Change the term, date range or other filters and generate again.' })}
          <div class="report-summary">${r.summary.map((s) => `<div><span class="text-muted">${esc(s.label)}</span><strong>${esc(s.value)}</strong></div>`).join('')}</div>
        </div></div>`;
      if (!r.rows.length) return;
      $('#printBtn').onclick = printReport;
      $('#pdfBtn').onclick = () => exportPdf($('#pdfBtn'));
      $('#csvBtn').onclick = async () => {
        const b = $('#csvBtn'); UI.setBusy(b, true, 'Preparing…');
        try { const name = await Api.download(`/reports/${type.key}`, lastFilters); UI.toast(`${name} downloaded.`); } catch (err) { UI.toast(err.message, 'error'); } finally { UI.setBusy(b, false); }
      };
    }

    function printReport() {
      document.body.classList.add('printing-report');
      const done = () => { document.body.classList.remove('printing-report'); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done);
      window.print();
      setTimeout(done, 1000);
    }

    async function exportPdf(btn) {
      UI.setBusy(btn, true, 'Building PDF…');
      try {
        await UI.loadScript(JSPDF); await UI.loadScript(AUTOTABLE);
        const r = report; const wide = r.columns.length > 7;
        const doc = new window.jspdf.jsPDF({ orientation: wide ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
        const W = doc.internal.pageSize.getWidth();
        doc.setFillColor(29, 95, 209); doc.rect(0, 0, W, 6, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(74, 88, 120); doc.text(CONFIG.SCHOOL_NAME.toUpperCase(), 40, 34);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(20, 33, 61); doc.text(r.title, 40, 54);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(74, 88, 120);
        const meta = [...Object.entries(r.filters).map(([k, v]) => `${k}: ${v}`), `Generated: ${r.generated_at} by ${r.generated_by}`];
        doc.text(doc.splitTextToSize(meta.join('   ·   '), W - 80), 40, 70);
        doc.autoTable({
          startY: 90, head: [['#', ...r.columns.map((c) => c.label)]],
          body: r.rows.map((row, i) => [i + 1, ...r.columns.map((c) => String(row[c.key] ?? ''))]),
          styles: { fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [29, 95, 209] }, alternateRowStyles: { fillColor: [242, 247, 255] }, margin: { left: 40, right: 40 },
          didDrawPage: () => { doc.setFontSize(8); doc.setTextColor(133, 146, 173); doc.text(`SIRMS · ${r.title} · Page ${doc.internal.getNumberOfPages()}`, 40, doc.internal.pageSize.getHeight() - 20); },
        });
        let y = doc.lastAutoTable.finalY + 20;
        if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = 50; }
        doc.setFontSize(9); doc.setTextColor(20, 33, 61);
        doc.text(r.summary.map((s) => `${s.label}: ${s.value}`).join('     '), 40, y);
        doc.save(`${type.key}-${new Date().toISOString().slice(0, 10)}.pdf`);
        UI.toast('PDF downloaded.');
      } catch (err) { UI.toast(err.message || 'Could not create the PDF.', 'error'); } finally { UI.setBusy(btn, false); }
    }

    $('#typeList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-type]'); if (!b || b.dataset.type === type.key) return;
      type = types.find((t) => t.key === b.dataset.type); report = null;
      Router.setQuery({ type: type.key }); drawFilters(); $('#reportOutput').innerHTML = '';
    });
    $('#repForm').addEventListener('submit', (e) => { e.preventDefault(); generate(); });
    $('#repReset').onclick = () => { drawFilters(); $('#reportOutput').innerHTML = ''; };

    drawFilters();
    if (type.key !== 'grades' || (picker && picker.value)) await generate();
    else $('#reportOutput').innerHTML = `<div class="card">${UI.empty({ icon: 'bi-file-earmark-person', title: 'Choose a student', text: 'Search for a student above, then generate their grade report.' })}</div>`;
    return () => document.body.classList.remove('printing-report');
  }

  Router.register('/reports', { title: 'Reports', section: 'Administration', roles: ['admin', 'teacher'], render });
})();
