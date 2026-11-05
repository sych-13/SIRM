/* =========================================================
   Hash router with role guards.
   Modules register themselves:  Router.register('/students', {...})
   ========================================================= */
(function () {
  'use strict';
  const routes = {};
  let currentCleanup = null;

  const parse = () => {
    const raw = (location.hash || '#/dashboard').slice(1);
    const [path, qs] = raw.split('?');
    return { path: path || '/dashboard', query: Object.fromEntries(new URLSearchParams(qs || '')) };
  };

  window.Router = {
    register(path, def) { routes[path] = def; },
    routes,
    go(hash) { if (location.hash === hash) this.resolve(); else location.hash = hash; },
    setQuery(query, replace = true) {
      const { path } = parse();
      const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)).toString();
      const hash = `#${path}${qs ? '?' + qs : ''}`;
      if (replace) history.replaceState(null, '', hash); else location.hash = hash;
    },
    async resolve() {
      const user = Auth.cached();
      const { path, query } = parse();
      const def = routes[path];
      const container = document.getElementById('view');
      if (typeof currentCleanup === 'function') { try { currentCleanup(); } catch (_) { /* ignore */ } }
      currentCleanup = null;

      if (!def) { this.go(Auth.homeFor(user.role)); return; }
      if (def.roles && !def.roles.includes(user.role)) {
        UI.toast('You do not have access to that page.', 'error');
        this.go(Auth.homeFor(user.role)); return;
      }
      const title = typeof def.title === 'function' ? def.title(user) : def.title;
      document.title = `${title} · ${CONFIG.APP_NAME}`;
      document.getElementById('pageTitle').textContent = title;
      document.getElementById('pageCrumb').textContent = def.section || 'Overview';
      UI.$$('.sidebar-nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href').split('?')[0] === `#${path}`));
      document.querySelector('.app').classList.remove('nav-open');
      window.scrollTo(0, 0);
      container.classList.remove('page-enter');
      container.innerHTML = UI.pageSkeleton();
      const render = typeof def.render === 'function' ? def.render : def.render[user.role];
      const page = render(container, { query, user });
      container.classList.add('page-enter');
      currentCleanup = await page;
    },
  };
})();
