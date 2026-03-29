import { sql, type Migration } from "kysely";

export const createBenchmarksMigration: Migration = {
  async up(db) {
    await sql`
      create table if not exists benchmarks (
        id serial primary key,
        region text not null,
        provider text not null,
        response_ms integer not null,
        success boolean not null,
        error text,
        created_at timestamptz default now()
      )
    `.execute(db);

    await sql`
      create index if not exists idx_benchmarks_created_at
      on benchmarks (created_at desc)
    `.execute(db);

    await sql`
      create index if not exists idx_benchmarks_region_provider
      on benchmarks (region, provider)
    `.execute(db);
  },

  async down(db) {
    await sql`
      drop index if exists idx_benchmarks_region_provider
    `.execute(db);

    await sql`
      drop index if exists idx_benchmarks_created_at
    `.execute(db);

    await sql`
      drop table if exists benchmarks
    `.execute(db);
  },
};
