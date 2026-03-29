import {
  Suspense,
  lazy,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchLatest, fetchTimeseries } from "./lib/api";

const DEFAULT_TIMESERIES_HOURS = 6;
const ALL_REGIONS = "all";

const absoluteDateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const compactTime = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const LatencyChart = lazy(() => import("./components/LatencyChart"));

type ChartDatum = {
  createdAt: string;
  failedProviders: string[];
  tickLabel: string;
} & Record<string, number | string | string[] | null>;

type RegionLatencyRow = {
  averageLatencyMs: number | null;
  failedCount: number;
  latestAt: string | null;
  p95Ms: number | null;
  region: string;
  sampleCount: number;
  successRate: number | null;
};

export default function App() {
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [timeseriesHours, setTimeseriesHours] = useState(DEFAULT_TIMESERIES_HOURS);

  const deferredRegion = useDeferredValue(selectedRegion);
  const deferredProvider = useDeferredValue(selectedProvider);

  const regionalStatsQuery = useQuery({
    queryKey: ["latest", timeseriesHours],
    queryFn: () => fetchLatest(timeseriesHours),
  });

  const regionalStats = regionalStatsQuery.data?.rows ?? [];

  // Seed the default selections from the same window used elsewhere in the dashboard.
  useEffect(() => {
    if (regionalStats.length > 0 && !selectedRegion) {
      const firstRow = regionalStats[0];
      if (!firstRow) return;

      startTransition(() => {
        setSelectedRegion((current) => current || ALL_REGIONS);
        setSelectedProvider((current) => current || firstRow.provider);
      });
    }
  }, [regionalStats, selectedRegion]);

  const timeseriesQuery = useQuery({
    queryKey: ["timeseries", deferredRegion, timeseriesHours],
    queryFn: () => {
      const params = deferredRegion === ALL_REGIONS
        ? { hours: timeseriesHours }
        : { hours: timeseriesHours, region: deferredRegion };
      return fetchTimeseries(params);
    },
    enabled: !!deferredRegion,
  });

  const timeseriesRows = timeseriesQuery.data?.rows ?? [];
  const dashboardError = timeseriesQuery.error ?? regionalStatsQuery.error;

  const regions = useMemo(
    () => uniqueValues(regionalStats.map((row) => row.region)),
    [regionalStats],
  );

  const providers = useMemo(
    () => uniqueValues(regionalStats.map((row) => row.provider)),
    [regionalStats],
  );

  useEffect(() => {
    if (providers.includes(selectedProvider)) {
      return;
    }

    startTransition(() => {
      setSelectedProvider(providers[0] ?? "");
    });
  }, [providers, selectedProvider]);

  const chartProviders = useMemo(
    () => uniqueValues(timeseriesRows.map((row) => row.provider)),
    [timeseriesRows],
  );

  const chartData = useMemo<ChartDatum[]>(() => {
    const isAll = selectedRegion === ALL_REGIONS;

    if (!isAll) {
      const points = new Map<string, ChartDatum>();

      for (const row of timeseriesRows) {
        const existing = points.get(row.createdAt);
        const point =
          existing ??
          {
            createdAt: row.createdAt,
            failedProviders: [],
            tickLabel: compactTime.format(new Date(row.createdAt)),
          };

        point[row.provider] = row.success ? row.responseMs : null;

        if (!row.success && !point.failedProviders.includes(row.provider)) {
          point.failedProviders = [...point.failedProviders, row.provider];
        }

        points.set(row.createdAt, point);
      }

      return Array.from(points.values()).sort(
        (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
      );
    }

    // When "all" is selected, average latency across regions per (timestamp, provider)
    const grouped = new Map<string, Map<string, { total: number; count: number; failed: boolean }>>();

    for (const row of timeseriesRows) {
      let providerMap = grouped.get(row.createdAt);
      if (!providerMap) {
        providerMap = new Map();
        grouped.set(row.createdAt, providerMap);
      }

      const existing = providerMap.get(row.provider);
      if (row.success) {
        if (existing) {
          existing.total += row.responseMs;
          existing.count += 1;
        } else {
          providerMap.set(row.provider, { total: row.responseMs, count: 1, failed: false });
        }
      } else {
        if (existing) {
          existing.failed = true;
        } else {
          providerMap.set(row.provider, { total: 0, count: 0, failed: true });
        }
      }
    }

    const points: ChartDatum[] = [];
    for (const [createdAt, providerMap] of grouped) {
      const point: ChartDatum = {
        createdAt,
        failedProviders: [],
        tickLabel: compactTime.format(new Date(createdAt)),
      };

      for (const [provider, stats] of providerMap) {
        point[provider] = stats.count > 0 ? Math.round(stats.total / stats.count) : null;
        if (stats.failed && stats.count === 0) {
          point.failedProviders = [...point.failedProviders, provider];
        }
      }

      points.push(point);
    }

    return points.sort(
      (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
    );
  }, [timeseriesRows, selectedRegion]);

  const regionLatencyRows = useMemo<RegionLatencyRow[]>(
    () =>
      regionalStats
        .filter((row) => row.provider === deferredProvider)
        .map((row) => ({
          averageLatencyMs: row.avgMs,
          failedCount: row.sampleCount - row.successCount,
          latestAt: row.latestAt,
          p95Ms: row.p95Ms,
          region: row.region,
          sampleCount: row.sampleCount,
          successRate: row.successRate,
        })),
    [regionalStats, deferredProvider],
  );

  return (
    <main className="page-shell">
      <header className="header">
        <div className="header-left">
          <span className="header-tag">RPC Monitor</span>
          <h1>RPC Provider Benchmarks</h1>
          <p className="header-note">All checks use the same <code>eth_call</code> to the ENS Universal Resolver</p>
        </div>
        <div className="header-metrics">
          <div className="header-metric">
            <span>Providers</span>
            <strong>{providers.length}</strong>
          </div>
          <div className="header-metric">
            <span>Regions</span>
            <strong>{regions.length}</strong>
          </div>
        </div>
      </header>

      {dashboardError ? <p className="banner error">{dashboardError.message}</p> : null}
      {regionalStatsQuery.isLoading ? <p className="banner">Loading benchmark data...</p> : null}

      <div className="card">
        <div className="toolbar">
          <div className="toolbar-group">
            <span className="toolbar-label">Region</span>
            <select
              value={selectedRegion}
              onChange={(event) => {
                startTransition(() => setSelectedRegion(event.target.value));
              }}
            >
              <option value={ALL_REGIONS}>All regions</option>
              {regions.map((region) => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </div>

          <div className="toolbar-sep" />

          <div className="toolbar-group">
            <span className="toolbar-label">Provider</span>
            <select
              value={selectedProvider}
              onChange={(event) => {
                startTransition(() => setSelectedProvider(event.target.value));
              }}
            >
              {providers.map((provider) => (
                <option key={provider} value={provider}>{provider}</option>
              ))}
            </select>
          </div>

          <div className="toolbar-sep" />

          <div className="toolbar-group">
            <span className="toolbar-label">Window</span>
            <select
              value={String(timeseriesHours)}
              onChange={(event) => {
                startTransition(() => setTimeseriesHours(Number(event.target.value)));
              }}
            >
              {[1, 3, 6, 12, 24, 72].map((hours) => (
                <option key={hours} value={hours}>Last {hours}h</option>
              ))}
            </select>
          </div>
        </div>

        <div className="section-header">
          <div>
            <h2 className="section-title">Latency over time</h2>
            <p className="section-subtitle">
              All providers{selectedRegion === ALL_REGIONS ? " averaged across all regions" : ` in ${selectedRegion || "..."}`} &middot; {timeseriesHours}h window
            </p>
          </div>
          <span className="chip">
            {timeseriesQuery.isFetching ? "Refreshing..." : selectedProvider || "All"}
          </span>
        </div>

        <div className="chart-shell">
          <Suspense fallback={<p className="chart-loading">Loading chart...</p>}>
            <LatencyChart
              chartData={chartData}
              highlightedProvider={selectedProvider}
              providerKeys={chartProviders}
            />
          </Suspense>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <div>
            <h2 className="section-title">Regional averages</h2>
            <p className="section-subtitle">
              {selectedProvider || "..."} across all regions &middot; {timeseriesHours}h window
            </p>
          </div>
          <span className="chip">
            {regionalStatsQuery.isFetching ? "Refreshing..." : `${regionLatencyRows.length} regions`}
          </span>
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Region</th>
                <th>Avg latency</th>
                <th>p95</th>
                <th>Success rate</th>
                <th>Samples</th>
                <th>Failures</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {regionLatencyRows.map((row) => (
                <tr
                  key={row.region}
                  className={row.region === selectedRegion && selectedRegion !== ALL_REGIONS ? "selected-row" : undefined}
                >
                  <td>{row.region}</td>
                  <td>{row.averageLatencyMs !== null ? `${row.averageLatencyMs} ms` : "--"}</td>
                  <td>{row.p95Ms !== null ? `${row.p95Ms} ms` : "--"}</td>
                  <td>
                    {row.successRate !== null ? (
                      <span className={rateClass(row.successRate)}>
                        {row.successRate.toFixed(1)}%
                      </span>
                    ) : "--"}
                  </td>
                  <td>{row.sampleCount}</td>
                  <td>{row.failedCount || "--"}</td>
                  <td>{row.latestAt ? absoluteDateTime.format(new Date(row.latestAt)) : "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function rateClass(rate: number): string {
  if (rate >= 99) return "rate-good";
  if (rate >= 90) return "rate-warn";
  return "rate-bad";
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}
