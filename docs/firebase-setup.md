# Firebase setup: no Docker or paid backend

This option keeps your Vercel website and uses Firebase Authentication for accounts and Cloud Firestore for shared studies and responses. Excel/CSV files are generated in the browser. The PC can be turned off after deployment; other users access the website independently.

Use Firebase's **Spark** plan for this pilot. It has usage and storage quotas, not unlimited hosting. This implementation uses email/password authentication and Firestore only. It does not require Cloud Functions, Cloud Run, Cloud Storage, phone authentication, a service-account key, or a billing upgrade. If the console asks to enable billing for a feature, stop and check that you are following the Authentication/Firestore steps below. Firebase can change plan limits; check the console Usage page. Quota exhaustion can interrupt collection until it resets.

## Your supplied project is already configured in the code

The public web settings for **`research-too1`** are checked into `web/src/firebase-config.json`, and Firebase is the default for this repository now. No Analytics is initialized. You can skip creating another project or copying settings into Vercel: open **research-too1**, enable Email/Password, create Firestore and publish the rules, add your authorized domain, then redeploy the latest main commit. Existing Vercel `VITE_*` values override this file; remove stale values or set them to the same project. Set `VITE_BACKEND=rust` explicitly to use the optional Rust backend.

The instructions below also document setup for anyone using a different project.

## 1. Create the Firebase project

1. Open https://console.firebase.google.com/ and sign in with your Google account.
2. Choose **Create a project** (or open the existing project you intend to use).
3. Give it a name such as `Research Tool`. You can disable Google Analytics for this application.
4. Complete creation. Confirm the project is on the **Spark** plan.
5. Open the gear beside Project Overview → **Project settings**. Record the **Project ID**. This is not necessarily the display name.

## 2. Add a web app

1. In Project Overview, click the **web icon `</>`** (or Project settings → Your apps → Add app → Web).
2. Name it `Research Tool Web`. Firebase Hosting setup is unnecessary because Vercel already hosts the website.
3. Register the app. In the displayed `firebaseConfig` object, find **apiKey**, **authDomain**, **projectId**, and **appId**.
4. Keep that screen open. You will copy these four values into Vercel in step 5. Do not copy quotation marks or trailing commas.

These four values are public browser configuration, not administrator credentials. Security depends on Authentication and the Firestore rules below. Never put service-account JSON or a private key in Vercel variables beginning with `VITE_`.

## 3. Enable email accounts

1. Firebase sidebar → **Build → Authentication → Get started**.
2. Open **Sign-in method** (sometimes Providers).
3. Select **Email/Password**, enable the email/password option, and save. Email-link sign-in is not needed.
4. Authentication → Settings → **Authorized domains** → Add domain → enter `researchtool-chi.vercel.app` without `https://` or a trailing slash. Add another domain only when you actually use it.
5. The app's login ID in cloud mode is the person's **email address**. Each surveyor uses their own email/password. Password reset is available on the sign-in screen.

## 4. Create Firestore and publish its access rules

1. Firebase sidebar → **Build → Firestore Database → Create database**.
2. Choose the standard Firestore database, database ID **`(default)`**. Choose a suitable location for your users and institutional requirements; the location cannot be casually changed afterward.
3. Choose **Production mode**, then create the database. Do not use permissive test mode.
4. Open Firestore's **Rules** tab.
5. Open this repository's `firestore.rules` on GitHub. Click **Raw**, then select and copy the entire file.
6. Replace the editor contents with that file and click **Publish**. Do not wrap it in Markdown backticks.
7. You do not need to create collections manually. The app creates `users`, `organizations`, `projects`, `forms`, `invites`, and `responses` during normal use.

The rules restrict access by organization and role, keep published question definitions immutable, prevent collector impersonation, and make submitted responses append-only. Invitations contain random codes and expire after seven days. Administrators can revoke a code by deleting its document under `invites` in the Firebase console; existing memberships remain valid.

The deployed rules are essential. Never fix a permission error by allowing all reads and writes.

## 5. Connect Vercel

1. Open https://vercel.com/dashboard and select the project serving **researchtool-chi.vercel.app**.
2. Open **Settings → Environment Variables**.
3. Add these five variables for **Production**. If you use Preview deployments, deliberately choose whether those should access this same Firebase project; a separate project is preferable for testing.

| Variable | Value |
| --- | --- |
| `VITE_BACKEND` | `firebase` |
| `VITE_FIREBASE_API_KEY` | `apiKey` from Firebase web app config |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` from that config |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` from that config |
| `VITE_FIREBASE_APP_ID` | `appId` from that config |

4. Keep Vercel **Root Directory** at the repository root. Build command: `npm run build`. Output Directory: `dist`. The repository contains `vercel.json` with these settings.
5. Deploy the latest `main` commit. If changing settings on an existing deployment, go to **Deployments → latest deployment → Redeploy**. Environment settings are read at build time and require a new build.
6. Open the website after the deployment is Ready. Close old app tabs and reopen to let the service worker update. A new private/incognito window is a convenient way to check a fresh deployment.

In Firebase mode, normal website operations call Firebase directly. `RESEARCH_BACKEND_URL` is not used. The old `/api/health` Vercel proxy can still report an unavailable Rust server; that route is not the Firebase readiness check. Verify the actual account and data flows below instead.

