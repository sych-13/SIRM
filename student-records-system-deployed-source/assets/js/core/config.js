/* =========================================================
   App configuration — the ONLY place the frontend learns
   where the backend lives. Never put DB credentials or
   secret keys here; those stay in backend/config on the PHP host.
   ========================================================= */
window.CONFIG = Object.freeze({
  APP_NAME: 'SIRMS',
  SCHOOL_NAME: 'Student Information & Records Management System',

  // Base URL of the PHP REST API (backend/api). Absolute or relative:
  //   XAMPP:          http://localhost/sirms/backend/api
  //   Netlify proxy:  /api   (recommended in production; see docs/DEPLOYMENT.md)
  //   Direct:         https://api.your-school.edu/api
  API_BASE_URL: 'http://localhost/sirms/backend/api',

  // true  → screens run against js/data/fixtures.js through js/data/mock-server.js
  // false → every request goes to API_BASE_URL with the PHP session cookie
  // The PHP API currently serves auth + /meta (Milestone 2). Dashboards and
  // Student Management arrive in Milestone 3, so the mock stays on until then.
  USE_MOCK_API: true,

  MOCK_LATENCY_MS: [180, 420],
});
