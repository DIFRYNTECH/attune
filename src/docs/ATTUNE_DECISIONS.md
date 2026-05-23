Historical note: these are preserved product and architecture decisions from earlier phases. Where a decision has evolved, this file now notes the current live stance and points to the architecture pack as the source of truth.

## Local-first state with optional account sync

### Decision
Attune is local-first: user state is stored in localStorage with light schema migration, and signed-in users can sync supported data through Supabase.

### Why
- The app must feel lightweight and private by default.
- Users should be able to use Attune without signing up.

### Notes
- Sign out ends the session on the current device.
- Export provides a calm escape hatch: users can download JSON.

---

## Toast behavior

### Decision
Toasts are screen-scoped and ephemeral.

### Why
- A toast should never appear on the “wrong” screen.
- Toasts are UI affordances, not durable user data.

### Notes
- Toasts are not persisted across reload.
- Toasts sit above the fixed bottom nav on mobile.

---

## Activity Picker board rules

### Decision
Use a 12-tile board with stable, no-repeat assignment and “gentle caps” for adding to My Day.

### Why
- Tiles should not jump around (that feels chaotic).
- A cap reduces overwhelm while still allowing choice.

### Notes
- Soft cap: 5 (confirm to continue)
- Hard cap: 10 (prevents more reveals/adds)
- “Reset today” clears My Day and refreshes options

---

## Weekly is calendar week (Mon → Sun)

### Decision
Weekly reflection is based on the current calendar week (Mon → Sun), and weekly notes are keyed to that week.

### Why
- A rolling 7-day window makes notes feel unstable.
- Calendar weeks are easier to explain and remember.

---

## Profile supports accounts and preferences

### Decision
Profile is the account and preferences surface for the live app.

### Why
- It keeps sync, plan state, and preferences in one calm place without turning the app into an account-first experience.

### Notes
- Supabase email OTP is the current auth flow.
- Local export still exists for user-controlled snapshots.

---

## AI-generated Activity Picker board (optional)

### Decision
Generate a fresh 12-tile Activity Picker board on each check-in using OpenAI, while preserving the existing built-in task list as a fallback.

### Why
- Personalization should come from the user’s current state (mood/energy/body/pace + optional note)
- Users should not need to create OpenAI accounts
- The app must remain usable when AI is unavailable

### Implementation notes
- The frontend calls `/api/generate-board`.
- In development, Vite proxies `/api/*` to a local Node server (default `localhost:8787`).
- The Node server holds the OpenAI API key in environment variables (never shipped to the browser).
- The response is strict JSON with a fixed schema and validated before use.

### Fallback behavior
- If the API is unreachable, misconfigured, or returns invalid output, Attune uses the built-in suggestions (no hard failure).

### Safety constraints (non-negotiable)
- Do not suggest anything harmful, risky, illegal, or negative toward self/others.
- Do not suggest medications, supplements, diagnoses, or treatment plans.
- Keep activities small, gentle, and non-punitive.

### Privacy
- A Profile toggle controls whether the optional check-in note is sent to the AI.
- When disabled, Attune still uses mood/energy/body/pace for personalization.

