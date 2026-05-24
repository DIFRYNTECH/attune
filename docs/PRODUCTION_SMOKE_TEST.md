# Production Smoke Test

Run this checklist against the production deployment before broad launch.

## Web App

- [ ] Production URL loads over HTTPS.
- [ ] `/privacy` loads and displays the current privacy policy.
- [ ] `/auth/callback` rewrites to the SPA.
- [ ] Sign up/sign in via Supabase OTP works for a real email.
- [ ] Sign out works.

## API

- [ ] `GET /api/health` returns `{ "ok": true }`.
- [ ] Protected API calls without a bearer token return `401`.
- [ ] Protected API calls with a valid token return expected data.
- [ ] Vercel logs show request IDs and no repeated runtime errors.

## AI

- [ ] Plus user can generate an AI board.
- [ ] Plus user can generate a daily note.
- [ ] Free user receives the expected Plus-required response.
- [ ] AI usage rows are finalized as `quotaState: billed` after successful AI responses.
- [ ] Quota rejection works at the configured limit.

## Billing

- [ ] Paddle checkout opens in the configured environment.
- [ ] Paddle webhook updates `user_entitlements`.
- [ ] Paddle portal session opens for an active customer.
- [ ] Google Play purchase verifies against the signed-in account on Android.

## Mobile

- [ ] Android App Link opens the app from `https://<host>/auth/callback`.
- [ ] `assetlinks.json` is live with the release certificate fingerprint.
- [ ] Real-device auth works end to end.
