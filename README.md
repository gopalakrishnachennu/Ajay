# CampaignOS

CampaignOS handles form creation, link distribution, response collection, secure document applications, OCR-assisted Form 18 preparation, follow-up status, an owner activity trail, and analytics for the Telangana graduate voter drive. It prepares an application for review; it does not submit to the official election portal.

## Live Firebase project

- Hosting: https://ajaychevula-d2a22.web.app
- Admin SaaS: https://ajaychevula-d2a22.web.app/?admin=1&v=20261013n
- Public voter form: https://ajaychevula-d2a22.web.app/?form=graduate-voter&link=link_main&v=20261013n
- Current two-page application: https://ajaychevula-d2a22.web.app/?apply=form18&link=link_main&v=20261013n
- Unreleased OCR beta: https://ajaychevula-d2a22.web.app/?apply=form18-beta&link=link_main&v=20261013n
- Firebase project: `ajaychevula-d2a22`
- Firestore database: `(default)`, `asia-south1` (Mumbai), free tier, deletion protection enabled
- Owner login: Google account `gopalakrishnachennu@gmail.com`

The live site uses Firebase Hosting, Firestore, private Cloud Storage, Google Authentication for the owner workspace, invisible anonymous sessions for voter drafts, and one on-demand OCR Cloud Function. Only the owner account can view all responses, applications, and documents. The public form does not request a visitor login or OTP.

Change the owner email in both `dist/firebase-mode.js` and `firestore.rules`, then deploy the updated rules and Hosting files if a different account should manage the project. The signed-in Google account must have a verified email address.

## Local development

```bash
npm start
```

Open http://127.0.0.1:4173. Local mode uses [server.js](server.js) and `data/db.json`, with the same form and response workflow. The runtime database is ignored by Git and initialized from [data/seed.json](data/seed.json) when absent. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the environment before sharing the local server. The local defaults are `admin@campaignos.local` and `change-this-password` for development only. `NODE_ENV=production` refuses to start with the default password.

```bash
npm run test:e2e
npm run test:rules
```

The end-to-end test uses its own temporary database. The rules test runs against the Firestore emulator.

## Deploy Firebase changes

```bash
firebase deploy --only firestore:rules,storage,functions,hosting --project ajaychevula-d2a22
```

The initial form and link are seeded with `node scripts/seed-firebase.mjs`. The script checks whether they already exist and does not overwrite live records. `npm run sync:template` updates only the initial form's question template; use it deliberately after reviewing changes.

## Data flow

1. An owner creates or edits a form. Questions are stored in `forms`.
2. An owner creates a distribution link in `links`. Each link has a distinct URL and can be assigned to an outreach channel.
3. Public taps produce `view`, `start`, and `share` events in `events`.
4. Already-registered voters create a lightweight `submissions` record.
5. Registration-help voters receive an invisible anonymous session, private application record, direct Storage uploads, on-demand Cloud Vision OCR with visible progress after “Check extracted details”, and a generated preparation PDF.
6. Owner actions write to `audit`. The owner workspace reads these records for the funnel, activity trail, secure applications and follow-ups.

Already-registered people are asked for status, full name, mobile number, and mandal. The currently released registration-help path has two pages. Page 1 collects full name, father's name, gender, DOB, MLC constituency, Assembly constituency, district, email and mobile. Page 2 collects the configured documents and submits them for authorised admin review. Every document input accepts an image or PDF (up to 15 MB); compatible phone images are normalized to JPEG when needed. Voter-side OCR is disabled in this released flow. The complete three-step Cloud Vision/Form 18 experience is preserved at the unreleased beta route for later review. CSV and Google Sheets features are intentionally excluded.

Browser forms cannot read the phone's SIM number. The phone field uses `type="tel"`, a telephone keyboard, and `autocomplete="tel-national"` so Android and iPhone browsers can offer a saved number when available. Visitors can review or edit it.

## Operational limits

The Firebase project uses Blaze billing, private Cloud Storage and one callable OCR function. It has no Storage trigger, queue, scheduler, voter OTP, CSV or Google Sheets integration. OCR is invoked explicitly by **Check extracted details** after uploads finish, preserves the highest-confidence value when documents disagree, and never overwrites voter-confirmed data. When Aadhaar is voluntarily provided, the complete 12-digit number is stored only inside the private application and prepared Form 18; it is excluded from analytics, logs and ordinary admin summaries. A verified retention/deletion policy and official Form 18 handoff are still required before a live campaign rollout. Counts are event totals, not guaranteed unique people. “No visits” means a created distribution link has no recorded open; a website cannot know whether an unopened link failed in someone else's messaging app.

The agreed MVP boundary and later document/OCR path are recorded in [docs/MVP_ARCHITECTURE.md](docs/MVP_ARCHITECTURE.md).