## 6. First administrator and practice study

1. On the website, leave **Explore demo / playground** if active, then choose **Create organization**.
2. Enter your organization name, your name, your **email address in the Login ID field**, and a password of at least 12 characters.
3. Submit once and wait. Fifteen SC/SC draft templates should appear in your new organization. They remain editable examples requiring researcher review.
4. If Authentication created the email account but the Firestore step failed, fix the rules/configuration and repeat Create organization using the **same email and password**. The app resumes account setup; do not manually edit user roles.
5. Create a small fictional questionnaire, review it, and publish it.

## 7. Invite a surveyor

1. Open **Research team** and use the **organization invitation** panel.
2. Enter a label, generate a code, and copy it. Cloud mode generates a random secure code even if a custom code was typed.
3. In another browser profile or private window, choose **Join organization**.
4. Enter the code, the surveyor's name, their own email in Login ID, and a password.
5. In this pilot, surveyors can access all published studies in their organization. Use separate organizations where teams must be isolated. The older individual activation-code form is for the Rust/local-demo path; cloud invitations use Join organization.
6. Submit a fictional response. Sign back into the administrator account and check **Responses & exports**. The surveyor should see only their own responses; the administrator sees the organization's project responses.

## 8. Export and verify shared data

1. As administrator, open **Responses & exports** and choose a questionnaire if required.
2. **Export Excel** creates an XLSX workbook with a separate sheet per published version and a codebook. **Export CSV** creates one question per row, with typed JSON in `answer_json`.
3. Include a zero, false, leading-zero text identifier (for example `0007`), Unicode text, and multiple choice in your fictional test. Compare the downloaded values with the entered values.
4. Open the app on a second device and sign in. Confirm that the response is visible. This proves it was saved to Firestore, rather than the local playground.
5. Test saving an offline draft, reconnecting, and submitting. A pending response is confirmed only after Firebase acknowledges it. Firestore transactions require connectivity; the existing IndexedDB queue retains offline work for retry.
6. In the Firebase console, check **Firestore → Data → responses** and the **Usage** page. Download exports regularly. Browser drafts and Firestore data are separate.

## What works and what remains limited

Implemented: email login/reset, account/organization registration, expiring organization invites, organization isolation, study editing, draft/publish/close/revise, surveyor collection, existing offline queue, duplicate-safe receipts, server-recorded receipt timestamps, response visibility, XLSX/CSV export, and editable SC/SC example guides. Public guest accounts remain a **browser-local playground**; they do not give access to Firebase organizations.

PDF extraction is not included in this free cloud path. Copy the text from a PDF into the questionnaire text-import tab and review it. Scanned PDFs need a separate OCR tool. Existing Rust/SQLite accounts and answers are not automatically migrated to Firestore. Export existing data before any later migration.

Firestore rules enforce ownership, role, publication state, immutability and structural record checks. Arbitrary questionnaire answer validation (required fields, ranges, choice codes and conditions) runs in the browser. A modified client could bypass those questionnaire checks; the rules are not a replacement for the Rust validator. Treat the Firebase version as a pilot until your required validation and access workflows have been reviewed. Concurrent revisions can have the same displayed version number; immutable form IDs keep their exports separate. Numbers supplied as JavaScript numbers have JavaScript precision limits; use text questions for identifiers or very large exact numbers.

Exports load a project's responses into browser memory. Large datasets and repeated reads consume quota. This pilot has no automated cloud backup, advanced membership administration, or automatic data-retention system. Do not assume it has been verified on your live project until completing steps 6–8.

## Troubleshooting

- **Still says `RESEARCH_BACKEND_URL` is missing:** the website is running the old/Rust configuration. Check `VITE_BACKEND=firebase`, deploy current main again, and open a fresh private window.
- **Firebase setup incomplete:** one of the four web settings is absent. Compare the variable names exactly and redeploy.
- **Email provider disabled:** enable Email/Password under Authentication.
- **Access denied:** confirm the published Rules match `firestore.rules`, the database is `(default)`, and the Vercel project ID matches the Firebase console project. Do not weaken the rules.
- **Account already belongs to an organization:** choose Sign in. One email belongs to one organization in this pilot.
- **Quota reached:** check Firestore Usage and Firebase's current Spark limits. The application cannot bypass quotas. Avoid enabling paid services just to dismiss a warning.
- **Firebase requests blocked:** browser extensions, network filtering or institutional policies may block Google endpoints. Test an approved network and inspect the browser's error.

## Developer checks (not needed for console setup)

The tests are in `tests/firebase`. Install their separate dependencies and run `npm test` there with Node 22 and Java available. This starts the local Firestore emulator using a demo project ID, not a real database. GitHub Actions includes this rules check. Our development environment blocked Google's emulator download, so rules execution was not verified here; inspect the Firebase rules CI job before using production data.

For frontend development use the root `.env.local` with the five settings, then `npm run dev`. To connect to local Auth/Firestore emulators, additionally set `VITE_FIREBASE_EMULATORS=true`; that switch is accepted only by Vite's development mode. Production builds always use real Firebase endpoints.
