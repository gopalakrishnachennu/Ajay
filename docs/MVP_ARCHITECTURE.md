# CampaignOS MVP architecture

## Product boundary

CampaignOS creates voter-intake forms, distributes trackable links, collects responses, and helps the campaign team follow up. It does not submit Form 18 to the Election Commission and must not present a campaign submission as official voter registration.

## Small production stack

- Firebase Hosting serves the public form and owner workspace.
- Firestore stores forms, links, responses, private application drafts, OCR field metadata, event counts, and the owner audit trail.
- Cloud Storage keeps identity documents in per-session private paths.
- Google Authentication protects the owner workspace.
- Voters receive an invisible anonymous Firebase session; there is no login screen and no OTP.
- The browser writes allowed public records through Firestore security rules.

The product has one on-demand callable OCR function. It has no background triggers, queues, schedulers, separate analytics platform, CSV export or Google Sheets integration.

## Public journey

1. A voter opens a distribution link.
2. The form records an open and then shows one large, touch-friendly question at a time.
3. An already-registered voter provides name, mobile number, and mandal.
4. A voter who needs help enters a secure document-first application.
5. Uploads are saved first. When the voter taps **Check extracted details**, the callable Cloud Vision workflow reads every uploaded identity or education document and reports visible progress until it finishes.
6. The voter supplies only missing details, reviews every value and confirms declarations.
7. The system creates a preparation PDF and records `FORM_PREPARED`, never `SUBMITTED`.

The website cannot read a SIM's primary number. The mobile field uses the phone keyboard and browser autocomplete so Android or iPhone may suggest a saved number.

## Degree certificate and OCR

Document upload is enabled only on the `new` registration-help path:

- Offer Aadhaar front/back and Voter ID as optional sources.
- Require the degree certificate and passport photo through editable workflow settings.
- Compress the image in the browser before upload.
- Upload directly from the browser to a private Storage path owned by an invisible anonymous session.
- Store only document metadata and review status in Firestore.
- Let the owner view or delete the document; never expose a public download URL.
- Keep manual review as the source of truth.

OCR uses explicit callable requests started by **Check extracted details** after uploads finish. It does not use a Storage trigger or background processing pipeline. The page shows document-count progress, fields found and recoverable failures before moving to manual completion. OCR suggestions must be confirmed by the voter and cannot overwrite confirmed data. When voluntarily provided, the complete Aadhaar number is retained only inside the private application and generated Form 18. It is excluded from analytics, logs and ordinary admin summaries. Raw OCR text is not retained.

## Deliberately excluded from the MVP

- Voter OTP or public account creation
- Automatic submission to an official election portal
- Captcha handling or browser automation against an official portal
- Background Cloud Functions and scheduled aggregations
- Document AI, queues, and multiple OCR providers unless real usage proves they are needed
- CSV export
- Automatic Google Sheets synchronization

## Security and privacy

- Only the configured owner account can read responses and documents.
- Public rules allow only the minimum create/read operations needed for a published form.
- The UI explains why mobile and certificate data are collected.
- The campaign must define retention and deletion periods before accepting documents.
- Logs and exports must not expose document contents or unnecessary personal data.
