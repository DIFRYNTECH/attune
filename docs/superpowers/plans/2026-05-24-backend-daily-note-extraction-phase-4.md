# Backend Daily Note Extraction Phase 4

## Goal

Move daily-note AI prompt construction, validation, retry behavior, cache-key construction, and daily theme selection out of `server/index.js`.

The `/api/daily-note` route remains registered in `server/index.js` for now, but should delegate daily-note domain behavior to `server/services/dailyNoteService.js`.

## Tasks

1. Add focused tests for daily-note service behavior.
   - Daily theme selection is stable.
   - Daily note validation rejects unsafe or assumptive output.
   - Daily note request construction preserves cache-key inputs and optional note omission metadata.

2. Create shared AI text helpers.
   - `server/services/aiText.js` owns clamp helpers, safety fragments, similarity helpers, and assumption checks used by both note and board flows.

3. Create daily-note service.
   - `server/services/dailyNoteService.js` owns theme selection, request building, payload validation, and OpenAI retry behavior.

4. Wire `server/index.js`.
   - Import shared AI text helpers for the board flow.
   - Replace inline daily-note prompt/validation helpers with daily-note service calls.
   - Preserve route response shape, cache behavior, log event names, and awaited quota finalization.

5. Verify.
   - Run focused daily-note tests.
   - Run `npm run verify`.
   - Run production audit.
   - Run Vercel API import check.
