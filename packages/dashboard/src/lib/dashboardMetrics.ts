import type { LatestStat, TimeSeriesPoint } from "../types";

const ALL_REGIONS = "all";

export type ChartDatum = {
  createdAt: string;
  epoch: number;
  failedProviders: string[];
  tickLabel: string;
} & Record<string, number | string | string[] | null>;

export type RegionLatencyRow = {
  averageLatencyMs: number | null;
  failedCount: number;
  isAggregate?: boolean;
  latestAt: string | null;
  p95Ms: number | null;
  region: string;
  sampleCount: number;
  successRate: number | null;
};

export type RankingMetric = "avg" | "p95";

export type RankedProvider = {
  avgMs: number | null;
  p95Ms: number | null;
  provider: string;
  successRate: number;
};

type AllRegionProviderPoint = {
  avgMs: number;
  createdAt: string;
  provider: string;
};

type AllRegionSamples = {
  chartData: ChartDatum[];
  providerPoints: AllRegionProviderPoint[];
};

export function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right),
  );
}

export function getRankingValue(
  row: RankedProvider,
  metric: RankingMetric,
): number | null {
  return metric === "avg" ? row.avgMs : row.p95Ms;
}

export function buildChartData(params: {
  rows: TimeSeriesPoint[];
  selectedRegion: string;
  tickFormatter: Intl.DateTimeFormat;
}): {
  allRegionSamples: AllRegionSamples;
  chartData: ChartDatum[];
} {
  const allRegionSamples = aggregateRowsAcrossRegions(
    params.rows,
    params.tickFormatter,
  );

  if (params.selectedRegion === ALL_REGIONS) {
    return {
      allRegionSamples,
      chartData: allRegionSamples.chartData,
    };
  }

  const points = new Map<string, ChartDatum>();

  for (const row of params.rows) {
    const existing = points.get(row.createdAt);
    const point = existing ?? {
      createdAt: row.createdAt,
      epoch: Date.parse(row.createdAt),
      failedProviders: [],
      tickLabel: params.tickFormatter.format(new Date(row.createdAt)),
    };

    point[row.provider] = row.success ? row.responseMs : null;

    if (!row.success && !point.failedProviders.includes(row.provider)) {
      point.failedProviders = [...point.failedProviders, row.provider];
    }

    points.set(row.createdAt, point);
  }

  return {
    allRegionSamples,
    chartData: Array.from(points.values()).sort(compareByCreatedAt),
  };
}

export function buildRankedProviders(params: {
  allRegionSamples: AllRegionSamples;
  rows: TimeSeriesPoint[];
  selectedRegion: string;
}): RankedProvider[] {
  const latencyByProvider = new Map<string, { responseTimes: number[] }>();
  const availabilityByProvider = new Map<
    string,
    { sampleCount: number; successCount: number }
  >();

  const latencyRows =
    params.selectedRegion === ALL_REGIONS
      ? params.allRegionSamples.providerPoints.map((row) => ({
          provider: row.provider,
          responseMs: row.avgMs,
        }))
      : params.rows;

  for (const row of latencyRows) {
    const existing = latencyByProvider.get(row.provider);
    if (existing) {
      existing.responseTimes.push(row.responseMs);
    } else {
      latencyByProvider.set(row.provider, {
        responseTimes: [row.responseMs],
      });
    }
  }

  for (const row of params.rows) {
    const existing = availabilityByProvider.get(row.provider);
    if (existing) {
      existing.sampleCount += 1;
      if (row.success) {
        existing.successCount += 1;
      }
    } else {
      availabilityByProvider.set(row.provider, {
        sampleCount: 1,
        successCount: row.success ? 1 : 0,
      });
    }
  }

  return Array.from(latencyByProvider.entries()).map(([provider, stats]) => {
    const availability = availabilityByProvider.get(provider);
    return {
      avgMs: averageRounded(stats.responseTimes),
      p95Ms: percentileCont(stats.responseTimes, 0.95),
      provider,
      successRate: availability
        ? (availability.successCount / availability.sampleCount) * 100
        : 0,
    };
  });
}

