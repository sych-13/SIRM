/* =========================================================
   App shell bootstrap: auth guard, role-based sidebar, topbar.
   ========================================================= */
(function () {
  'use strict';

  // Sidebar per role. Add `soon: true` to flag a module that is not built yet.
  const NAV = {
    admin: [
      { label: 'Overview', items: [{ href: '#/dashboard', icon: 'bi-grid-1x2', text: 'Dashboard' }] },
      { label: 'Records', items: [
        { href: '#/students', icon: 'bi-people', text: 'Students' },
        { href: '#/enrollment', icon: 'bi-journal-check', text: 'Enrollment' },
        { href: '#/academic-records', icon: 'bi-mortarboard', text: 'Academic Records' },
        { href: '#/subjects', icon: 'bi-book', text: 'Subjects' },
        { href: '#/search', icon: 'bi-search', text: 'Search & Retrieval' },
      ] },
      { label: 'Administration', items: [
        { href: '#/reports', icon: 'bi-file-earmark-bar-graph', text: 'Reports' },
        { href: '#/users', icon: 'bi-person-gear', text: 'User Management' },
        { href: '#/logs', icon: 'bi-clock-history', text: 'Activity Logs' },
      ] },
    ],
    teacher: [
      { label: 'Overview', items: [{ href: '#/dashboard', icon: 'bi-grid-1x2', text: 'Dashboard' }] },
      { label: 'Teaching', items: [
        { href: '#/students', icon: 'bi-people', text: 'Students' },
        { href: '#/grades', icon: 'bi-pencil-square', text: 'Grade Encoding' },
        { href: '#/search', icon: 'bi-search', text: 'Search & Retrieval' },
        { href: '#/reports', icon: 'bi-file-earmark-bar-graph', text: 'Reports' },
      ] },
    ],
    student: [
      { label: 'My Records', items: [
        { href: '#/dashboard', icon: 'bi-grid-1x2', text: 'Dashboard' },
        { href: '#/profile', icon: 'bi-person-vcard', text: 'My Profile' },
        { href: '#/my-enrollment', icon: 'bi-journal-check', text: 'My Enrollment' },
        { href: '#/my-grades', icon: 'bi-mortarboard', text: 'My Grades' },
      ] },
    ],
  };
  const ROLE_LABEL = { admin: 'Administrator / Registrar', teacher: 'Teacher / Faculty', student: 'Student' };

  function renderSidebar(user) {
    const nav = (NAV[user.role] || []).map((g) => `<div class="nav-label">${g.label}</div>` +
      g.items.map((i) => `<a href="${i.href}"><i class="bi ${i.icon}"></i><span>${i.text}</span>${i.soon ? '<span class="badge-soon">SOON</span>' : ''}</a>`).join('')).join('');
    UI.$('#sidebarNav').innerHTML = nav;
    const [first, ...rest] = user.name.replace(/^(Prof\.|Dr\.)\s*/, '').split(' ');
    UI.$('#sidebarUser').innerHTML = `
      <span class="avatar">${UI.esc(UI.initials(first, rest.pop()))}</span>
      <div class="meta"><strong>${UI.esc(user.name)}</strong><span>${ROLE_LABEL[user.role]}</span></div>
      <button class="btn btn-icon" id="logoutBtn" title="Sign out" aria-label="Sign out"><i class="bi bi-box-arrow-right"></i></button>`;
    UI.$('#logoutBtn').onclick = async () => {
      if (await UI.confirm({ title: 'Sign out?', message: 'You will need to sign in again to access student records.', confirmText: 'Sign out' })) Auth.logout();
    };
  }

  function wireTopbar(user) {
    UI.$('#navToggle').onclick = () => UI.$('.app').classList.toggle('nav-open');
    UI.$('.sidebar-backdrop').onclick = () => UI.$('.app').classList.remove('nav-open');
    const form = UI.$('#globalSearch');
    if (user.role === 'student') { form.remove(); return; }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = form.elements.q.value.trim();
      Router.go(`#/search${q ? '?q=' + encodeURIComponent(q) : ''}`);
    });
  }

  async function boot() {
    if (!Auth.cached()) { location.replace('index.html'); return; }
    const user = await Auth.me(); // server re-validates the session
    if (!user) { location.replace('index.html?expired=1'); return; }
    renderSidebar(user);
    wireTopbar(user);
    const verificationNotice = sessionStorage.getItem('sirms_verification_notice');
    if (verificationNotice) {
      sessionStorage.removeItem('sirms_verification_notice');
      setTimeout(() => UI.toast(verificationNotice, 'info'), 250);
    }
    UI.$('#roleBadge').textContent = ROLE_LABEL[user.role];
    window.addEventListener('hashchange', () => Router.resolve());
    Router.resolve();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
