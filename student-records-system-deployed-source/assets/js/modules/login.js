/* MODULE 1 — Login & Authentication (UI) */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const form = $('#loginForm'), btn = $('#loginBtn'), alertBox = $('#loginAlert');
  $('#yr').textContent = new Date().getFullYear();

  if (Auth.cached()) { location.replace('app.html' + Auth.homeFor(Auth.cached().role)); return; }

  const params = new URLSearchParams(location.search);
  const showAlert = (msg, type = 'danger') => {
    alertBox.className = `alert alert-${type} d-flex align-items-start gap-2`;
    alertBox.innerHTML = `<i class="bi ${type === 'danger' ? 'bi-exclamation-triangle-fill' : 'bi-info-circle-fill'} mt-1"></i><div></div>`;
    alertBox.lastElementChild.textContent = msg;
  };
  if (params.has('expired')) showAlert('Your session has ended. Please sign in again.', 'info');
  if (params.has('logged_out')) showAlert('You have been signed out securely.', 'info');

  $('#togglePw').addEventListener('click', (e) => {
    const pw = $('#password'); const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    e.currentTarget.innerHTML = `<i class="bi ${show ? 'bi-eye-slash' : 'bi-eye'}"></i>`;
    e.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  document.querySelectorAll('.demo-accounts button').forEach((b) => b.addEventListener('click', () => {
    form.identifier.value = b.dataset.id; form.password.value = b.dataset.pw;
    form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
    form.password.focus();
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.classList.add('d-none');
    let valid = true;
    ['identifier', 'password'].forEach((f) => {
      const empty = !form[f].value.trim(); form[f].classList.toggle('is-invalid', empty); if (empty) valid = false;
    });
    if (!valid) return;
    btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>Signing in…';
    try {
      const user = await Auth.login(form.identifier.value.trim(), form.password.value, form.remember.checked);
      location.replace('app.html' + Auth.homeFor(user.role));
    } catch (err) {
      showAlert(err.message);
      form.password.value = ''; form.password.focus();
      btn.disabled = false; btn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i>Sign in';
    }
  });
})();
