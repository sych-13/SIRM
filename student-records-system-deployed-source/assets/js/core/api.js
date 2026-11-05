/* Spark-plan API facade backed by the Firebase client SDK and Firestore rules. */
(function () {
  'use strict';
  class ApiError extends Error {
    constructor(message, status, errors) { super(message || 'Request failed'); this.status = status || 0; this.errors = errors || {}; }
  }
  const request = (method, path, query, body) => window.FirebaseApi.handle(method, path, query || {}, body).catch((err) => {
    if (err.status === 401 && !path.startsWith('/auth/')) {
      window.Auth && Auth.clear();
      window.location.replace('index.html?expired=1');
    }
    throw err;
  });
  async function download(path, query = {}) {
    const data = await request('GET', path, { ...query, format: 'csv' });
    const blob = new Blob([data.content], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = data.filename || 'report.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return a.download;
  }
  window.ApiError = ApiError;
  window.Api = {
    get: (path, query) => request('GET', path, query),
    post: (path, body) => request('POST', path, {}, body ?? {}),
    put: (path, body) => request('PUT', path, {}, body ?? {}),
    del: (path) => request('DELETE', path, {}, {}),
    download,
  };
})();
