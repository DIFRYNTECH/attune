# Backend Board Service Extraction Phase 5

## Goal

Move AI board request shaping, fallback task construction, board preference rules, board candidate validation, and OpenAI retry/quality selection out of `server/index.js`.

The `/api/generate-board` route remains in `server/index.js` for this phase so auth, quota, cache, and response logging stay stable while domain logic moves behind a service boundary.

## Tasks

1. Add focused board-service tests.
   - Board style normalization.
   - Challenge preferences increase stretch capacity without ignoring low energy.
   - Request building preserves cache inputs and note omission state.
   - Board validation rejects unsafe tasks.

2. Create `server/services/boardService.js`.
   - Export `normalizeBoardStyle`.
   - Export `computeBoardPreferences`.
   - Export `buildBoardRequest`.
   - Export `validateBoardPayload`.
   - Export `generateBoardWithRetries`.

3. Wire `server/index.js`.
   - Replace inline board helper functions with service imports.
   - Preserve cache key shape, prompt content, quota behavior, log event names, and response shape.

4. Verify.
   - Run focused board-service tests.
   - Run `npm run verify`.
   - Run production audit.
   - Run Vercel API import check.
