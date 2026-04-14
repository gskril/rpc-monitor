# Dashboard P95 Handoff

## Current State

- Latest relevant commit: `f3a416c` (`Align dashboard P95 aggregation and refactor metrics`)
- Working tree was clean when this handoff was written.
- The dashboard currently has a shared metrics helper at [packages/dashboard/src/lib/dashboardMetrics.ts](/Users/Greg/Desktop/crypto/rpc-monitor/packages/dashboard/src/lib/dashboardMetrics.ts).
- The all-regions latency chart still uses minute bucketing / cross-region averaging for UX, which is intentional for chart display.
- The all-regions `Provider ranking` and the `All` row in `Regional averages` currently use that same normalized series.

## Important Product Decision

The user wants:

- `Latency over time` chart:
  keep grouping/bucketing for readability

- `Provider ranking` and `Regional averages` `All` row:
  use **true pooled metrics from raw samples**, especially true pooled `p95`

That means:

- chart aggregation and summary aggregation must be separate
- grouped chart data should **not** be reused to compute all-region summary `avg`/`p95`

## Why This Matters

The current implementation is internally consistent, but in `All regions` it computes latency summaries from a normalized series:

- one value per `(minute, provider)`
- each value is the average across regions for that minute/provider

This is valid as a defined metric, but it is **not** the true pooled `p95` of all raw requests across all regions.

The user explicitly wants the true pooled version for summary views.

## Required Behavior After The Fix

### Keep

- Per-region rows in `Regional averages` should continue to come from SQL grouped by `(region, provider)`.
- `Latency over time` should continue to use raw `/api/timeseries` points and minute bucketing only for chart rendering.

### Change

- In `All regions`, `Provider ranking` must use SQL-backed pooled provider stats across all regions.
- In `All regions`, the `All` row in `Regional averages` must use SQL-backed pooled provider stats across all regions.
- These pooled stats must be computed from raw `benchmarks` rows over the selected time window, not from averaged per-region or per-minute values.

## Recommended Implementation

### 1. Extend `/api/latest`

Current endpoint:

- [packages/dashboard/src/api/routes.ts](/Users/Greg/Desktop/crypto/rpc-monitor/packages/dashboard/src/api/routes.ts)
- [packages/dashboard/src/api/queries.ts](/Users/Greg/Desktop/crypto/rpc-monitor/packages/dashboard/src/api/queries.ts)

Extend the query layer so `/api/latest?hours=...` returns two collections built from the same raw window:

- `rows`
  existing per-region provider stats grouped by `(region, provider)`
- `globalRows`
  new pooled provider stats grouped by `(provider)` across all regions

The all-region pooled stats should include at least:

- `provider`
- `avgMs`
- `p50Ms`
- `p95Ms`
- `successRate`
- `sampleCount`
- `successCount`
- `latestAt`

Best place for percentile logic:

- SQL only
- use Postgres `percentile_cont(...)` directly on raw `response_ms`

### 2. Update Types And API Client

Files:

- [packages/dashboard/src/types.ts](/Users/Greg/Desktop/crypto/rpc-monitor/packages/dashboard/src/types.ts)
- [packages/dashboard/src/lib/api.ts](/Users/Greg/Desktop/crypto/rpc-monitor/packages/dashboard/src/lib/api.ts)

Add `globalRows` to the latest-stats response shape.

### 3. Rewire `App.tsx`

File:

- [packages/dashboard/src/App.tsx](/Users/Greg/Desktop/crypto/rpc-monitor/packages/dashboard/src/App.tsx)

Use:

- `rows` for per-region table rows
- `globalRows` for:
  - `Provider ranking` when `selectedRegion === "all"`
  - the `All` row in `Regional averages` when `selectedRegion === "all"`

Keep:

- `/api/timeseries` only for the chart

Do **not** derive summary `avg`/`p95` from the chart’s grouped series anymore.

### 4. Simplify `dashboardMetrics.ts`

File:

- [packages/dashboard/src/lib/dashboardMetrics.ts](/Users/Greg/Desktop/crypto/rpc-monitor/packages/dashboard/src/lib/dashboardMetrics.ts)

Once SQL-backed pooled summaries exist:

- remove client-side pooled summary builders that are no longer needed
- keep only helpers that still earn their keep, likely:
  - chart bucketing / chart data shaping
  - shared ranking types / selector helpers
  - row shaping that is purely presentational

If the file becomes awkward after the change, it is fine to split it into:

- chart helpers
- summary/ranking types/helpers

## Semantics To Preserve

After the change, the chart may not numerically match the ranking/table in `All regions`, and that is acceptable because they answer different questions:

- chart:
  minute-normalized cross-region latency over time for readability
- ranking / `All` row:
  true pooled latency distribution over the selected window

This difference is expected and should not be “fixed” by making them share the same grouped data again.

## Files Most Relevant To The Work

- [packages/dashboard/src/api/queries.ts](/Users/Greg/Desktop/crypto/rpc-monitor/packages/dashboard/src/api/queries.ts)
- [packages/dashboard/src/api/routes.ts](/Users/Greg/Desktop/crypto/rpc-monitor/packages/dashboard/src/api/routes.ts)
- [packages/dashboard/src/types.ts](/Users/Greg/Desktop/crypto/rpc-monitor/packages/dashboard/src/types.ts)
- [packages/dashboard/src/lib/api.ts](/Users/Greg/Desktop/crypto/rpc-monitor/packages/dashboard/src/lib/api.ts)
- [packages/dashboard/src/App.tsx](/Users/Greg/Desktop/crypto/rpc-monitor/packages/dashboard/src/App.tsx)
- [packages/dashboard/src/lib/dashboardMetrics.ts](/Users/Greg/Desktop/crypto/rpc-monitor/packages/dashboard/src/lib/dashboardMetrics.ts)
- [packages/dashboard/src/components/GlobalRanking.tsx](/Users/Greg/Desktop/crypto/rpc-monitor/packages/dashboard/src/components/GlobalRanking.tsx)

## Validation Checklist

- `bun run check:dashboard`
- `bun run build:dashboard`
- In `All regions`, verify:
  - ranking uses pooled SQL metrics
  - `Regional averages` `All` row uses pooled SQL metrics
  - chart still uses grouped/minute-bucketed data
- In a specific region, verify:
  - ranking uses that region’s data only
  - regional table per-region rows are unchanged

## Notes From Prior Investigation

- Earlier bug: averaging per-region `p95` values is invalid and was removed.
- Earlier bug: `Regional averages` `All` row and `Provider ranking` temporarily used different all-region latency bases; that was fixed before this handoff.
- Current remaining gap is not an internal inconsistency bug. It is a semantics issue: all-region summaries are not yet true pooled raw-sample metrics.
- There is no dedicated test coverage for these aggregation semantics yet. Regression risk would be lower if tests are added around query-layer aggregates and the `All regions` UI behavior.
