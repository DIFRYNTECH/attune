# Attune Paid Readiness: Implementation and Evidence

Reviewed 4 October 2026. Local working-tree changes only; nothing in this pass was deployed, committed, or applied to a hosted database. Synthetic profiles, not real customer data, were used for AI evaluation.

## Decision

**Recommendation mechanics: A against the declared engineering acceptance criteria. Overall paid-release readiness: not yet approved.**

The original C-grade assessment identified real defects. Those defects have been addressed and the acceptance campaign now passes. This is an engineering assessment of freshness, constraints, learning, and durability under the stated scenarios. It is not a clinical endorsement, an independent security audit, or evidence that people will pay. It would be misleading to turn passing simulations into an overall commercial A grade.

The remaining launch gates below require deployed infrastructure, Play Console configuration, actual Android purchase flows, a price decision, and real customers. No subscriptions were bought, accounts deleted, or production records changed during this work.

## What Changed

- Activity constraints now use explicit duration, location, seated suitability, physical effort, and setup requirements. Unknown suitability fails closed when a hard constraint is selected. Saved boards hydrate current catalogue metadata.
- The catalogue contains 344 distinct activity identities across 11 domains. Sixteen additional creative/play activities broaden the non-chore options. All 345 entries have bounded timeboxes and explicit requirements; 44 have fully editorial metadata. Legacy mode and general effort classifications still include inferred values.
- Similar descriptions share repetition families. Existing boards are deduplicated after metadata updates without replacing unrelated choices.
- Saved and helpful activities rotate. Recent exposure has meaningful weight, positive feedback decays, and changing interests can displace older preferences. Repeated "too much" feedback affects similar-capacity recommendations beyond the short temporary exclusion window.
- AI selects approved catalogue identities; returned wording and constraints come from trusted local definitions. A note-directed creative/play request is no longer undone by historical chore preferences. Candidate limits are enforced in the request schema and parser.
- Ordinary learning history expires by elapsed time, not the number of recorded days. Explicit save/hide/unhide decisions remain durable. Free-text notes are not included in the bounded feedback context.
- Client and database sync merge learning events and preference tombstones. Recent exposure and outcomes receive priority within the payload budget. A failed sync is surfaced rather than silently looking successful. Other snapshot fields, including check-in and My Day, still use last-writer-wins behavior.
- Paid entitlements respect expiry and authoritative Play verification. Purchase persistence is atomic and guards ownership and stale observations. Authenticated Play notifications refetch provider state; backend acknowledgment and periodic reconciliation were added.
- Note-memory access is server-authorized. An expired subscriber can still delete their own stored notes through a narrowly scoped database function.
- Pending purchases no longer claim Plus activation before the server confirms access. Profile now exposes a public account-deletion request link with a dedicated email subject and cancellation guidance. This is a manual support workflow, not automatic deletion.
- Compatible dependency updates remove the advisories found during the review. Offline recommendation acceptance now runs in CI without paid AI calls.
- Provider token usage and latency are now retained for board and daily-note attempts, including rejected responses and fallbacks. Unknown usage stays explicitly unknown. Daily-note transport errors finalize and release quota immediately. Structured usage logs precede database finalization; see the [usage operations runbook](C:/Users/thash/Development/attune/attune/docs/AI_USAGE_OPERATIONS.md). These controls are local and not yet deployed.

## Verification Results

| Check | Result | Scope |
| --- | --- | --- |
| Automated tests | 150 passed, 0 failed | Domain, service, HTTP middleware, usage accounting, billing, sync and PostgreSQL migration/reporting tests |
| Offline two-month campaign | 18/18 gates passed | 8 personas x 2 seeds x 2 paths; 32 trajectories |
| Offline volume | 1,800 active days; 21,600 recommendations; 396 replacement checks | Local engine and server pipeline with deterministic model stub |
| Live two-month campaign | 18/18 gates passed | 60 actual provider calls for one changing-interest persona; 720 recommendations |
| Final live scenario matrix | 6/6 passed | Cold start, depleted seated, time-limited, favorite fatigue, creative note, injection attempt |
| Dependencies | 0 reported vulnerabilities | Full `npm audit` and production-only audit |
| Build and imports | Passed | Vite production build; Vercel catchall and Play notification entrypoints |
| Attune lint | Passed | `npx eslint . --ignore-pattern 'crumb-trouble/**'` |
| Root lint | Not green | 103 errors in the unrelated, pre-existing untracked `crumb-trouble` project; untouched |
| Browser | Passed within fixture scope | Real store/Pick/My Day on desktop and 390/360-pixel mobile viewports; clean-session runtime errors absent |

