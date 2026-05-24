# Backend AI Quota Extraction Phase 3

## Goal

Move AI entitlement context, quota reservation, usage finalization, quota rejection, and recoverable lookup classification out of `server/index.js`.

This phase does not move board or daily-note prompt/generation logic yet. It reduces the API trust-boundary surface first so the later AI route extraction has a smaller dependency set.

## Tasks

1. Add focused tests for pure AI quota service behavior.
   - Recoverable error classification.
   - Quota rejection response body construction.

2. Create `server/services/aiQuota.js`.
   - Export `DEFAULT_PLAN_LIMITS`.
   - Export `isRecoverableAiLookupError`.
   - Export `buildQuotaRejectionBody`.
   - Export `createAiQuotaService(...)` with:
     - `recordAiUsage`
     - `getUserAiContext`
     - `reserveAiQuota`
     - `finalizeReservedAiUsage`
     - `rejectForQuota`

3. Wire the service into `server/index.js`.
   - Preserve all log event names.
   - Preserve quota response shape.
   - Preserve awaited usage finalization.

4. Verify.
   - Run focused AI quota tests.
   - Run `npm run verify`.
   - Run production audit.
   - Run Vercel API import check.