export function buildAggregateProviderRow(params: {
  allRegionSamples: AllRegionSamples;
  rows: TimeSeriesPoint[];
  selectedProvider: string;
  selectedRegion: string;
}): RegionLatencyRow | null {
  if (params.selectedRegion !== ALL_REGIONS) {
    return null;
  }

  const normalizedRows = params.allRegionSamples.providerPoints
    .filter((row) => row.provider === params.selectedProvider)
    .map((row) => ({
      createdAt: row.createdAt,
      responseMs: row.avgMs,
    }));

  const availabilityRows = params.rows.filter(
    (row) => row.provider === params.selectedProvider,
  );

  if (!normalizedRows.length && !availabilityRows.length) {
    return null;
  }

  const latestAt = latestIso(normalizedRows.map((row) => row.createdAt));
  const responseTimes = normalizedRows.map((row) => row.responseMs);
  const successCount = availabilityRows.filter((row) => row.success).length;
  const sampleCount = availabilityRows.length;

  return {
    averageLatencyMs: averageRounded(responseTimes),
    failedCount: sampleCount - successCount,
    isAggregate: true,
    latestAt,
    p95Ms: percentileCont(responseTimes, 0.95),
    region: "All",
    sampleCount,
    successRate: sampleCount > 0 ? (successCount / sampleCount) * 100 : null,
  };
}

export function buildRegionLatencyRows(params: {
  aggregateProviderRow: RegionLatencyRow | null;
  regionalStats: LatestStat[];
  selectedProvider: string;
}): RegionLatencyRow[] {
  const providerRows = params.regionalStats
    .filter((row) => row.provider === params.selectedProvider)
    .map((row) => ({
      averageLatencyMs: row.avgMs,
      failedCount: row.sampleCount - row.successCount,
      latestAt: row.latestAt,
      p95Ms: row.p95Ms,
      region: row.region,
      sampleCount: row.sampleCount,
      successRate: row.successRate,
    }));

  if (!providerRows.length) {
    return providerRows;
  }

  return params.aggregateProviderRow
    ? [params.aggregateProviderRow, ...providerRows]
    : providerRows;
}

function compareByCreatedAt(
  left: { createdAt: string },
  right: { createdAt: string },
): number {
  return Date.parse(left.createdAt) - Date.parse(right.createdAt);
}

function averageRounded(values: number[]): number | null {
  if (!values.length) {
    return null;
  }

  return Math.round(
    values.reduce((total, value) => total + value, 0) / values.length,
  );
}

function percentileCont(values: number[], percentile: number): number | null {
  if (!values.length) {
    return null;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const position = (sortedValues.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lowerValue = sortedValues[lowerIndex];
  const upperValue = sortedValues[upperIndex];

  if (lowerValue == null || upperValue == null) {
    return null;
  }

  if (lowerIndex === upperIndex) {
    return Math.round(lowerValue);
  }

  const interpolatedValue =
    lowerValue + (upperValue - lowerValue) * (position - lowerIndex);

  return Math.round(interpolatedValue);
}

function latestIso(values: Array<string | null>): string | null {
  return values.reduce<string | null>((latest, value) => {
    if (!value) {
      return latest;
    }

    if (!latest || Date.parse(value) > Date.parse(latest)) {
      return value;
    }

    return latest;
  }, null);
}

function aggregateRowsAcrossRegions(
  rows: TimeSeriesPoint[],
  tickFormatter: Intl.DateTimeFormat,
): AllRegionSamples {
  const grouped = new Map<
    string,
    Map<string, { total: number; count: number; failed: boolean }>
  >();

  for (const row of rows) {
    const rounded = new Date(row.createdAt);
    rounded.setSeconds(0, 0);
    const key = rounded.toISOString();

    let providerMap = grouped.get(key);
    if (!providerMap) {
      providerMap = new Map();
      grouped.set(key, providerMap);
    }

    const existing = providerMap.get(row.provider);
    if (row.success) {
      if (existing) {
        existing.total += row.responseMs;
        existing.count += 1;
      } else {
        providerMap.set(row.provider, {
          total: row.responseMs,
          count: 1,
          failed: false,
        });
      }
    } else if (existing) {
      existing.failed = true;
    } else {
      providerMap.set(row.provider, { total: 0, count: 0, failed: true });
    }
  }

  const chartData: ChartDatum[] = [];
  const providerPoints: AllRegionProviderPoint[] = [];

  for (const [createdAt, providerMap] of grouped) {
    const point: ChartDatum = {
      createdAt,
      epoch: Date.parse(createdAt),
      failedProviders: [],
      tickLabel: tickFormatter.format(new Date(createdAt)),
    };

    for (const [provider, stats] of providerMap) {
      if (stats.count > 0) {
        const avgMs = Math.round(stats.total / stats.count);
        point[provider] = avgMs;
        providerPoints.push({
          avgMs,
          createdAt,
          provider,
        });
      } else {
        point[provider] = null;
      }

      if (stats.failed && stats.count === 0) {
        point.failedProviders = [...point.failedProviders, provider];
      }
    }

    chartData.push(point);
  }

  return {
    chartData: chartData.sort(compareByCreatedAt),
    providerPoints,
  };
}
