import {
  Suspense,
  lazy,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";

import { fetchLatest, fetchTimeseries } from "./lib/api";
import type { LatestStat, TimeSeriesPoint } from "./types";

const OVERVIEW_WINDOW_HOURS = 1;
const DEFAULT_TIMESERIES_HOURS = 6;

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
  const [overviewRows, setOverviewRows] = useState<LatestStat[]>([]);
  const [timeseriesRows, setTimeseriesRows] = useState<TimeSeriesPoint[]>([]);
  const [providerRows, setProviderRows] = useState<TimeSeriesPoint[]>([]);
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [timeseriesHours, setTimeseriesHours] = useState(DEFAULT_TIMESERIES_HOURS);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [timeseriesLoading, setTimeseriesLoading] = useState(false);
  const [providerRowsLoading, setProviderRowsLoading] = useState(false);

  const deferredRegion = useDeferredValue(selectedRegion);
  const deferredProvider = useDeferredValue(selectedProvider);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setOverviewLoading(true);
      setDashboardError(null);

      try {
        const overview = await fetchLatest(OVERVIEW_WINDOW_HOURS);

        if (cancelled) {
          return;
        }

        setOverviewRows(overview.rows);

        if (overview.rows.length > 0) {
          const firstRow = overview.rows[0];

          if (!firstRow) {
            return;
          }

          startTransition(() => {
            setSelectedRegion((current) => current || firstRow.region);
            setSelectedProvider((current) => current || firstRow.provider);
          });
        }
      } catch (error) {
        if (!cancelled) {
          setDashboardError(formatError(error));
        }
      } finally {
        if (!cancelled) {
          setOverviewLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!deferredRegion) {
      return;
    }

    let cancelled = false;

    async function loadTimeseries() {
      setTimeseriesLoading(true);
      setDashboardError(null);

      try {
        const response = await fetchTimeseries({
          hours: timeseriesHours,
          region: deferredRegion,
        });

        if (!cancelled) {
          setTimeseriesRows(response.rows);
        }
      } catch (error) {
        if (!cancelled) {
          setDashboardError(formatError(error));
        }
      } finally {
        if (!cancelled) {
          setTimeseriesLoading(false);
        }
      }
    }

    void loadTimeseries();

    return () => {
      cancelled = true;
    };
  }, [deferredRegion, timeseriesHours]);

  useEffect(() => {
    if (!deferredProvider) {
      setProviderRows([]);
      return;
    }

    let cancelled = false;

    async function loadProviderRows() {
      setProviderRowsLoading(true);
      setDashboardError(null);

      try {
        const response = await fetchTimeseries({
          hours: timeseriesHours,
          provider: deferredProvider,
        });

        if (!cancelled) {
          setProviderRows(response.rows);
        }
      } catch (error) {
        if (!cancelled) {
          setDashboardError(formatError(error));
        }
      } finally {
        if (!cancelled) {
          setProviderRowsLoading(false);
        }
      }
    }

    void loadProviderRows();

    return () => {
      cancelled = true;
    };
  }, [deferredProvider, timeseriesHours]);

  const regions = useMemo(() => uniqueValues(overviewRows.map((row) => row.region)), [overviewRows]);

  const providers = useMemo(
    () => uniqueValues(overviewRows.map((row) => row.provider)),
    [overviewRows],
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
  }, [timeseriesRows]);

  const regionLatencyRows = useMemo<RegionLatencyRow[]>(
    () =>
      regions.map((region) => {
        const rows = providerRows.filter((row) => row.region === region);
        const successfulRows = rows.filter((row) => row.success);
        const totalLatency = successfulRows.reduce((sum, row) => sum + row.responseMs, 0);
        const latestAt =
          rows.length > 0
            ? rows.reduce((latest, row) => {
                if (!latest) {
                  return row.createdAt;
                }

                return Date.parse(row.createdAt) > Date.parse(latest) ? row.createdAt : latest;
              }, "" as string)
            : null;

        const sortedMs = successfulRows.map((row) => row.responseMs).sort((a, b) => a - b);
        const p95Index = Math.ceil(sortedMs.length * 0.95) - 1;
        const p95Ms = sortedMs.length > 0 ? sortedMs[Math.max(0, p95Index)]! : null;

        return {
          averageLatencyMs: successfulRows.length
            ? Math.round(totalLatency / successfulRows.length)
            : null,
          failedCount: rows.length - successfulRows.length,
          latestAt,
          p95Ms: p95Ms !== null ? Math.round(p95Ms) : null,
          region,
          sampleCount: rows.length,
          successRate: rows.length ? (successfulRows.length / rows.length) * 100 : null,
        };
      }),
    [providerRows, regions],
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

      {dashboardError ? <p className="banner error">{dashboardError}</p> : null}
      {overviewLoading ? <p className="banner">Loading benchmark data...</p> : null}

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
              All providers in {selectedRegion || "..."} &middot; {timeseriesHours}h window
            </p>
          </div>
          <span className="chip">
            {timeseriesLoading ? "Refreshing..." : selectedProvider || "All"}
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
            {providerRowsLoading ? "Refreshing..." : `${regionLatencyRows.length} regions`}
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
                  className={row.region === selectedRegion ? "selected-row" : undefined}
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

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}