Browser checks covered save, hide, replacement, restore, reload persistence, time/indoor/seated filters, activity details, completion/helpful feedback, five-item confirmation, and the ten-item My Day cap. The public deletion anchor also loads without sign-in and fits a 360-pixel viewport. Browser fixtures do not establish signed-in production behavior or Android billing correctness.

The PostgreSQL tests apply the actual migration SQL to PGlite, including repeated application, role checks, RLS, stale observations, ownership conflicts, rollback, and merged snapshots. PGlite is an embedded single-connection PostgreSQL environment; this is not a hosted Supabase or concurrent-device sign-off. HTTP tests use a real local Express server but stub authentication-provider responses and AI/quota collaborators.

### Recommendation Outcomes

- No tested constraint violations, hidden-item leaks, premature temporary reappearance, duplicate boards, replacement failures, unstable revisits, empty boards, or reload preference loss.
- Non-familiar exact repetition within seven days: **0%** in both the offline and live campaigns. This does not mean no repeated activities: familiar, successful suggestions may intentionally return. All live seven-day repeats combined were 16.94%.
- At least two domains appeared among the first three recommendations on **100%** of tested days.
- The most frequently featured activity occupied at most **20%** of active days offline and **16.67%** live, below the original 60% ceiling.
- After sustained changed-interest feedback, new interests occupied **66.67-70%** of final-period featured slots offline and **66.67%** live, exceeding the old preferences.
- The live persona observed **222 distinct activities** in 60 days. Near-duplicate copy checks passed; lexical checks are not a comprehensive semantic audit.

The original 16 gates were retained. Two additional gates require adaptation to new interests and absence of high-overlap copy pairs. Gates were strengthened, not relaxed to manufacture a pass. Choices and helpfulness were scripted inputs, so these results do not measure satisfaction or retention.

### Live Test Provenance

The provider returned `gpt-5.4-mini-2026-03-17`. The successful 60-day campaign used 1,422,484 tokens, including 1,405,746 input and 16,738 output tokens. Provider latency was approximately 2.22 seconds p50 and 4.74 seconds p95. The harness deliberately spaces calls; daily simulation timing is not app response latency.

Earlier attempts exposed a provider rate-limit response and a valid-ID candidate-count overflow. Raw failure evidence is retained. Calls were paced and schema/parser limits corrected; the successful run completed 60/60 without masking failures through a model fallback.

The 60-day live run predates the final three repetition-family aliases. The offline campaign, regression tests, and six-case live matrix ran after those aliases. Usage instrumentation was added afterward, without changing the model requests or selection rules, and the offline campaign was rerun. Source fingerprints are stored with the campaigns; neither live run is byte-identical to the final tree. The six-case matrix used another 106,551 tokens. Failed and earlier exploratory calls are additional, not included in the successful-run totals.

The new usage tracker was also replayed against all 60 saved provider usage responses: all 1,422,484 tokens matched, including the cached-input breakdown. This is metadata replay, not 60 additional live calls or proof of hosted persistence. HTTP tests cover successful finalization, rejected content, cache hits, daily-note transport failures and database finalization errors.

## Cost and Price Gate

