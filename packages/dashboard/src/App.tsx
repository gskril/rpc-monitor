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

  const selectedOverview = overviewRows.find(
    (row) => row.region === selectedRegion && row.provider === selectedProvider,
  );

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

        return {
          averageLatencyMs: successfulRows.length
            ? Math.round(totalLatency / successfulRows.length)
            : null,
          failedCount: rows.length - successfulRows.length,
          latestAt,
          region,
          sampleCount: rows.length,
          successRate: rows.length ? (successfulRows.length / rows.length) * 100 : null,
        };
      }),
    [providerRows, regions],
  );

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">ENS Infrastructure Benchmarks</p>
          <h1>Resolution latency by RPC provider and Railway region</h1>
          <p className="hero-copy">
            Tracks real ENS `eth_call` performance for `vitalik.eth` and surfaces the
            latency and availability signals needed to choose the best backend path.
          </p>
        </div>
        <div className="hero-card">
          <Metric
            label="Tracked providers"
            value={String(uniqueValues(overviewRows.map((row) => row.provider)).length)}
          />
          <Metric
            label="Tracked regions"
            value={String(uniqueValues(overviewRows.map((row) => row.region)).length)}
          />
          <Metric
            label="Selected p95"
            value={selectedOverview?.p95Ms ? `${selectedOverview.p95Ms} ms` : "n/a"}
          />
        </div>
      </section>

      {dashboardError ? <p className="banner error">{dashboardError}</p> : null}
      {overviewLoading ? <p className="banner">Loading benchmark data...</p> : null}

      <section className="panel controls-panel">
        <div className="controls-header">
          <h2>Time series filters</h2>
          <p>Compare every provider in one Railway region and inspect regional averages for one selected provider.</p>
        </div>
        <div className="controls-grid">
          <label>
            <span>Region</span>
            <select
              value={selectedRegion}
              onChange={(event) => {
                const nextRegion = event.target.value;
                startTransition(() => {
                  setSelectedRegion(nextRegion);
                });
              }}
            >
              {regions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Provider</span>
            <select
              value={selectedProvider}
              onChange={(event) => {
                const nextProvider = event.target.value;
                startTransition(() => {
                  setSelectedProvider(nextProvider);
                });
              }}
            >
              {providers.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>History window</span>
            <select
              value={String(timeseriesHours)}
              onChange={(event) => {
                startTransition(() => {
                  setTimeseriesHours(Number(event.target.value));
                });
              }}
            >
              {[1, 3, 6, 12, 24, 72].map((hours) => (
                <option key={hours} value={hours}>
                  Last {hours}h
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel chart-panel">
        <div className="panel-header">
          <div>
            <h2>Latency over time</h2>
            <p>
              All providers in {selectedRegion || "a region"} over the last {timeseriesHours} hours
            </p>
          </div>
          <span className="status-chip">
            {timeseriesLoading
              ? "Refreshing…"
              : selectedProvider
                ? `Highlight: ${selectedProvider}`
                : "All providers"}
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
      </section>

      <section className="panel table-panel">
        <div className="panel-header">
          <div>
            <h2>Average latency by region</h2>
            <p>
              Successful-call average for {selectedProvider || "the selected provider"} across every
              Railway region in the last {timeseriesHours} hours.
            </p>
          </div>
          <span className="status-chip">
            {providerRowsLoading ? "Refreshing…" : `${timeseriesHours}h window`}
          </span>
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Region</th>
                <th>Average latency</th>
                <th>Success rate</th>
                <th>Samples</th>
                <th>Failures</th>
                <th>Last sample</th>
              </tr>
            </thead>
            <tbody>
              {regionLatencyRows.map((row) => (
                <tr
                  key={row.region}
                  className={row.region === selectedRegion ? "selected-row" : undefined}
                >
                  <td>{row.region}</td>
                  <td>{row.averageLatencyMs !== null ? `${row.averageLatencyMs} ms` : "n/a"}</td>
                  <td>{row.successRate !== null ? `${row.successRate.toFixed(2)}%` : "n/a"}</td>
                  <td>{row.sampleCount}</td>
                  <td>{row.failedCount}</td>
                  <td>{row.latestAt ? absoluteDateTime.format(new Date(row.latestAt)) : "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
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
