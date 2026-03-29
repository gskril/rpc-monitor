import type { Migration } from "kysely";

import { createBenchmarksMigration } from "./001_create_benchmarks";
import { addCoveringIndexesMigration } from "./002_add_covering_indexes";

export const migrations: Record<string, Migration> = {
  "001_create_benchmarks": createBenchmarksMigration,
  "002_add_covering_indexes": addCoveringIndexesMigration,
};
