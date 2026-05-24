# Project Status and Open Work

## Status Snapshot

As of March 31, 2026, Attune is beyond the earlier local-only prototype stage.

It now has:

- production web deployment on Vercel
- hosted API on Vercel
- Supabase OTP auth
- Supabase-backed user data and AI usage logging
- Upstash-backed serverless-safe rate limiting
- OpenAI-backed board generation and daily notes
- Capacitor Android shell with hosted auth path support

## What Is Effectively Done

- mobile-first frontend shell
- check-in, Activity Picker, My Day, Weekly, and Profile flows
- OTP sign-in and sign-up
- hosted callback routing on Vercel
- production AI backend deployment
- quota-aware AI request path
- remote sync for profiles, weekly summaries, and note memory

## What Still Needs Deliberate Follow-Through

### Must-do before calling the project stable

1. Run a clean production smoke test after the recent secret rotation.
   - Evidence: pending live run using `docs/PRODUCTION_SMOKE_TEST.md`.
2. Verify daily note flow as thoroughly as generate-board.
   - Local evidence, 2026-05-23: `npm run verify` passed, including `node --test`.
   - Live evidence: pending production smoke test.
3. Confirm all production env vars are documented and correct.
   - Documentation evidence, 2026-05-23: `.env.example`, `README.md`, and `src/docs/architecture/07-deployment-and-environments.md` describe the current Paddle, Google Play, Supabase, OpenAI, Upstash, and Vercel variables.
   - Secret-manager evidence: pending environment-by-environment check.
4. Review Vercel function logs for hidden runtime noise or quota/rate-limit surprises.
   - Evidence: pending live log review after the next deployment.

### Should-do soon

1. Clean up stale docs that still describe local-only auth or pre-production assumptions.
2. Remove any temporary auth-debug remnants that are no longer useful.
3. Decide whether the current in-memory server cache is sufficient or should be replaced with a durable cache strategy later.
4. Audit the live data policy and explicitly document what AI metadata is retained.

### Mobile release follow-through

1. Finalize Android App Links with the real host and release fingerprint.
2. Host `assetlinks.json` for the production domain.
3. Test auth on a real device end to end.

### Product iteration later

1. Improve AI prompt quality and monitoring.
2. Tune quotas and plan entitlements.
3. Decide whether more of the app should move behind backend-mediated logic.

## Architecture Notes for Future Decisions

- Attune is currently a hybrid client-direct and backend-mediated architecture.
- Supabase RLS is carrying real trust responsibilities.
- The backend is already important enough that future changes should assume it is a first-class service, not a temporary helper.

## Recommended Current Priorities

1. Stability and smoke testing
2. Documentation freshness
3. Mobile release readiness
4. Product refinement rather than major re-architecture

## Production Readiness Evidence

As of 2026-05-23, local production-readiness gates have been added and run:

- `npm ci` completed with 0 vulnerabilities after stale local build processes were stopped.
- `npm run verify` completed lint, tests, and production build successfully.
- `npm audit --omit=dev --audit-level=moderate` reported 0 vulnerabilities.
- `VERCEL=1` API import check printed `api import ok`.

Attune should not be called ready for broad production launch until `docs/PRODUCTION_SMOKE_TEST.md` is run against the target deployment and the remaining live evidence items above are checked.
