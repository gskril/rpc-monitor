import type { ColumnType, Generated } from "kysely";

export interface BenchmarksTable {
  created_at: ColumnType<Date, Date | string | undefined, never>;
  error: string | null;
  id: Generated<number>;
  provider: string;
  region: string;
  response_ms: number;
  success: boolean;
}

export interface Database {
  benchmarks: BenchmarksTable;
}
