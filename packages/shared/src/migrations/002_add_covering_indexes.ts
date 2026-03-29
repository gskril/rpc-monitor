import { sql, type Migration } from "kysely";

export const addCoveringIndexesMigration: Migration = {
  async up(db) {
    // Covering index for latestStats query: enables index-only scans on the
    // windowed CTE that filters by created_at and reads region, provider,
    // success, and response_ms.  Replaces the old created_at-only index.
    await sql`
      create index concurrently if not exists idx_benchmarks_created_at_covering
      on benchmarks (created_at desc)
      include (region, provider, success, response_ms)
    `.execute(db);

    await sql`
      drop index if exists idx_benchmarks_created_at
    `.execute(db);

    // Composite index for timeSeries filtered queries (provider + optional
    // region + time range).  Replaces the old (region, provider) index.
    await sql`
      create index concurrently if not exists idx_benchmarks_provider_region_created_at
      on benchmarks (provider, region, created_at desc)
      include (success, response_ms, error)
    `.execute(db);

    await sql`
      drop index if exists idx_benchmarks_region_provider
    `.execute(db);
  },

  async down(db) {
    // Restore original indexes
    await sql`
      create index if not exists idx_benchmarks_created_at
      on benchmarks (created_at desc)
    `.execute(db);

    await sql`
      create index if not exists idx_benchmarks_region_provider
      on benchmarks (region, provider)
    `.execute(db);

    await sql`
      drop index if exists idx_benchmarks_provider_region_created_at
    `.execute(db);

    await sql`
      drop index if exists idx_benchmarks_created_at_covering
    `.execute(db);
  },
};
