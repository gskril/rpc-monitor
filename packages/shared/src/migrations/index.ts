import type { Migration } from "kysely";

import { createBenchmarksMigration } from "./001_create_benchmarks";

export const migrations: Record<string, Migration> = {
  "001_create_benchmarks": createBenchmarksMigration,
};
