export type LatestStat = {
  latestAt: string;
  p50Ms: number | null;
  p95Ms: number | null;
  provider: string;
  region: string;
  sampleCount: number;
  successCount: number;
  successRate: number;
};

export type TimeSeriesPoint = {
  createdAt: string;
  error: string | null;
  provider: string;
  region: string;
  responseMs: number;
  success: boolean;
};

export type LatestStatsResponse = {
  hours: number;
  rows: LatestStat[];
};

export type TimeSeriesResponse = {
  hours: number;
  provider: string | null;
  region: string | null;
  rows: TimeSeriesPoint[];
};