Using published model rates and recorded usage, the successful 60-call campaign is estimated at **$1.125**, or **$1.130 without caching**, not an invoice. See [OpenAI's model pricing](https://developers.openai.com/api/docs/models/gpt-5.4-mini).

At the uncached average of roughly **$0.0188 per generated board**:

| Illustrative usage | Board-only cost per 30 days |
| --- | ---: |
| 1 generated board/day | $0.56 |
| 3 generated boards/day | $1.69 |
| 200 generated boards/day | $112.96 |

These are extrapolations from one synthetic persona, excluding daily-note generation, retries, hosting, databases, taxes, payment fees, support, and future prompt growth. The current Plus default is 200 requests/day with no monthly cap; database plan settings can override it. This is not a defensible paid-launch allowance without a price and margin decision.

Before charging, agree the monthly price, define a target contribution margin, set tested daily/monthly usage limits in the plan configuration, and add usage/cost alerts. Do not advertise unlimited AI based on this test. Token instrumentation is now implemented locally, but deployed collection, provider-billing reconciliation, alerts and representative concurrency/load tests remain outstanding.

## Required Release Gates

| Priority | Gate | Evidence required before general paid launch |
| --- | --- | --- |
| P1 | UAT database rollout | Apply both migrations below in order on a backed-up test environment; confirm roles/RLS and old/new-client behavior. Do not deploy the dependent client/server first. |
| P1 | Play billing | Configure products, service credentials, pinned RTDN audience/email and Pub/Sub; test actual purchase, pending purchase, acknowledgment, restore, renewal, cancel-at-period-end, grace, hold, refund/revoke, and account mismatch on licensed Android test accounts. |
| P1 | Device/account durability | On two real signed-in devices, verify hide/unhide, save, outcomes, offline edits/reconnect, long absence, reinstall and account switching. Verify timezone/day rollover and deep links. Document last-writer-wins limitations outside learning history. |
| P1 | Price and usage limits | Choose subscription price and a sustainable allowance; validate database quota settings, actual provider rate limits, alerts, and cost behavior under concurrent load. |
| P1 | Deletion and privacy operations | Publish the deletion URL; verify support mailbox delivery, ownership checks, deletion of auth and associated records on a disposable account, retained-record policy, completion time and accountable owner. Complete the relevant legal/privacy review and Play disclosures. |
| P1 | Customer value | Run a structured beta with the intended audience. Measure useful-choice rate, abandonment, repeated dismissals, perceived repetition, week-2/week-4 retention, and willingness to pay at the actual price. A simulated "helped" event proves none of these. |
| P2 | Independent catalogue review | Have target users and an appropriate reviewer check clarity, effort labels, accessibility, emotional appropriateness and physical activities. No clinical effectiveness or universal mobility suitability is established here. |
| P2 | Release operations | Test release-signed Android builds, rollback, backup restore, monitoring, support escalation and store-required testing. If web payments are sold, exercise Paddle checkout/webhooks/portal independently too. |

Google's authoritative references: [subscription lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions), [billing tests](https://developer.android.com/google/play/billing/test), and [account-deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en). A prominent email-based deletion resource can support the required request route, but an untested mailbox or unfulfilled request is not compliance.

## Rollout Order

1. Review the local diff and select only Attune files for source control; leave unrelated `crumb-trouble` and `docs/critter-caper` work alone. Generated evidence is about 100 MiB and should be archived deliberately, not blindly committed.
2. Apply [authoritative Play entitlement migration](C:/Users/thash/Development/attune/attune/supabase/migrations/20261004120000_authoritative_play_entitlements.sql), then [activity learning merge migration](C:/Users/thash/Development/attune/attune/supabase/migrations/20261004123000_merge_activity_learning.sql) to UAT after backup and review. Neither was applied remotely in this pass.
3. Configure billing and notification environment variables from `.env.example`; deploy the matching server and client to UAT. Preserve the migrations when rolling back application code unless a reviewed reverse migration is available.
4. Complete the release gates above and record results against the exact deployed revision. Keep paid production availability off until those gates are satisfied.
5. Begin a limited paid pilot only after technical and operational gates pass; use real retention and purchase evidence to decide expansion. No forecast that Attune will be a hit is warranted yet.

## Reproduce and Inspect

```text
npm test
npx eslint . --ignore-pattern 'crumb-trouble/**'
npm run build
npm audit
npm run test:recommendations
```

Optional, billable provider checks require configured AI credentials: `node scripts/test-live-recommendations.mjs` and `npm run test:recommendations:live`. The long campaign has a 66-call/1.5-million-token pre-call guard, no SDK retries, a 45-second request timeout, and paced calls. The last response can exceed a pre-call token guard; treat it as a testing safeguard, not an exact billing cap. Neither command belongs in ordinary CI.

- [Final offline summary](C:/Users/thash/Development/attune/attune/test-results/recommendation-simulation/summary.json) and [18-gate acceptance](C:/Users/thash/Development/attune/attune/test-results/recommendation-simulation/acceptance.json).
- [Successful live summary](C:/Users/thash/Development/attune/attune/test-results/recommendation-live60/summary.json), [raw provider data](C:/Users/thash/Development/attune/attune/test-results/recommendation-live60/provider-responses.json), and [acceptance](C:/Users/thash/Development/attune/attune/test-results/recommendation-live60/acceptance.json).
- [Final six-case live results](C:/Users/thash/Development/attune/attune/test-results/live-recommendations/summary.json).
- [Current telemetry replay against saved provider responses](C:/Users/thash/Development/attune/attune/test-results/provider-usage-replay.json).
- [Archived baseline](C:/Users/thash/Development/attune/attune/test-results/recommendation-baseline-2026-10-04/summary.json). The earlier C-grade review describes this baseline, not the fixed code.
- [Mobile activity dialog](C:/Users/thash/Development/attune/attune/test-results/grade-mobile-dialog.png), [My Day cap](C:/Users/thash/Development/attune/attune/test-results/grade-mobile-cap.png), and [public deletion resource](C:/Users/thash/Development/attune/attune/test-results/grade-mobile-deletion.png).

Local preview remains available at [Attune](http://127.0.0.1:5175/). The isolated [Pick fixture](http://127.0.0.1:5175/tests/browser/pick.html) exercises real local components without a signed-in account. Neither URL is a deployed release.
