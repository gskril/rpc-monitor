import { type createDatabase } from "@rpc-monitor/shared";

import type { ProviderBenchmark } from "./index";

export async function insertBenchmarks(
  db: ReturnType<typeof createDatabase>,
  benchmarks: ProviderBenchmark[],
) {
  if (benchmarks.length === 0) {
    return;
  }

  await db
    .insertInto("benchmarks")
    .values(
      benchmarks.map((benchmark) => ({
        error: benchmark.error,
        provider: benchmark.provider,
        region: benchmark.region,
        response_ms: benchmark.responseMs,
        success: benchmark.success,
      })),
    )
    .execute();
}
