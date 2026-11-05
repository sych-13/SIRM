/* REST client for the Firebase Cloud Functions API. */
(function () {
  'use strict';

  class ApiError extends Error {
    constructor(message, status, errors) {
      super(message || 'Request failed');
      this.status = status || 0;
      this.errors = errors || {};
    }
  }

  async function httpRequest(method, path, { query, body } = {}) {
    const url = new URL(CONFIG.API_BASE_URL.replace(/\/$/, '') + path, window.location.origin);
    Object.entries(query || {}).forEach(([k, v]) => { if (v !== '' && v != null) url.searchParams.set(k, v); });
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const firebase = window.SIRMS_FIREBASE;
    const current = firebase && firebase.auth.currentUser;
    if (current && path !== '/auth/login') headers.Authorization = `Bearer ${await current.getIdToken()}`;

    let res;
    try {
      res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
    }
    let json = {};
    try { json = await res.json(); } catch (_) { /* non-JSON error page */ }
    if (!res.ok || json.success === false) throw new ApiError(json.message || `Server error (${res.status})`, res.status, json.errors);
    return json.data;
  }
  const request = (method, path, opts) => httpRequest(method, path, opts).catch((err) => {
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
    const url = new URL(CONFIG.API_BASE_URL.replace(/\/$/, '') + path, window.location.origin);
    Object.entries(q).forEach(([k, v]) => { if (v !== '' && v != null) url.searchParams.set(k, v); });
    let res;
    const headers = { Accept: 'text/csv, application/json' };
    const current = window.SIRMS_FIREBASE && window.SIRMS_FIREBASE.auth.currentUser;
    if (current) headers.Authorization = `Bearer ${await current.getIdToken()}`;
    try { res = await fetch(url, { headers }); } catch (_) { throw new ApiError('Cannot reach the server. Check your connection and try again.', 0); }
    if (!res.ok) { let j = {}; try { j = await res.json(); } catch (_) { /* ignore */ } throw new ApiError(j.message || `Server error (${res.status})`, res.status, j.errors); }
    const m = /filename="?([^";]+)"?/i.exec(res.headers.get('Content-Disposition') || '');
    if (m) filename = m[1];
    blob = await res.blob();
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
