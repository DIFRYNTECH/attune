# Attune Recommendation Simulation and Paid Launch Review

Historical baseline assessment. Subsequent fixes and verification are recorded in [the implementation review](C:/Users/thash/Development/attune/attune/docs/PAID_READINESS_REVIEW_2026-10-04.md). The original simulation artifacts were archived under `test-results/recommendation-baseline-2026-10-04`; references below to `recommendation-simulation` describe their original location and now point to rerun output. Original source line references may have moved after implementation.

## Decision

Attune is not ready for a general paid launch. The recommendation mechanics are substantially better, but the two-month simulation found persistent repetition, weak adaptation to changed interests, and stale-history handling. Independent boundary probes also exposed a seated-filter error, a preference-sync limit, and stale paid-entitlement behavior.

My engineering grade for the recommendation system is **C overall**: a working beta foundation with material product and data gaps. This is a qualitative engineering assessment, not a statistical score, clinical validation, or a forecast of sales. Continue controlled beta work; close the high-priority issues below before charging a general audience.

This review was run on 2026-10-04 against the local, uncommitted Pick upgrade. It does not describe a deployed UAT release. No application code, live account data, subscriptions, or deployments were changed during this assessment.

## Test Scope

The simulation uses the actual catalogue, local engine, ranking, board composition, feedback, event trimming, history serialization, server request construction, model-output validation, and server quality-selection functions.

- Virtual dates: 2026-08-01 through 2026-09-29, inclusive.
- Eight personas, two deterministic choice seeds, and two selection paths: 32 runs.
- Paths: local recommendations; server curation with a deterministic model stub returning approved catalogue IDs, followed by client ranking.
- Personas: steady reader, depleted seated user, variable capacity, favorite loyalist, frequent decliner, changing interests, silent browser, and returning user.
- Returning users are active for days 1-10 and 41-60. Other personas are active every day.
- Only the first three suggestions are recorded as seen unless the persona expands alternatives.
- Choices, completions, and helpfulness are scripted inputs. They are not measured user satisfaction.
- A daily adapter resets the same board/check-in/My Day fields as the store rollover. React lifecycle, midnight timers, timezone changes, auth, HTTP, live AI, real database writes, billing providers, and Android hardware are not simulated.
- Constraint conformance is checked against the production predicate. Independent semantic probes are reported separately because a function cannot establish the correctness of its own metadata.
- Repetition targets were declared before the run: non-familiar exact repeats within seven days at most 10%; at least two domains in the first three on 95% of days; no automatically featured activity on more than 60% of active days. These are proposed product acceptance targets, not industry standards. A future explicit daily-habit choice should have a separate rule.

## Results

| Measurement | Result | Interpretation |
| --- | ---: | --- |
| Active simulated user days | 1,800 | 32 two-month trajectories, accounting for absences |
| Opening-board recommendations | 21,600 | All 1,800 opening boards contained 12 activities |
| Recorded opening exposures | 10,980 | Expanded and collapsed views were distinguished |
| Replacement checks | 396 passed | Rejected choice removed; other choices and My Day preserved |
| Hidden or temporarily excluded items resurfacing | 0 | Within the simulated exclusion periods |
| Exact duplicate identities on a board | 0 | One lexical near-duplicate pair was flagged separately |
| Same-day board instability | 0 | Revisit checks after recording behavior |
| Preference loss in normal JSON/event serialization | 0 | Not proof of live cloud durability |
| Non-familiar exact repeats within seven days | 0% in every run | Ordinary freshness works in these scenarios |
| First three containing at least two domains | 100% of days | Domain variety works |
| Runs exceeding the featured-frequency target | 28 of 32 | Every non-silent persona/path/seed combination failed |
| Highest per-run 95th percentile compute time | 397 ms | Desktop Node computation; excludes network and Android |
| Largest final synthetic state | 417,530 bytes | About 408 KiB, before the rest of the app state |
| Existing automated test suite | 87 passed | Existing tests do not cover all longitudinal failures |
| New acceptance gates | 10 of 16 passed | Six failures; acceptance command intentionally exits 1 |

The single near-duplicate flag paired “Choose one uncomfortable-but-safe task and do 5 minutes of it” with “Choose one hard-but-safe task and make a 15-minute start.” This is a heuristic similarity warning, not proof that every other pair is semantically distinct.

