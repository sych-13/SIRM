# SIRMS — Student Information and Records Management System

SIRMS is a role-based student information and academic records system for administrators, teachers, and students.

## Live sites

- Firebase Hosting: https://sirms-38918.web.app
- GitHub Pages: https://sych-13.github.io/SIRM/
- Firebase project: `sirm-cf763`

## Main features

- Student profile management
- Enrollment management
- Subject catalog and starter subject templates
- Academic records and grade encoding
- Role-based dashboards
- Reports and CSV/PDF-ready views
- User management and activity logs
- Light/dark mode and loading skeletons
- Firebase email verification and password reset emails

## User roles

### Administrator / Registrar

The administrator manages students, subjects, teachers, enrollments, academic records, reports, user accounts, and activity logs.

### Teacher / Faculty

Teachers can view assigned subjects and students, encode grades, add remarks, and access assigned reports. They cannot edit the whole database.

### Student

Students can view only their own profile, enrollment, academic records, and grades. A student account must be linked to an existing student record.

## Recommended setup sequence

1. Create a student record from **Students**.
2. Add subjects from **Subjects** or use **Add starter subjects**.
3. Create a teacher account from **User Management**.
4. Assign the teacher to the correct subject.
5. Create the student's enrollment.
6. Create the student's academic record.
7. Create a student account and link it to the student record.
8. Let the user sign in and complete email verification.

## Authentication

Firebase Authentication uses Email/Password sign-in. New accounts receive a verification email. Existing unverified accounts receive another verification email when they sign in.

The password is stored only by Firebase Authentication and is never saved in Firestore.

## Firestore collections

- `users` — public SIRMS user profiles
- `user_roles` — active role records keyed by Firebase UID
- `teacher_directory` — teacher names used by record views
- `students` — student profiles
- `subjects` — subject catalog
- `enrollments` — enrollment records
- `academic_records` — grades and academic records
- `system_logs` — audit/activity logs

Access is controlled by `firestore.rules`. Teachers require matching `teacher_uids`; students require matching `owner_uid`.

## Technology stack

- HTML5, CSS3, and vanilla JavaScript
- Bootstrap 5.3.3 and Bootstrap Icons
- Firebase JavaScript SDK
- Firebase Authentication
- Cloud Firestore
- Firebase Hosting Spark plan
- GitHub Pages through GitHub Actions
- Firebase Emulator support for local testing

## Project structure

```text
student-records-system-deployed-source/
├── index.html                 # Sign-in page
├── app.html                   # Authenticated application shell
├── assets/css/app.css         # Shared UI and themes
├── assets/js/core/            # Auth, Firebase, router, API, theme
├── assets/js/modules/         # Dashboard and feature pages
├── assets/js/data/            # Firestore adapter, validation, fixtures
├── firestore.rules            # Firestore security rules
└── firebase.json              # Firebase Hosting configuration
```

## Local setup

From the repository root:

```powershell
git clone https://github.com/sych-13/SIRM.git
Set-Location ".\student-records-system-deployed-source"
npx.cmd --yes firebase-tools@latest login
npx.cmd --yes firebase-tools@latest use sirm-cf763
```

For local Firebase Emulator testing, start the Auth and Firestore emulators configured in `firebase.json`, then open the local hosting URL.

## Deploying changes

Commit and push source changes:

```powershell
git add .
git commit -m "Describe the change"
git push origin main
```

GitHub Actions automatically deploys GitHub Pages. To deploy both Firebase Hosting sites manually:

```powershell
npx.cmd --yes firebase-tools@latest deploy --only hosting --project sirm-cf763
```

To deploy Firestore rules as well:

```powershell
npx.cmd --yes firebase-tools@latest deploy --only hosting,firestore:rules --project sirm-cf763
```

## Security notes

- Never store passwords in Firestore.
- Do not grant broad collection access to make a page easier to build.
- Production records must come from Firestore, not demo fixtures or localStorage.
- Keep the Firebase Spark plan quotas under monitoring.
