# Attune AI Usage Operations

Updated 4 October 2026. This runbook explains the local usage instrumentation and the checks needed after deployment. The instrumentation is implemented and tested; production dashboards, alerts and provider-invoice reconciliation have not been configured or verified.

## Recorded Data

Each uncached board or daily-note generation has an existing quota reservation ID before the model call. Finalization stores `meta.providerUsage` on that `ai_usage` row. It records the requested and returned model, provider request ID when available, latency, outcome, and normalized input/output/total/cached token counts for every SDK-visible attempt. Validation failures and fallback models are included, even when the user's quota is released.

The existing `prompt_tokens`, `completion_tokens`, and `total_tokens` columns are populated only when every observed call has valid usage and the totals fit the database integer columns. Otherwise they remain null. Known partial totals remain available under `meta.providerUsage.knownTokens`. Per-attempt records are needed to allocate costs across different fallback models.

The `ai_provider_usage` structured log is emitted before database finalization, with the reservation ID for deduplication. This preserves a diagnostic record if the database write fails. It contains no prompt, optional check-in note, generated text, credential, or raw provider error. Log availability and retention still depend on deployment configuration.

Cache hits have no new provider call or usage reservation. Quota rejection also invokes no model. `quotaState: released` means the user is not charged an app quota unit; it does **not** mean the provider did no billable work.

## Measurement Limits

- `usageComplete` means every SDK-visible call returned valid counts. It does not establish invoice completeness. The SDK can retry internally; timed-out requests may have consumed tokens without returning usage.
- `cachedUsageComplete` distinguishes known zero cached tokens from a missing cache breakdown. Missing values are not zero-cost usage.
- Do not filter to `success = true` when estimating provider spend: rejected content can still consume tokens.
- Historical rows without telemetry cannot be backfilled accurately from request counts. A process crash before finalization may leave only a reserved row or a structured log.
- Requested model aliases are not guaranteed to identify the actual billed model. Prefer each attempt's returned model; reconcile unknown responses with provider reporting.
- Token counts are not currency. Use the actual model's current rates, separate cached input from other input, and retain the rate date. See the [official usage-field example](https://developers.openai.com/api/docs/guides/predicted-outputs).

## Read Only Reporting

Run these queries through an authorized backend or database administration session. Do not expose a service-role key in the app. The existing RLS lets ordinary users see only their own rows.

This groups observed calls over the last 30 days. Null sums mean no known count; `calls_without_usage` and `calls_without_cache_breakdown` must remain visible alongside totals.

```sql
with attempts as (
  select (u.occurred_at at time zone 'utc')::date as day_utc,
         u.kind, a.value as attempt
  from public.ai_usage u
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(u.meta #> '{providerUsage,attempts}') = 'array'
      then u.meta #> '{providerUsage,attempts}' else '[]'::jsonb end
  ) a
  where u.occurred_at >= now() - interval '30 days'
)
select day_utc, kind,
       coalesce(attempt->>'model', attempt->>'requestedModel', 'unknown') as model,
       count(*) as observed_sdk_calls,
       count(*) filter (where attempt #>> '{usage,totalTokens}' is null) as calls_without_usage,
       count(*) filter (where attempt #>> '{usage,cachedInputTokens}' is null) as calls_without_cache_breakdown,
       sum((attempt #>> '{usage,inputTokens}')::numeric) as known_input_tokens,
       sum((attempt #>> '{usage,outputTokens}')::numeric) as known_output_tokens,
       sum((attempt #>> '{usage,cachedInputTokens}')::numeric) as known_cached_input_tokens
from attempts
group by day_utc, kind, model
order by day_utc desc, kind, model;
```

This second query finds unfinished reservations and successful historical/finalized rows without telemetry. It intentionally excludes ordinary quota-rejection records with no provider call.

```sql
select kind,
       count(*) filter (
         where meta->>'quotaState' = 'reserved'
           and occurred_at < now() - interval '15 minutes'
       ) as stale_reservations,
       count(*) filter (
         where jsonb_typeof(meta->'providerUsage') is distinct from 'object'
           and (success or meta->>'quotaState' in ('reserved', 'billed', 'released'))
       ) as rows_missing_telemetry
from public.ai_usage
where occurred_at >= now() - interval '30 days'
group by kind;
```

## Deployment Acceptance

1. Generate one board and one daily note with a disposable UAT Plus account. Confirm the reservation IDs, metadata and token columns in the database and structured logs. Do not copy personal note text into a report.
2. Repeat a cached request. Confirm that provider-call and usage-row counts do not increase.
3. Exercise provider and database failure handling in a controlled test environment. Confirm failed reservations release quota and usage logs survive a finalization error. Never induce these faults in production.
4. Reconcile observed token totals with provider usage reporting for the same account and UTC window. Investigate discrepancies, including SDK retries, missing responses and requests made outside Attune.
5. Configure alerts for `ai_usage_finalize_failed`, `ai_usage_record_failed`, stale reservations, unusual unknown-usage rates and spend against an agreed budget. Assign an owner and verify delivery with a test alert. This runbook does not create those alerts.
6. Set the monthly Plus price and database plan allowances together. Define the contribution-margin target and account for provider calls, hosting, payment fees and support before enabling paid production access.

The remaining paid-release requirements are in the [readiness review](C:/Users/thash/Development/attune/attune/docs/PAID_READINESS_REVIEW_2026-10-04.md).