### Observed Breadth

Ranges below span the two seeds. They count distinct activities actually observed, not the whole catalogue. Personas that expand alternatives naturally see more items, so cross-persona counts are not an effectiveness comparison.

| Persona | Active days | Local unique observed | Server stub unique observed |
| --- | ---: | ---: | ---: |
| Steady reader | 60 | 35 | 40-41 |
| Depleted seated | 60 | 40-43 | 44 |
| Variable capacity | 60 | 88-92 | 83-85 |
| Favorite loyalist | 60 | 38 | 39-54 |
| Frequent decliner | 60 | 122-123 | 132-137 |
| Changing interests | 60 | 115-123 | 143-144 |
| Silent browser | 60 | 44 | 87-91 |
| Returning user | 30 | 33-37 | 44-49 |

## Grades

| Area | Grade | Basis |
| --- | --- | --- |
| Core board and feedback mechanics | A within tested scope | Stable boards, correct replacement, explicit exclusion, normal serialization |
| Ordinary freshness | A within tested scope | No non-familiar seven-day exact repeats; visible exposure accounting |
| Familiar activity rotation | D | A favorite can stay featured on all 60 days without an explicit daily-habit instruction |
| Adaptation over time | C | Positive signals change rank, but old successes dominate and negative effort feedback has no lasting contextual effect |
| Catalogue metadata and constraint confidence | C- | Broad catalogue, mostly inferred metadata, missing durations, confirmed seated-filter mismatch |
| Retention and data durability | C- | Normal round trips pass; sparse calendar expiry and high-volume preference synchronization fail |
| Commercial readiness | Not approved | Product gaps plus stale entitlement behavior, dependency advisories, and unverified live release flows |

## Findings and Required Work

### P1 Correct Explicit Activity Constraints

With “No standing or walking” enabled, “Step into fresh air for 2 minutes” is classified as `requiresStanding: false` and is actually placed on the board. The current regex recognizes “walk” and “standing” but not this wording. The most constrained persona also selected “indoors only,” which masks this particular error; the independent seated-only probe exposes it.

Do not fix this only by growing a keyword list. Add reviewed `canDoSeated`, location, equipment, physical-demand, and duration fields to catalogue entries. Treat unknown requirements conservatively when a user asks for a hard constraint. Add independently specified fixture cases so the filter is not being tested against itself.

Evidence: [activityPolicy.js](C:/Users/thash/Development/attune/attune/src/lib/activityPolicy.js:31), [boundary probes](C:/Users/thash/Development/attune/attune/test-results/recommendation-simulation/boundary-probes.json).

### P1 Prevent Successful Activities From Becoming Permanent Fixtures

All four favorite-loyalist runs featured one activity on 60 of 60 days. In the local runs this was “Put on music and move lightly for one song.” Across the full campaign, 28 runs exceeded the proposed 60% frequency limit.

The ranker gives favorites +8 and helpful activities +6, but caps their exposure penalty at only 1. Remembering an activity therefore overwhelms the fatigue penalty. Keeping a discovery slot prevents complete lock-in, but it does not stop the remaining slots becoming repetitive.

Introduce an explicit repeat cadence and a stronger recent-feature exposure penalty for saved/helpful activities. Keep favorites available in the library without automatically displaying them every day. Separate “saved” from “make this a daily habit.” Test both welcome routine and unwanted repetition.

Evidence: [smartPick.js](C:/Users/thash/Development/attune/attune/src/lib/smartPick.js:20), [favorite trajectory](C:/Users/thash/Development/attune/attune/test-results/recommendation-simulation/favorite-loyal-local-17.json).

### P1 Repair Calendar Based Expiry

A 130-day-old ordinary exposure survives `trimEventDays(..., 90)` when the user has only a few recorded day keys. It also appears in `recentShown` sent to AI. Both functions limit the number of recorded dates rather than imposing an elapsed-time cutoff.

Apply actual timestamp/date cutoffs to ordinary history and AI recency. Retain explicit saved/hidden preferences separately. Test sparse users, long absences, timezone boundaries, invalid timestamps, and restored old device snapshots. Dense history correctly retained 90 ordinary day buckets and preserved an older favorite; that passing case does not fix sparse history.

Evidence: [events.js](C:/Users/thash/Development/attune/attune/src/lib/events.js:26), [boardHistory.js](C:/Users/thash/Development/attune/attune/src/lib/boardHistory.js:57).

