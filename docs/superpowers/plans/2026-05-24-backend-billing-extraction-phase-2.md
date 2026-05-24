# Backend Billing Extraction Phase 2

## Goal

Move billing and entitlement behavior out of `server/index.js` into service and route modules while preserving the public API contract.

## Tasks

1. Add focused tests for extracted pure billing rules.
   - Plus entitlement status and canceled-period handling.
   - Paddle subscription status/date mapping.

2. Extract entitlement service.
   - Create `server/services/entitlements.js`.
   - Move `normalizePlanId`, `hasPlusEntitlement`, and `getUserEntitlementState`.

3. Extract billing provider services.
   - Create `server/services/paddleService.js`.
   - Create `server/services/googlePlayService.js`.

4. Extract billing routes.
   - Create `server/routes/billing.js`.
   - Register the raw Paddle webhook route before `express.json`.
   - Register JSON billing routes after body parsing and shared middleware.

5. Verify.
   - Run focused billing tests.
   - Run `npm run verify`.
   - Run production audit.
   - Run Vercel API import check.
