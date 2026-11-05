# Deploy SIRMS to Firebase

SIRMS uses Firebase Authentication for sign-in and Cloud Firestore behind an authenticated Cloud Functions API. The browser never reads or writes Firestore directly. The deployed Firestore rules deny direct client access.

## 1. Check project settings

Open Firebase project `sirm-cf763`.

- A default Cloud Firestore database already exists in `nam5`. Keep it; its location cannot be changed. The API is configured for `us-central1`, the nearest supported Functions region for `nam5`.
- Under **Authentication → Sign-in method**, enable **Email/Password**.
- Cloud Functions deployment requires the **Blaze** plan.

## 2. Deploy Hosting, rules, and API

Open PowerShell and run:

```powershell
Set-Location "C:\Users\icaru\OneDrive\Documents\ChatGPT\Student Information and Records Management System 2"
git pull origin main
Set-Location ".\student-records-system-deployed-source"
npm install --global firebase-tools
firebase login
firebase use sirm-cf763
Set-Location ".\functions"
npm install
Set-Location ..
firebase deploy --only hosting,firestore:rules,functions
```

The Firebase CLI prints the Hosting URL after deployment. The API endpoint is `https://us-central1-sirm-cf763.cloudfunctions.net/api`.

## 3. Create the first administrator

The app does not allow public account registration. Create the first admin from Firebase Console:

1. In **Authentication → Users**, click **Add user**. Enter the registrar's email and a strong password, then save.
2. Copy the new user's **UID**.
3. Open **Firestore Database → Data**. Create a collection named `users`; set the document ID to `1`.
4. Add these fields. Use the field types shown:

   | Field | Type | Value |
   |---|---|---|
   | `id` | number | `1` |
   | `uid` | string | The Auth UID you copied |
   | `name` | string | Registrar's display name |
   | `email` | string | Same email used in Authentication, lowercase |
   | `username` | string | Registrar's username, lowercase |
   | `role` | string | `admin` |
   | `status` | string | `active` |
   | `title` | string | `University Registrar` |
   | `student_id` | null | `null` |
   | `created_at` | string | Current date/time, e.g. `2026-11-05 20:00:00` |
   | `updated_at` | string | Same date/time format |
   | `last_login_at` | null | `null` |

5. Visit the Hosting URL and sign in with that email or username and password.

The Auth UID must exactly match the `uid` field in Firestore. Do not add a `password` field to Firestore.

## Notes

Existing browser demo data is not automatically copied to Firestore. Add actual student and academic records after signing in as admin.

The current API adapter reuses the existing module validation and report logic by loading the six collections for each API request. That keeps the screens compatible for the current project scale; larger datasets should move to indexed, role-scoped Firestore queries before production use.

Never commit service-account JSON files or real student information. The Firebase web config in `assets/js/core/config.js` is client configuration; Firestore access is restricted by server-side role checks and Firestore rules.
