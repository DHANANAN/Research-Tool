# Getting into the portal

The sign-in page now provides **Explore demo**, **Sign in**, **Create organization**, **Join team**, and **Activate account**. The larger text and controls keep the classic dashboard layout readable on desktop and phone.

## Try the tool immediately

Select **Explore demo**, then choose a profile. You can also sign in using any of these public test credentials:

| Login ID | Profile | Public test password |
| --- | --- | --- |
| `guest-admin` | Create studies and questionnaires, publish practice versions, manage the demo team, inspect answers, export Excel | `ResearchDemo2026!` |
| `guest-surveyor-1` | Collect practice interviews and view this collector's answers | `ResearchDemo2026!` |
| `guest-surveyor-2` | A second collector for testing permissions and separate responses | `ResearchDemo2026!` |
| `guest-surveyor-3` | A third collector for testing team workflows | `ResearchDemo2026!` |

These are fictional playground profiles, not credentials for a real study. The playground works without an online API. It stores its accounts, organizations, questionnaires, and answers in this browser's IndexedDB. Another browser or phone has its own playground; these profiles do not provide shared cloud storage. Clearing browser storage removes this playground's data. Use invented answers only.

The example study contains **15 editable, unapproved SC/SC guides** and a separate published **SC / SC — fictional collection practice** form. All research guides start as drafts; only the practice form is ready for immediate collection. See the [questionnaire catalog](example-questionnaires.md).

To try the complete path:

1. Enter as **Guest administrator** and open **Questionnaires**. Create or edit a draft, review it, and publish a practice version.
2. Sign out and enter as **guest-surveyor-1**. Open **Field collection**, select a published questionnaire, and record invented answers. Required fields, branching, local drafts, and the submission queue remain active.
3. Return as **guest-admin** and open **Responses & exports**. Export the answers as a real `.xlsx` workbook, with typed answer columns, multiple-choice indicators, and a codebook.
4. Use the other two collector profiles to check that collectors see their own responses.

**Leave playground** returns to online sign-in and clears the offline session marker. Playground data remains available for a later demo visit.

## Create your own account and organization

Choose **Create organization**, fill in the organization name, your name, a unique login ID, and a password of at least 12 characters.

- For an online account shared through the research server, leave the playground checkbox unchecked. This requires the deployed Rust API described below.
- To try organization/account creation immediately in this browser, select **Create this organization in the local playground**. The new organization receives its own editable example study and cannot view another playground organization's responses.

An organization administrator can generate a team invitation from **Research team**. A collector selects **Join team**, enters the invitation, and chooses their own login ID and password. Individual administrator-created collector accounts can also use a one-time activation code.

## Why the Vercel page returned 404

The previous repository deployed a static frontend without a Vercel `/api` function or a connected Rust server. The organization form called `/api/auth/register`, which a static frontend alone cannot implement. There was also a Rust migration failure on older databases: an index was created before the new organization column existed. Both repository issues have been corrected.

The repository now includes `vercel.json` and `api/proxy.js`. They route online API requests to a persistent Rust server. An unset connection produces an explanatory `503` JSON response and a playground option, rather than an unexplained HTML 404. Public Vercel responses could not be inspected from this development machine because its egress proxy rejected that domain, so a working public deployment is not claimed by local checks alone.

For **researchtool-phi.vercel.app**, the deployment owner needs to:

1. Deploy this commit with Vercel's **Root Directory set to the repository root**, using the checked-in build configuration. A Vercel project configured to build only the `web` subdirectory does not include the root API function/configuration.
2. Deploy the Rust service using the supplied Docker/persistent-disk configuration, or another persistent host.
3. Set Vercel's server-side `RESEARCH_BACKEND_URL` to that service's HTTPS origin and redeploy. It must not point back to the Vercel frontend.

The public guest playground needs only the frontend deployment. Shared online account creation needs the second service. Full instructions, environment variables, storage requirements, and hosting cost notes are in [deployment.md](deployment.md).

For a local Rust-server sandbox, `RESEARCH_DEMO_ACCOUNTS=true ./scripts/start.sh` opts into the same four public test profiles in a separately owned demonstration organization. Normal installation does not seed public accounts. Existing study data and account passwords are preserved; a conflicting real login ID is refused rather than reused.
