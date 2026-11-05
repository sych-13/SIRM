/* SIRMS theme preference: lightweight, shared by sign-in and app screens. */
(function () {
  'use strict';
  const KEY = 'sirms_theme';
  const read = () => {
    try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; }
    catch (_) { return 'light'; }
  };
  let theme = read();

  function apply(next) {
    theme = next === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(KEY, theme); } catch (_) { /* storage may be disabled */ }
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const dark = theme === 'dark';
      button.innerHTML = `<i class="bi ${dark ? 'bi-sun-fill' : 'bi-moon-stars-fill'}" aria-hidden="true"></i><span class="theme-toggle-label">${dark ? 'Light' : 'Dark'} mode</span><span class="visually-hidden">Switch to ${dark ? 'light' : 'dark'} mode</span>`;
      button.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
      button.setAttribute('title', `Switch to ${dark ? 'light' : 'dark'} mode`);
      button.setAttribute('aria-pressed', String(dark));
    });
  }

  function init() {
    apply(theme);
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.addEventListener('click', () => apply(theme === 'dark' ? 'light' : 'dark'));
    });
  }

  document.documentElement.dataset.theme = theme;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
  window.addEventListener('storage', (event) => { if (event.key === KEY) apply(event.newValue); });
})();
