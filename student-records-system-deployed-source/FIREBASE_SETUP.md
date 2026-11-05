# Firebase setup for SIRMS

The app uses Firebase Authentication for credentials and a Cloud Functions API backed by Cloud Firestore. The browser never reads or writes Firestore directly; `firestore.rules` denies direct client access and the API checks the Firebase ID token and user role.

## One-time project setup

1. In Firebase Console, open project `sirm-cf763`.
2. Create a Cloud Firestore database. Choose the Singapore (`asia-southeast1`) location if the database has not been created yet. A Firestore database's location cannot be changed after creation.
3. In Authentication, enable **Email/Password**.
4. Make sure the project uses the **Blaze** plan before deploying Cloud Functions.
5. Install Node.js 22 and Firebase CLI, then from this directory run:

   ```powershell
   npm install --global firebase-tools
   firebase login
   firebase use sirm-cf763
   Set-Location functions
   npm install
   Set-Location ..
   firebase functions:secrets:set SIRMS_BOOTSTRAP_SECRET
   firebase deploy --only firestore:rules,functions
   ```

   Enter a long random value when prompted for the bootstrap secret. Keep it private. Cloud Functions deploys to `asia-southeast1`; `config.js` already points the frontend to that API URL.

## Create the first administrator

After deployment, use PowerShell to send one request. Replace the example values and secret with your own. The password must be at least eight characters and include uppercase, lowercase, and a number.

```powershell
$bootstrapSecret = Read-Host "Bootstrap secret"
$adminPassword = Read-Host "New administrator password" -AsSecureString
$adminPasswordText = [System.Net.NetworkCredential]::new('', $adminPassword).Password
$body = @{
  name = "School Registrar"
  email = "registrar@your-school.edu"
  username = "registrar"
  password = $adminPasswordText
} | ConvertTo-Json
Invoke-RestMethod -Method Post `
  -Uri "https://asia-southeast1-sirm-cf763.cloudfunctions.net/api/setup/bootstrap-admin" `
  -Headers @{ "x-sirms-bootstrap-secret" = $bootstrapSecret } `
  -ContentType "application/json" -Body $body
Remove-Variable adminPasswordText, adminPassword, bootstrapSecret
```

Bootstrap succeeds only once, while there is no administrator profile in Firestore. Afterward, sign in at the app with the email or username and password you created. The administrator can create teacher and student accounts in User Management.

## Firestore data

The API stores records in `users`, `students`, `enrollments`, `subjects`, `academic_records`, and `system_logs`. Existing browser demo fixtures are not copied automatically. Create or import real student and academic records through the app after the first admin signs in.

The first Functions adapter reuses the existing module validation and report logic by loading the six collections into the request handler. This keeps the current screens compatible, but reads the collections for each API request. For a larger live school dataset, replace those whole-collection reads with indexed, role-scoped Firestore queries before production rollout.

Never add Firebase service-account JSON files, bootstrap secrets, or real student information to GitHub. The Firebase web config in `assets/js/core/config.js` is client configuration; data access is protected by API authentication and Firestore rules.
