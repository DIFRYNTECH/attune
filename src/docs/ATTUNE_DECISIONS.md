## Local-first state (no accounts)

### Decision
Attune is local-first: user state is stored in localStorage with light schema migration. There are no accounts yet.

### Why
- The app must feel lightweight and private by default.
- Users should be able to use Attune without signing up.

### Notes
- “Sign out” means “clear this device’s data”.
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
Use a 15-tile board with stable, no-repeat assignment and “gentle caps” for adding to My Day.

### Why
- Tiles should not jump around (that feels chaotic).
- A cap reduces overwhelm while still allowing choice.

### Notes
- Soft cap: 5 (confirm to continue)
- Hard cap: 10 (prevents more reveals/adds)
- “Clear board” clears My Day and refreshes options

---

## Weekly is calendar week (Mon → Sun)

### Decision
Weekly reflection is based on the current calendar week (Mon → Sun), and weekly notes are keyed to that week.

### Why
- A rolling 7-day window makes notes feel unstable.
- Calendar weeks are easier to explain and remember.

---

## Profile is UI-only (for now)

### Decision
Profile exists as a local-only UI placeholder (no real authentication yet).

### Why
- It lets us design the “account surface” without building auth too early.

---

## AI-generated Activity Picker board (optional)

### Decision
Generate a fresh 15-tile Activity Picker board on each check-in using OpenAI, while preserving the existing built-in task list as a fallback.

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

