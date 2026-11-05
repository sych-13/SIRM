/* =========================================================
   API client — single gateway between UI modules and backend.
   Modules call Api.get/post/put/del with REST paths; this file
   decides whether to hit the PHP API or the in-browser mock.
   Response envelope (both modes):
     { success: bool, data: any, message?: string, errors?: {field: msg} }
   ========================================================= */
(function () {
  'use strict';

  class ApiError extends Error {
    constructor(message, status, errors) {
      super(message || 'Request failed');
      this.status = status || 0;
      this.errors = errors || {};
    }
  }

  const CSRF_KEY = 'sirms_csrf';

  async function httpRequest(method, path, { query, body } = {}) {
    // API_BASE_URL may be absolute (https://api.school.edu/api) or relative (/api via a Netlify proxy).
    const url = new URL(CONFIG.API_BASE_URL.replace(/\/$/, '') + path, window.location.origin);
    Object.entries(query || {}).forEach(([k, v]) => { if (v !== '' && v != null) url.searchParams.set(k, v); });
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const csrf = sessionStorage.getItem(CSRF_KEY);
    if (csrf && method !== 'GET') headers['X-CSRF-Token'] = csrf;

    let res;
    try {
      res = await fetch(url, { method, headers, credentials: 'include', body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
    }
    let json = {};
    try { json = await res.json(); } catch (_) { /* non-JSON error page */ }
    if (json.csrf_token) sessionStorage.setItem(CSRF_KEY, json.csrf_token);
    if (!res.ok || json.success === false) throw new ApiError(json.message || `Server error (${res.status})`, res.status, json.errors);
    return json.data;
  }

  async function mockRequest(method, path, { query, body } = {}) {
    const [min, max] = CONFIG.MOCK_LATENCY_MS;
    await new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
    const res = window.MockServer.handle(method, path, query || {}, body === undefined ? undefined : JSON.parse(JSON.stringify(body)));
    if (res.csrf_token) sessionStorage.setItem(CSRF_KEY, res.csrf_token);
    if (!res.success) throw new ApiError(res.message, res.status, res.errors);
    return JSON.parse(JSON.stringify(res.data ?? null));
  }

  const request = (method, path, opts) =>
    (CONFIG.USE_MOCK_API ? mockRequest : httpRequest)(method, path, opts).catch((err) => {
      if (err.status === 401 && !path.startsWith('/auth/')) {
        window.Auth && Auth.clear();
        window.location.replace('index.html?expired=1');
      }
      throw err;
    });

  // Server-generated file download (CSV reports). Returns the file name.
  async function download(path, query = {}) {
    const q = { ...query, format: 'csv' };
    let blob; let filename = 'report.csv';
    if (CONFIG.USE_MOCK_API) {
      const res = await request('GET', path, { query: q });
      blob = new Blob([res.content], { type: 'text/csv;charset=utf-8' }); filename = res.filename;
    } else {
      const url = new URL(CONFIG.API_BASE_URL.replace(/\/$/, '') + path, window.location.origin);
      Object.entries(q).forEach(([k, v]) => { if (v !== '' && v != null) url.searchParams.set(k, v); });
      let res;
      try { res = await fetch(url, { credentials: 'include', headers: { Accept: 'text/csv, application/json' } }); } catch (_) { throw new ApiError('Cannot reach the server. Check your connection and try again.', 0); }
      if (!res.ok) { let j = {}; try { j = await res.json(); } catch (_) { /* ignore */ } throw new ApiError(j.message || `Server error (${res.status})`, res.status, j.errors); }
      const m = /filename="?([^";]+)"?/i.exec(res.headers.get('Content-Disposition') || '');
      if (m) filename = m[1];
      blob = await res.blob();
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return filename;
  }

  window.ApiError = ApiError;
  window.Api = {
    get: (path, query) => request('GET', path, { query }),
    post: (path, body) => request('POST', path, { body: body ?? {} }),
    put: (path, body) => request('PUT', path, { body: body ?? {} }),
    del: (path) => request('DELETE', path, {}),
    download,
  };
})();