### P1 Make Paid Entitlements Fresh and Authoritative

The real entitlement helper returns Plus for a `play_store` record marked `active` even when `current_period_end` is 2026-08-31, already in the past at review time. Expiry is checked only for canceled records. This probe establishes behavior with stale provider data; it does not establish the state of a real customer's subscription.

The repository has purchase verification and Paddle reconciliation, but no Google Play RTDN/reconciliation handler was found. External infrastructure was not inspected. Implement or verify server-side reconciliation for renewal, cancellation, expiry, refund, revocation, grace and account hold. Preserve deliberate manual grants separately, and do not replace this with an indiscriminate expiry check that could revoke a legitimately renewed subscriber while notifications are delayed.

Evidence: [entitlements.js](C:/Users/thash/Development/attune/attune/server/services/entitlements.js:9), [billing routes](C:/Users/thash/Development/attune/attune/server/routes/billing.js:69), [boundary probes](C:/Users/thash/Development/attune/attune/test-results/recommendation-simulation/boundary-probes.json).

Google documents the lifecycle and recommends testing successful and failed renewal paths, acknowledgement, and accelerated subscription states with license testers and Play Billing Lab. Those real-provider tests remain necessary. [Subscription lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions), [Billing testing](https://developer.android.com/google/play/billing/test).

### P2 Learn From Recent Context Without Overreacting

Positive feedback works: a controlled probe moved a previously helpful activity up seven rank positions. But after “too much today,” another probe removes the activity immediately and returns it to rank 0 after 48 hours, exactly as if that negative feedback had never happened. A temporary rejection is appropriate; repeated similar-context effort feedback should also inform longer-term selection.

The changing-interest personas switched from creativity/play to practical/meaning/progress on day 31. Each supplied 26 successful, helpful selections in the new domains during the second month. Nevertheless, in the last 20 days, only 18.33-33.33% of the first three suggestions matched the new domains, while 33.33-48.33% still matched the old domains. These are synthetic domain-fit proxies, not human relevance scores or a causal estimate of lift.

Store the check-in context and catalogue version with outcomes. Add bounded, recency-weighted domain/family preference signals and repeated “too much” signals under similar capacity. Keep deliberate discovery and allow preference resets. Do not infer a diagnosis or treat non-completion as dislike. Test preference reversals, rather than only accumulating positive history.

Evidence: [activityLearning.js](C:/Users/thash/Development/attune/attune/src/lib/activityLearning.js:24), [feedback event creation](C:/Users/thash/Development/attune/attune/src/store/useAttuneStore.js:1575), [acceptance results](C:/Users/thash/Development/attune/attune/test-results/recommendation-simulation/acceptance.json).

### P2 Separate Durable Preferences From Capped Event Logs

Normal simulation serialization preserved preferences. A separate stress probe creates one hidden preference followed by 260 exposure events in one day. The store's last-250-events export rule drops that preference, so a fresh device receiving that snapshot no longer knows it was hidden.

This is an intentionally high-volume boundary case, not typical 12-card daily use. Store durable preference state independently, with merge/version semantics, so event-log compaction cannot undo a user's explicit choice. Exercise offline edits on two devices and verify eventual convergence.

Evidence: [event export cap](C:/Users/thash/Development/attune/attune/src/store/useAttuneStore.js:714), [boundary probes](C:/Users/thash/Development/attune/attune/test-results/recommendation-simulation/boundary-probes.json).

### P2 Complete Content Metadata and Profile Device Performance

The catalogue contains 329 entries, 328 distinct identities, and 167 repetition families. Only 28 entries use the new explicit editorial metadata; 301 use legacy inference. There are seven creativity and six play entries. Another 234 entries have no structured or recognized duration, so time-constrained boards exclude them. This includes a parser gap for wording such as “Set a 7-minute timer,” not necessarily an absence of time information in the text.

Audit all active entries for concrete action, accessibility, equipment, emotional assumptions, mode, effort, duration, identity and repetition family. Broaden underrepresented domains without padding the catalogue with trivial variations. This review did not clinically validate the activities.

The heaviest simulated profile reached a 397 ms 95th-percentile compute time on desktop Node. Profile actual low-end Android devices. The ranker repeatedly scans history for every candidate; indexing recent exposures and outcomes would be a targeted optimization if device measurements confirm a problem.

Evidence: [catalogue](C:/Users/thash/Development/attune/attune/src/data/tasks.js), [ranking](C:/Users/thash/Development/attune/attune/src/lib/smartPick.js:14), [summary data](C:/Users/thash/Development/attune/attune/test-results/recommendation-simulation/summary.json).

## Release Gates Outside This Simulation

- Current `npm audit --omit=dev` reports eight affected dependency entries: three moderate, four high, one critical. Triage dependency paths and exploitability, patch where appropriate, and rerun the production audit. An advisory is not proof of an exploited application, but the current CI audit gate is not clean.
- Run real Plus AI generation with representative and adversarial synthetic check-ins. Verify relevance, latency, fallback, quotas and cost per active subscriber.
- Run authenticated save/reload, logout/login, offline recovery and two-device conflict tests against UAT. JSON round trips do not test Supabase persistence.
- Verify purchase, acknowledgement, renewal, cancellation, restore, decline, refund and revocation with Google Play test accounts. Include Paddle if web subscriptions will be sold.
- Verify release-signed Android installation, app links, native back navigation, background/resume, accessibility and crash reporting on real devices.
- Complete the existing [production smoke checklist](C:/Users/thash/Development/attune/attune/docs/PRODUCTION_SMOKE_TEST.md) and privacy/support/account-deletion checks. A clear owner and evidence are required for each item.

For personal Play developer accounts created after November 13, 2023, Google currently requires a closed test with at least 12 testers continuously opted in for 14 days before applying for production access. The account type and creation date were not verified here. A synthetic simulation does not meet that requirement. [Google Play testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

## Will People Pay

This simulation cannot establish willingness to pay. It tests whether the mechanics support the promise, not whether people value that promise enough to subscribe. The proposed value is plausible: reduce the effort of deciding what to do, and remember what fits. The current repetition and metadata gaps weaken that experience precisely where returning subscribers would notice it.

My suggested next product gate is a four-week closed beta with 20-30 people from the intended audience, after the P1 fixes. This is a proposed learning cohort, not a market-size estimate or a substitute for Play requirements. Measure real return usage, time to choose, completion, optional helpfulness with its response rate, replacement reasons, repetition complaints, and cost per active user. Test an actual stated price and voluntary paid conversion after billing is verified. Scripted completions and positive comments alone are not demand validation.

## Recommended Sequence

1. Fix semantic constraints, calendar expiry, and stale entitlement reconciliation. Add regression cases for each reproduced failure.
2. Add repeat cadence, recency-weighted feedback, context snapshots and durable preference storage. Keep the existing board-stability behavior.
3. Complete the catalogue metadata pass, clear the dependency gate, rerun this unchanged 60-day protocol, and profile Android.
4. Finish live AI, sync, billing and release-device checks. Then run the real-user beta and price test before a general paid launch.

## Reproduction and Evidence

Run from `C:\Users\thash\Development\attune\attune`:

```powershell
node scripts/simulate-recommendations.mjs
node scripts/probe-recommendation-release.mjs
node scripts/grade-recommendations.mjs
npm test
```

The simulation completed in 375 seconds on this machine. Recommendations and scripted choices are deterministic by seed; random event IDs, execution timings and small serialized-size differences are not intended to be byte-identical. The grading command intentionally exits 1 while the six documented acceptance gates fail. The 87 existing unit tests still pass. Lint passed for all three new scripts.

- [Simulation driver](C:/Users/thash/Development/attune/attune/scripts/simulate-recommendations.mjs)
- [Boundary probe driver](C:/Users/thash/Development/attune/attune/scripts/probe-recommendation-release.mjs)
- [Acceptance grader](C:/Users/thash/Development/attune/attune/scripts/grade-recommendations.mjs)
- [Summary and source fingerprints](C:/Users/thash/Development/attune/attune/test-results/recommendation-simulation/summary.json)
- [Acceptance results](C:/Users/thash/Development/attune/attune/test-results/recommendation-simulation/acceptance.json)
- [Boundary results](C:/Users/thash/Development/attune/attune/test-results/recommendation-simulation/boundary-probes.json)

The same output directory contains all 32 day-by-day trajectories, including activity text, check-in constraints, observed items, synthetic choices and feedback. No real user data is included.
