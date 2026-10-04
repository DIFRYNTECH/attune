# Attune POPIA Readiness Notes

Last updated: 4 October 2026

This is an operational checklist for Attune privacy handling. It is not legal advice, but it records the practical controls Attune needs before wider public launch.

## Position

- Attune is intended for users who are 18 or older.
- Attune does not diagnose, treat, or replace professional care.
- Attune does not sell personal information or run in-app advertising.
- Optional check-in notes are only sent for AI personalization when the user allows note context in Profile.

## Responsible Contact

- Support and privacy mailbox: support@useattune.co
- Use this address for support, privacy questions, access requests, correction requests, deletion requests, and objections.

## Data Request Process

1. Receive the request at support@useattune.co.
2. Verify the request relates to the signed-in email address.
3. Identify the data involved: profile, check-ins, notes, tasks, weekly summaries, billing entitlement records, and support messages.
4. Complete the request where legally appropriate:
   - access/export: provide a readable copy or guide the user to in-app export where available.
   - correction: update incorrect account/profile information.
   - deletion: delete or de-identify account-level data where legally appropriate.
   - objection: review the processing and either stop it or explain why it is still required.
5. Confirm completion to the user.
6. Keep a minimal internal record of the request and resolution.

## Deletion Notes

- "Reset local Attune data" only clears data on the current device.
- Profile links to the public `/privacy#delete-account` request section. It offers a deletion-specific email request; it is not automated deletion.
- Account-level deletion must include authentication and synced database records. Verify ownership before fulfilling the request, confirm the completion time, and document any legally required retention.
- Explain subscription cancellation separately. Receiving a deletion email does not cancel Google Play or web billing automatically.
- Billing providers may retain transaction records as required for legal, tax, fraud-prevention, and accounting reasons.

## Security Incident Process

1. Contain the issue and stop further exposure.
2. Identify affected users and data categories.
3. Preserve relevant logs and evidence.
4. Rotate exposed secrets or credentials if needed.
5. Notify affected users and the Information Regulator where required by law.
6. Document what happened, what was fixed, and what will prevent recurrence.

## Operators And Processors

Attune may use:

- Supabase for authentication and database storage.
- Vercel for hosting and serverless functions.
- Upstash for rate limiting.
- OpenAI for AI board and note generation where enabled.
- Google Play and payment providers for distribution, purchases, and subscription status.

Some processing may happen outside South Africa. The privacy policy must keep this visible.

## Before Public Launch

- Confirm support@useattune.co receives mail reliably.
- Confirm the Privacy Policy URL is live on the production domain.
- Publish and test the public deletion anchor and the Profile link, including without an account or installed app. Set the Play Console account-deletion URL to the deployed public resource.
- Assign a deletion-request owner, response target, and documented retention periods; exercise the full request on a disposable test account before charging users.
- Keep privacy policy copy aligned with actual product features and vendors.
- Review POPIA posture with a qualified privacy/legal professional before a broad public launch.

## Launch Evidence

- [ ] support@useattune.co receives mail reliably.
- [ ] The production privacy policy URL is live.
- [ ] Account-level deletion process has an owner and tested manual runbook.
- [ ] Payment processors and AI processors listed here match production configuration.
- [ ] A qualified privacy/legal review has been completed or explicitly deferred for limited beta.
