import { createDatabase, destroyDatabase, migrateToLatest, sql } from "@ens-monitor/shared";
import type { LatestStat, TimeSeriesPoint } from "../types";

let databasePromise: Promise<ReturnType<typeof createDatabase>> | undefined;

export async function latestStats(hours: number): Promise<LatestStat[]> {
  const db = await getDatabase();

  const result = await sql<LatestStatsRow>`
    with windowed as (
      select
        region,
        provider,
        response_ms,
        success,
        created_at
      from benchmarks
      where created_at >= now() - make_interval(hours => ${hours})
    ),
    availability as (
      select
        region,
        provider,
        round(avg(case when success then 1.0 else 0.0 end) * 100, 2) as success_rate,
        count(*)::int as sample_count,
        count(*) filter (where success)::int as success_count,
        max(created_at) as latest_at
      from windowed
      group by region, provider
    ),
    latency as (
      select
        region,
        provider,
        round(percentile_cont(0.50) within group (order by response_ms))::int as p50_ms,
        round(percentile_cont(0.95) within group (order by response_ms))::int as p95_ms
      from windowed
      where success
      group by region, provider
    )
    select
      availability.region,
      availability.provider,
      latency.p50_ms,
      latency.p95_ms,
      availability.success_rate,
      availability.sample_count,
      availability.success_count,
      availability.latest_at
    from availability
    left join latency
      on latency.region = availability.region
     and latency.provider = availability.provider
    order by availability.region asc, availability.provider asc
  `.execute(db);

  return result.rows.map(mapLatestRow);
}

export async function timeSeries(params: {
  hours: number;
  provider: string | undefined;
  region: string | undefined;
}): Promise<TimeSeriesPoint[]> {
  const db = await getDatabase();
  let query = db
    .selectFrom("benchmarks")
    .select([
      "created_at",
      "error",
      "provider",
      "region",
      "response_ms",
      "success",
    ])
    .where("created_at", ">=", sql<Date>`now() - make_interval(hours => ${params.hours})`)
    .orderBy("created_at asc");

  if (params.provider) {
    query = query.where("provider", "=", params.provider);
  }

  if (params.region) {
    query = query.where("region", "=", params.region);
  }

  const rows = await query.execute();

  return rows.map(mapTimeSeriesRow);
}

export async function initDatabase() {
  await getDatabase();
}

export async function closeSqlClient() {
  if (databasePromise) {
    const db = await databasePromise;
    databasePromise = undefined;
    await destroyDatabase(db);
  }
}

type LatestStatsRow = {
  latest_at: Date;
  p50_ms: number | null;
  p95_ms: number | null;
  provider: string;
  region: string;
  sample_count: number;
  success_count: number;
  success_rate: string | number;
};

type TimeSeriesRow = {
  created_at: Date;
  error: string | null;
  provider: string;
  region: string;
  response_ms: number;
  success: boolean;
};

function getDatabase() {
  if (!databasePromise) {
    const databaseUrl = process.env.DATABASE_URL?.trim();

    if (!databaseUrl) {
      throw new Error("Missing required environment variable: DATABASE_URL");
    }

    databasePromise = (async () => {
      const db = createDatabase({
        databaseUrl,
        maxConnections: 5,
      });

      await migrateToLatest(db);

      return db;
    })();
  }

  return databasePromise;
}

function mapLatestRow(row: LatestStatsRow): LatestStat {
  return {
    latestAt: row.latest_at.toISOString(),
    p50Ms: row.p50_ms,
    p95Ms: row.p95_ms,
    provider: row.provider,
    region: row.region,
    sampleCount: row.sample_count,
    successCount: row.success_count,
    successRate: Number(row.success_rate),
  };
}

function mapTimeSeriesRow(row: TimeSeriesRow): TimeSeriesPoint {
  return {
    createdAt: row.created_at.toISOString(),
    error: row.error,
    provider: row.provider,
    region: row.region,
    responseMs: row.response_ms,
    success: row.success,
  };
}
