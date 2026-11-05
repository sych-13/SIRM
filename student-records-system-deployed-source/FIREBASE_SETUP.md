# SIRMS Firebase setup (Spark / $0 billing)

SIRMS signs in with Firebase Authentication and reads or writes Firestore directly under role-based Firestore Security Rules. This setup does not use Cloud Functions or require a billing account. Firebase web configuration is public by design; access to records is controlled by Authentication and Firestore Rules.

## 1. Firebase Console settings

Open project `sirm-cf763` in Firebase Console.

1. Keep the existing default Firestore database in `nam5`.
2. In **Authentication → Sign-in method**, enable **Email/Password**.
3. In **Authentication → Settings → Authorized domains**, make sure `sirm-cf763.web.app` is listed.
4. Do not upgrade to Blaze or link a billing account for this deployment.

## 2. Deploy from this repository

In PowerShell:

```powershell
Set-Location "C:\Users\icaru\OneDrive\Documents\ChatGPT\Student Information and Records Management System 2"
git pull origin main
Set-Location ".\student-records-system-deployed-source"
npx.cmd --yes firebase-tools@latest login
npx.cmd --yes firebase-tools@latest use sirm-cf763
npx.cmd --yes firebase-tools@latest deploy --only hosting,firestore:rules
```

The app URL is `https://sirm-cf763.web.app`. The deployment command intentionally excludes Cloud Functions.

## 3. Create an administrator account and profile

Create each Auth account and each account's Firestore profile from Firebase Console. For the first administrator:

1. In **Authentication → Users**, choose **Add user** and create the registrar's email and password. Copy the Auth **UID**.
2. In **Firestore Database → Data**, create collection `users`, with document ID `1`.
3. Add the profile fields below. Set `uid` to the copied Auth UID. Use the same email as Authentication.
4. Create collection `user_roles`, with document ID equal to that Auth UID. Add `uid` (string), `user_id` (number `1`), `role` (string `admin`), `status` (string `active`), and `student_id` (null).
5. Open the app and sign in using the email and password.

Example `users/1` fields:

| Field | Type | Example |
|---|---|---|
| `id` | number | `1` |
| `uid` | string | Auth UID |
| `name` | string | Registrar's name |
| `email` | string | Same Auth email, lowercase |
| `username` | string | Registrar's username, lowercase |
| `role` | string | `admin` |
| `status` | string | `active` |
| `title` | string | `University Registrar` |
| `student_id` | null | `null` |
| `created_at` | string | `2026-11-05 20:00:00` |
| `updated_at` | string | `2026-11-05 20:00:00` |
| `last_login_at` | null | `null` |

Never store passwords in Firestore.

## 4. Add other accounts

For each teacher or student, create the email/password account in **Authentication → Users**. Then add a numeric `users/{id}` profile with `id`, matching Auth `uid`, `name`, `email`, `username`, `role`, `status: active`, `title` (teacher) or `student_id` (student), and timestamps. Also add `user_roles/{uid}` with `uid`, `user_id`, `role`, `status`, and `student_id` (null except for a student). For active teachers, add `teacher_directory/{id}` with `id`, `name`, `title`, `role: teacher`, and `status: active`.

Create Auth accounts in Firebase Console. Password resets can be sent from the User Accounts screen or from Firebase Console. When updating a user's email, update Authentication first, then update their Firestore profile.

## 5. Record access fields

Firestore rules scope data by UID. Ensure documents have these fields:

- Each `students/{id}` document has `owner_uid` (the linked student's Auth UID or null) and `teacher_uids` (array of assigned teachers' Auth UIDs).
- Each `subjects/{id}` document has `teacher_uids` (array with the assigned teacher's Auth UID).
- Each `enrollments/{id}` and `academic_records/{id}` document has `owner_uid` and `teacher_uids` matching its student and subject assignment.
- Each `system_logs/{id}` entry written by a signed-in user includes `actor_uid`.

Admin writes through the app derive assignment UID fields for changed records. When importing existing data, add these fields before granting teacher/student accounts access. Existing demo fixture data is not copied to Firestore automatically.

## Free plan limits

Spark has no billing account and no usage charge. Free quotas still apply; if the project exceeds a Spark quota, Firebase may pause the affected service until the quota period resets. Monitor Firebase Console **Usage and billing**. Cloud Functions are not part of this deployment.
